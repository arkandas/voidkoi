import { NextRequest, NextResponse } from 'next/server';
import { rename, rm, stat, writeFile } from 'fs/promises';
import path from 'path';
import { apiError } from '@/lib/api-errors';
import type { ApiErrorCode } from '@/lib/error-codes';
import { BodyTooLarge, readBody } from '@/lib/request';
import { ToolError } from '@/modules/utilikit/lib/tool-error';
import { authorize, jobStatus, RATE_LIMITS, startJob } from '@/modules/utilikit/lib/job-routes';
import { completeJob, failJob, setData, setProgress, trackFiles, type JobData } from '@/modules/utilikit/lib/jobs';
import { sanitizeFilename } from '@/modules/utilikit/lib/media-types';
import {
  IMAGE_DPIS,
  IMAGE_FORMATS,
  MAX_IMAGE_PAGES,
  MAX_MERGE_FILES,
  MAX_PDF_UPLOAD,
  pageRangeLabel,
  parsePageGroups,
  PDF_MODES,
  SPLIT_MODES,
} from '@/modules/utilikit/lib/pdf-pages';
import {
  createWorkDir,
  extractPages,
  mergePdfs,
  readPdfInfo,
  renderPages,
  splitPdf,
  writeZip,
  type OutputFile,
} from '@/modules/utilikit/lib/pdf-tools';
import { tempPath } from '@/modules/utilikit/lib/temp';

/** The form around the files: their part headers, the boundaries and the options. */
const FORM_OVERHEAD = 1024 * 1024;

function pick<T extends string | number>(options: readonly T[], value: unknown, fallback: T): T {
  return options.find(option => String(option) === String(value)) ?? fallback;
}

export async function POST(request: NextRequest) {
  const { userId, response } = await authorize(request, 'media', 'pdf-tools', RATE_LIMITS.converter);
  if (response) return response;

  // The job counts from the start, so the upload does too.
  const started = startJob('pdf', userId);
  if (started.response) return started.response;
  const { job } = started;
  const refuse = (code: ApiErrorCode) => {
    failJob(job, null, code);
    return apiError(code, 400);
  };

  // Read with a hard limit, declared length or not, so the files never sit in memory past it.
  let body: Buffer;
  try {
    body = await readBody(request, MAX_PDF_UPLOAD + FORM_OVERHEAD);
  } catch (error) {
    return refuse(error instanceof BodyTooLarge ? 'fileTooLarge' : 'uploadFailed');
  }

  const bytes = new Uint8Array(body.buffer as ArrayBuffer, body.byteOffset, body.byteLength);
  const form = await new Response(bytes, { headers: { 'Content-Type': request.headers.get('content-type') ?? '' } })
    .formData()
    .catch(() => null);
  if (!form) return refuse('uploadFailed');

  const mode = PDF_MODES.find(option => option === form.get('mode'));
  if (!mode) return refuse('invalidFormat');

  const files = form.getAll('file').filter((entry): entry is File => entry instanceof File);
  if (files.length === 0) return refuse('noFile');
  if (mode === 'merge' && files.length < 2) return refuse('notEnoughFiles');
  if (files.length > (mode === 'merge' ? MAX_MERGE_FILES : 1)) return refuse('tooManyFiles');
  if (files.reduce((total, file) => total + file.size, 0) > MAX_PDF_UPLOAD) return refuse('fileTooLarge');

  const pagesInput = String(form.get('pages') ?? '');
  const splitMode = pick(SPLIT_MODES, form.get('split'), 'every');
  const format = pick(IMAGE_FORMATS, form.get('format'), 'png');
  const dpi = pick(IMAGE_DPIS, form.get('dpi'), 150);
  const baseName = sanitizeFilename(files[0].name.replace(/\.pdf$/i, ''), 'document');
  setData(job, { mode });

  const dir = await createWorkDir();
  const inputs = files.map((_, index) => path.join(dir, `input-${index + 1}.pdf`));

  try {
    for (const [index, file] of files.entries()) await writeFile(inputs[index], Buffer.from(await file.arrayBuffer()));
  } catch (error) {
    await rm(dir, { recursive: true, force: true });
    failJob(job, error, 'uploadFailed');
    return apiError('uploadFailed', 500);
  }

  const finish = async (source: string, outputName: string, data: JobData) => {
    const output = await tempPath(`pdf-${job.id}${path.extname(outputName)}`);
    trackFiles(job, output);
    await rename(source, output);
    completeJob(job, output, { outputName, outputSize: (await stat(output)).size, ...data });
  };

  const bundle = async (parts: OutputFile[], zipName: string, data: JobData) => {
    if (parts.length === 1) return finish(parts[0].path, parts[0].name, data);
    const zip = path.join(dir, 'result.zip');
    await writeZip(parts, zip);
    await finish(zip, zipName, data);
  };

  (async () => {
    const infos = [];
    for (const input of inputs) infos.push(await readPdfInfo(input));
    setProgress(job, 5);

    if (mode === 'merge') {
      const merged = path.join(dir, 'merged.pdf');
      await mergePdfs(inputs, merged);
      const pageCount = infos.reduce((total, info) => total + info.pages, 0);
      return finish(merged, `${baseName}-merged.pdf`, { pageCount, fileCount: files.length });
    }

    const pageCount = infos[0].pages;
    setData(job, { pageCount });

    const every = mode === 'split' && splitMode === 'every';
    const selection = parsePageGroups(every ? '' : pagesInput, pageCount);
    if (!selection.ok) throw new ToolError(selection.error);
    const groups = every ? selection.groups[0].map(page => [page]) : selection.groups;
    const pages = groups.flat();
    const progress = (done: number) => setProgress(job, 5 + (done / groups.length) * 90);

    if (mode === 'extract') {
      const extracted = path.join(dir, 'extracted.pdf');
      await extractPages(inputs[0], pages, dir, extracted);
      return finish(extracted, `${baseName}-${pageRangeLabel(pages)}.pdf`, { outputPages: pages.length });
    }

    if (mode === 'split') {
      const parts = await splitPdf(inputs[0], groups, dir, baseName, progress);
      return bundle(parts, `${baseName}-split.zip`, { fileCount: parts.length });
    }

    if (pages.length > MAX_IMAGE_PAGES[dpi]) throw new ToolError('tooManyPages', `${pages.length} pages at ${dpi} dpi`);
    const images = await renderPages(inputs[0], pages, format, dpi, dir, baseName, done =>
      setProgress(job, 5 + (done / pages.length) * 90),
    );
    return bundle(images, `${baseName}-images.zip`, { fileCount: images.length });
  })()
    .catch(error => {
      console.error('PDF tools error:', error);
      failJob(job, error, 'conversionFailed');
    })
    .finally(() => rm(dir, { recursive: true, force: true }));

  return NextResponse.json({ jobId: job.id, status: job.status });
}

export function GET(request: NextRequest) {
  return jobStatus(request, 'pdf');
}
