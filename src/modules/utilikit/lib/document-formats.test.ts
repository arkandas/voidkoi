import { describe, expect, it } from 'vitest';
import { detectDocumentFormat, isDocumentFormat, isPdfEngine } from '@/modules/utilikit/lib/document-formats';

describe('detectDocumentFormat', () => {
  it('detects formats by extension, ignoring case', () => {
    expect(detectDocumentFormat('notes.md')).toBe('markdown');
    expect(detectDocumentFormat('NOTES.MARKDOWN')).toBe('markdown');
    expect(detectDocumentFormat('report.docx')).toBe('docx');
    expect(detectDocumentFormat('page.htm')).toBe('html');
    expect(detectDocumentFormat('paper.PDF')).toBe('pdf');
    expect(detectDocumentFormat('readme.txt')).toBe('txt');
  });

  it('falls back to the MIME type', () => {
    expect(detectDocumentFormat('upload', 'text/markdown')).toBe('markdown');
    expect(detectDocumentFormat('upload.bin', 'application/pdf')).toBe('pdf');
  });

  it('prefers the extension over the MIME type', () => {
    expect(detectDocumentFormat('notes.md', 'text/plain')).toBe('markdown');
  });

  it('returns null for unknown files', () => {
    expect(detectDocumentFormat('photo.jpg', 'image/jpeg')).toBeNull();
    expect(detectDocumentFormat('noextension')).toBeNull();
  });
});

describe('guards', () => {
  it('recognises document formats', () => {
    expect(isDocumentFormat('docx')).toBe(true);
    expect(isDocumentFormat('odt')).toBe(false);
    expect(isDocumentFormat('toString')).toBe(false);
    expect(isDocumentFormat('constructor')).toBe(false);
    expect(isDocumentFormat('__proto__')).toBe(false);
  });

  it('allows Typst as the only PDF engine', () => {
    expect(isPdfEngine('typst')).toBe(true);
    for (const engine of ['xelatex', 'lualatex', 'pdflatex', 'wkhtmltopdf', 'weasyprint']) expect(isPdfEngine(engine), engine).toBe(false);
  });
});
