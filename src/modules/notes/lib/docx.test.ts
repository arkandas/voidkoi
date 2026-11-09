import { describe, expect, it, vi } from 'vitest';
import { unzipSync, strFromU8 } from 'fflate';

vi.mock('@/lib/prisma', () => ({
  prisma: { noteImage: { findFirst: async () => null } },
}));

const { noteToDocxBuffer } = await import('./docx');

async function body(markdown: string) {
  const buffer = await noteToDocxBuffer(markdown, 1);
  const files = unzipSync(new Uint8Array(buffer));
  const xml = strFromU8(files['word/document.xml']);
  return xml.slice(xml.indexOf('<w:body>'));
}

const texts = (xml: string) =>
  [...xml.matchAll(/<w:t(?=[\s>])[^>]*>(.*?)<\/w:t>/g)].map(m => m[1]);

describe('structure', () => {
  it('turns a heading into a heading, not a paragraph starting with #', async () => {
    const xml = await body('# Title\n\nWords.');
    expect(xml).toMatch(/w:val="Heading1"/);
    expect(texts(xml)).toContain('Title');
    expect(texts(xml).join('')).not.toContain('#');
  });

  it('builds a table from pipe rows', async () => {
    const xml = await body('| a | b |\n| - | - |\n| 1 | 2 |');
    expect(xml).toContain('<w:tbl>');
    expect(texts(xml)).toEqual(expect.arrayContaining(['a', 'b', '1', '2']));
    expect(texts(xml).join('')).not.toContain('-');
  });

  it('keeps a fenced code block verbatim, without the fences', async () => {
    const xml = await body('```python\ndef f():\n    return 1\n```');
    expect(texts(xml)).toContain('def f():');
    expect(texts(xml)).toContain('    return 1');
    expect(texts(xml).join('')).not.toContain('```');
  });

  it('numbers an ordered list rather than writing the digits out', async () => {
    const xml = await body('1. first\n2. second');
    expect(xml).toContain('<w:numPr>');
    expect(texts(xml)).toContain('first');
    expect(texts(xml).join('')).not.toMatch(/^1\./);
  });

  it('marks a bullet as a bullet', async () => {
    expect(await body('- one\n- two')).toContain('<w:numPr>');
  });
});

describe('inline formatting', () => {
  it('bolds and italicizes rather than keeping the markers', async () => {
    const xml = await body('**bold** and _italic_');
    expect(xml).toContain('<w:b/>');
    expect(xml).toContain('<w:i/>');
    expect(texts(xml).join('')).not.toContain('*');
    expect(texts(xml).join('')).not.toContain('_');
  });

  it('makes a link a hyperlink', async () => {
    const xml = await body('see [the docs](https://example.com)');
    expect(xml).toContain('<w:hyperlink');
    expect(texts(xml)).toContain('the docs');
    expect(texts(xml).join('')).not.toContain('https://example.com');
  });
});

describe('equations', () => {
  it('writes inline math as a Word equation', async () => {
    const xml = await body('Euler: $e^{i\\pi} + 1 = 0$');
    expect(xml).toContain('<m:oMath');
    expect(texts(xml).join('')).not.toContain('\\pi');
  });

  it('writes display math as a Word equation', async () => {
    expect(await body('$$\nx = \\frac{1}{2}\n$$')).toContain('<m:oMath');
  });

  it('fills the operand slot of a sum, which Word draws as a placeholder', async () => {
    const xml = await body('$$\n\\sum_{k=1}^{n} k^2\n$$');
    const nary = xml.slice(xml.indexOf('<m:nary>'), xml.indexOf('</m:nary>'));
    expect(nary).not.toContain('<m:e/>');
  });

  it('survives an inequality, which used to break the XML', async () => {
    const xml = await body('$$\n|x| = \\begin{cases} x, & x \\ge 0 \\\\ -x, & x < 0 \\end{cases}\n$$');
    expect(xml).toContain('<m:oMath');
  });

  it('leaves a price alone', async () => {
    const xml = await body('It costs $5 to $10.');
    expect(xml).not.toContain('<m:oMath');
    expect(texts(xml).join(' ')).toContain('$5');
  });
});

describe('images', () => {
  it('falls back to alt text when the image is not there', async () => {
    const xml = await body(`![a diagram](/api/notes/images/${'a'.repeat(64)})`);
    expect(texts(xml)).toContain('a diagram');
    expect(texts(xml)).not.toContain('!');
    expect(xml).not.toContain('<w:hyperlink');
  });
});

it('carries no note title: the filename is the title', async () => {
  expect(await body('Just the body.')).not.toMatch(/w:val="Title"/);
});

describe('formulas', () => {
  it('keep markup typed into a formula as text, never as part of the document', async () => {
    for (const formula of [
      '$\\text{</m:t><w:fldSimple w:instr="INCLUDEPICTURE"/><m:t>}$',
      '$$\n\\text{</m:t></m:r><m:r><m:t>x}\n$$',
    ]) {
      const xml = await body(formula);
      expect(xml).not.toContain('<w:fldSimple');
      expect(xml).toMatch(/<m:t[^>]*>[^<]*&lt;\/m:t&gt;/);
    }
  });

  it('keep comparisons and ampersands in formulas readable', async () => {
    const xml = await body('$a < b \\& c > d$');
    expect(xml).toContain('&lt;');
    expect(xml).toContain('&gt;');
    expect(xml).toContain('&amp;');
  });
});
