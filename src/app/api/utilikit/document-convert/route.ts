import { NextRequest, NextResponse } from 'next/server';
import { rm, stat } from 'fs/promises';
import path from 'path';
import { apiError } from '@/lib/api-errors';
import { ToolError } from '@/modules/utilikit/lib/tool-error';
import {
  detectDocumentFormat,
  DOCUMENT_FORMATS,
  DOCUMENT_SIZE_LIMIT,
  isDocumentFormat,
  isPdfEngine,
} from '@/modules/utilikit/lib/document-formats';
import { authorize, jobStatus, RATE_LIMITS, receiveUpload, startJob } from '@/modules/utilikit/lib/job-routes';
import { completeJob, failJob, setData, setProgress, trackFiles } from '@/modules/utilikit/lib/jobs';
import { convertDocument, extractPdfText, findPdfEngine } from '@/modules/utilikit/lib/pandoc';
import { safeExtension, tempFolder, tempPath } from '@/modules/utilikit/lib/temp';

/** The document is the request's body; its name and the options are in the query string. */
export async function POST(request: NextRequest) {
  const { userId, response } = await authorize(request, 'media', 'document-convert', RATE_LIMITS.converter);
  if (response) return response;

  const params = request.nextUrl.searchParams;
  const name = params.get('name') ?? '';
  const requestedInput = params.get('inputFormat');
  const inputFormat = isDocumentFormat(requestedInput)
    ? requestedInput
    : detectDocumentFormat(name, request.headers.get('content-type') ?? undefined);
  if (!inputFormat) return apiError('unsupportedFormat', 400);

  const outputFormat = params.get('outputFormat') ?? 'docx';
  if (!isDocumentFormat(outputFormat)) return apiError('invalidFormat', 400);
  if (inputFormat === outputFormat) return apiError('sameFormat', 400);

  const requestedEngine = params.get('pdfEngine');
  const options = {
    standalone: params.get('standalone') === 'true',
    toc: params.get('toc') === 'true',
    preferredEngine: isPdfEngine(requestedEngine) ? requestedEngine : undefined,
  };

  const started = startJob('document', userId, { inputFormat, outputFormat });
  if (started.response) return started.response;
  const { job } = started;

  // The job's own folder, where pandoc and the PDF engine work: nothing of other jobs is in reach.
  const dir = await tempFolder(`doc-${job.id}-`);
  const inputPath = path.join(dir, `input.${safeExtension(name, inputFormat)}`);
  const outputPath = await tempPath(`doc-output-${job.id}${DOCUMENT_FORMATS[outputFormat].extensions[0]}`);
  trackFiles(job, outputPath);

  const inputSize = await receiveUpload(request, inputPath, DOCUMENT_SIZE_LIMIT);
  if (inputSize instanceof Response) {
    await rm(dir, { recursive: true, force: true });
    failJob(job, null, 'uploadFailed');
    return inputSize;
  }
  setData(job, { inputSize });

  (async () => {
    let sourcePath = inputPath;
    let sourceFormat: string = DOCUMENT_FORMATS[inputFormat].pandocFormat;

    if (inputFormat === 'pdf') {
      sourcePath = path.join(dir, 'extracted.txt');
      await extractPdfText(inputPath, sourcePath);
      sourceFormat = 'markdown';
      setProgress(job, 50);
    } else if (inputFormat === 'txt') {
      sourceFormat = 'markdown';
    }

    const pdfEngine = outputFormat === 'pdf' ? await findPdfEngine(options.preferredEngine) : undefined;
    if (pdfEngine === null) throw new ToolError('pdfEngineMissing');

    await convertDocument(
      sourcePath,
      outputPath,
      { inputFormat: sourceFormat, outputFormat, standalone: options.standalone, toc: options.toc, pdfEngine },
      dir,
    );

    completeJob(job, outputPath, { outputSize: (await stat(outputPath)).size, pdfEngine });
  })()
    .catch(error => {
      console.error('Document conversion error:', error);
      failJob(job, error, 'conversionFailed');
    })
    .finally(() => rm(dir, { recursive: true, force: true }));

  return NextResponse.json({ jobId: job.id, status: job.status });
}

export function GET(request: NextRequest) {
  return jobStatus(request, 'document');
}
