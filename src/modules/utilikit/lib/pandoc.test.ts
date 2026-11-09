import { spawnSync } from 'child_process';
import { mkdtemp, readFile, rm, stat, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import path from 'path';
import { unzipSync } from 'fflate';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildPandocArgs, buildTypstArgs, classifyPandocError, extractPdfText, findPdfEngine, runPandoc } from '@/modules/utilikit/lib/pandoc';

const hasPandoc = spawnSync('pandoc', ['--version']).status === 0;
const hasTypst = spawnSync('typst', ['--version']).status === 0;
const hasPdftotext = spawnSync('pdftotext', ['-v']).status === 0;

describe('buildPandocArgs', () => {
  it('passes formats, options and paths in order', () => {
    expect(buildPandocArgs('in.html', 'out.docx', { inputFormat: 'html', outputFormat: 'docx', standalone: true, toc: true })).toEqual([
      '--sandbox', '-f', 'html', '-t', 'docx', '--standalone', '--toc', '-o', 'out.docx', 'in.html',
    ]);
  });

  it('maps plain text output to pandoc plain', () => {
    expect(buildPandocArgs('in.docx', 'out.txt', { inputFormat: 'docx', outputFormat: 'txt', standalone: false, toc: false })).toEqual([
      '--sandbox', '-f', 'docx', '-t', 'plain', '-o', 'out.txt', 'in.docx',
    ]);
  });

  it('always runs pandoc in its sandbox', () => {
    for (const outputFormat of ['docx', 'html', 'markdown', 'pdf', 'txt'] as const) {
      expect(buildPandocArgs('in', 'out', { inputFormat: 'docx', outputFormat, standalone: false, toc: false, pdfEngine: 'typst' })[0]).toBe('--sandbox');
    }
  });

  it('reads Markdown without raw TeX, typst or HTML', () => {
    const args = buildPandocArgs('in.md', 'out.pdf', { inputFormat: 'markdown', outputFormat: 'pdf', standalone: true, toc: false, pdfEngine: 'typst' });
    expect(args[args.indexOf('-f') + 1]).toBe('markdown-raw_tex-raw_attribute-raw_html');
  });

  it('writes typst source for a PDF, never through pandoc\'s own PDF step', () => {
    const pdf = buildPandocArgs('in.md', 'document.typ', { inputFormat: 'markdown', outputFormat: 'pdf', standalone: false, toc: false, pdfEngine: 'typst' });
    expect(pdf.slice(pdf.indexOf('-t'), pdf.indexOf('-t') + 2)).toEqual(['-t', 'typst']);
    expect(pdf).toContain('--standalone');
    expect(pdf.some(arg => arg.startsWith('--pdf-engine'))).toBe(false);
  });

  it('lets typst read only the job\'s own folder', () => {
    expect(buildTypstArgs('/tmp/job/document.typ', '/tmp/out.pdf', '/tmp/job')).toEqual(['compile', '--root', '/tmp/job', '/tmp/job/document.typ', '/tmp/out.pdf']);
  });
});

describe('classifyPandocError', () => {
  it('recognises PDF engine failures', () => {
    expect(classifyPandocError('typst: error: unknown variable', 83).code).toBe('pdfEngineError');
  });

  it('treats anything else as an unreadable document, and keeps the cause for the log only', () => {
    const error = classifyPandocError('[WARNING] Could not fetch resource /data/x.png\nError at "source" (line 3, column 1):\nunexpected end of input', 64);
    expect(error.code).toBe('documentCorrupted');
    expect(error.detail).toBe('pandoc exited with code 64');
    expect(error.message).toContain('Error at "source" (line 3, column 1): unexpected end of input');
  });

  it('logs the LaTeX error lines of a long log', () => {
    const log = ['This is XeTeX', '(./input.tex', 'Error producing PDF.', '! Undefined control sequence.', 'l.45 \\foo'].join('\n');
    expect(classifyPandocError(log, 43).message).toContain('Error producing PDF. ! Undefined control sequence. l.45 \\foo');
  });

  it('keeps the log short', () => {
    expect(classifyPandocError('x'.repeat(5000), 1).message.length).toBeLessThanOrEqual(400);
  });
});

describe.skipIf(!hasPandoc)('pandoc integration', () => {
  let dir: string;
  let markdown: string;

  beforeAll(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'utilikit-pandoc-'));
    markdown = path.join(dir, 'doc.md');
    await writeFile(markdown, '# Título\n\nCanción con **ñ** y `código`.\n\n| a | b |\n|---|---|\n| 1 | 2 |\n');
  });

  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('converts Markdown to standalone HTML', async () => {
    const output = path.join(dir, 'doc.html');
    await runPandoc(buildPandocArgs(markdown, output, { inputFormat: 'markdown', outputFormat: 'html', standalone: true, toc: false }), dir);
    const html = await readFile(output, 'utf8');
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toMatch(/<h1[^>]*>Título<\/h1>/);
    expect(html).toContain('<strong>ñ</strong>');
    expect(html).toContain('<table');
  });

  it('converts Markdown to DOCX and back', async () => {
    const docx = path.join(dir, 'doc.docx');
    await runPandoc(buildPandocArgs(markdown, docx, { inputFormat: 'markdown', outputFormat: 'docx', standalone: false, toc: false }), dir);
    expect((await readFile(docx)).subarray(0, 2).toString()).toBe('PK');

    const roundTrip = path.join(dir, 'round-trip.md');
    await runPandoc(buildPandocArgs(docx, roundTrip, { inputFormat: 'docx', outputFormat: 'markdown', standalone: false, toc: false }), dir);
    expect(await readFile(roundTrip, 'utf8')).toContain('Canción con **ñ**');
  });

  it('reports unreadable input as a corrupted document', async () => {
    const broken = path.join(dir, 'broken.docx');
    await writeFile(broken, 'this is not a zip file');
    await expect(
      runPandoc(buildPandocArgs(broken, path.join(dir, 'x.md'), { inputFormat: 'docx', outputFormat: 'markdown', standalone: false, toc: false }), dir),
    ).rejects.toMatchObject({ code: 'documentCorrupted', detail: expect.stringMatching(/^pandoc exited with code \d+$/) });
  });

  it('passes no raw TeX, typst or HTML from Markdown, and reads no other file', async () => {
    const source = path.join(dir, 'raw.md');
    await writeFile(source, '```{=typst}\n#read("/etc/hosts")\n```\n\n\\input{/etc/hosts}\n\n<script>alert(1)</script>\n\n![x](/etc/hosts)\n');

    // What the PDF engine would get: the same reader, with typst source written out instead of compiled.
    const typst = path.join(dir, 'raw.typ');
    const pdfArgs = buildPandocArgs(source, typst, { inputFormat: 'markdown', outputFormat: 'pdf', standalone: false, toc: false, pdfEngine: 'typst' });
    await runPandoc(pdfArgs.filter(arg => !arg.startsWith('--pdf-engine')).map(arg => (arg === 'pdf' ? 'typst' : arg)), dir);
    expect(await readFile(typst, 'utf8')).not.toMatch(/^#read/m);

    const html = path.join(dir, 'raw.html');
    await runPandoc(buildPandocArgs(source, html, { inputFormat: 'markdown', outputFormat: 'html', standalone: false, toc: false }), dir);
    const page = await readFile(html, 'utf8');
    expect(page).not.toContain('<script>');
    expect(page).not.toMatch(/^\\input/m);

    const docx = path.join(dir, 'raw.docx');
    await runPandoc(buildPandocArgs(source, docx, { inputFormat: 'markdown', outputFormat: 'docx', standalone: false, toc: false }), dir);
    expect(Object.keys(unzipSync(await readFile(docx))).filter(name => name.includes('media/'))).toEqual([]);
  });

  it.skipIf(!hasTypst)('renders PDF with Typst, keeping non-ASCII text', async () => {
    expect(await findPdfEngine('typst')).toBe('typst');

    const pdf = path.join(dir, 'doc.pdf');
    await runPandoc(buildPandocArgs(markdown, pdf, { inputFormat: 'markdown', outputFormat: 'pdf', standalone: true, toc: false, pdfEngine: 'typst' }), dir);
    expect((await readFile(pdf)).subarray(0, 5).toString()).toBe('%PDF-');

    if (hasPdftotext) {
      const text = path.join(dir, 'doc.txt');
      await extractPdfText(pdf, text);
      expect(await readFile(text, 'utf8')).toContain('Canción');
    }
  });

  it('uses Typst and nothing else for PDF', async () => {
    expect(await findPdfEngine()).toBe(hasTypst ? 'typst' : null);
  });

  it.skipIf(!hasPdftotext)('rejects a PDF that cannot be read', async () => {
    const fake = path.join(dir, 'fake.pdf');
    await writeFile(fake, 'not a pdf');
    await expect(extractPdfText(fake, path.join(dir, 'fake.txt'))).rejects.toMatchObject({ code: 'pdfExtractionFailed' });
    await expect(stat(path.join(dir, 'fake.txt'))).rejects.toThrow();
  });
});
