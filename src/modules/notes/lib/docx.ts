import {
  AlignmentType,
  BorderStyle,
  Document,
  ExternalHyperlink,
  HeadingLevel,
  ImageRun,
  ImportedXmlComponent,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx';
import type { ParagraphChild } from 'docx';
import { readFile } from 'fs/promises';
import katex from 'katex';
import { mml2omml } from 'mathml2omml';
import { prisma } from '@/lib/prisma';
import { IMAGE_PATH, imageIdsIn, imagePath } from '@/modules/notes/lib/images';
import { repairOmml } from '@/modules/notes/lib/omml';

const HEADING_LEVELS = [
  HeadingLevel.HEADING_1,
  HeadingLevel.HEADING_2,
  HeadingLevel.HEADING_3,
  HeadingLevel.HEADING_4,
  HeadingLevel.HEADING_5,
  HeadingLevel.HEADING_6,
];

type RunStyle = { bold?: boolean; italics?: boolean; strike?: boolean; code?: boolean };

type EmbeddedImage = { data: Buffer; type: 'png' | 'jpg' | 'gif' | 'bmp'; width: number; height: number };
type ImageMap = Map<string, EmbeddedImage>;

const MAX_IMAGE_WIDTH = 600;

const MAX_EXPORT_IMAGES = 200;

async function transcodeToPng(data: Buffer): Promise<Buffer | null> {
  try {
    const { default: sharp } = await import('sharp');
    return await sharp(data, { limitInputPixels: 50_000_000 }).png().toBuffer();
  } catch (error) {
    console.error('Could not transcode an image for the Word export:', error);
    return null;
  }
}

/** The note's pictures that belong to the account, ready to embed. */
async function loadImages(markdown: string, userId: number): Promise<ImageMap> {
  const images: ImageMap = new Map();

  // A note mentioning thousands of pictures still makes a document of reasonable size.
  for (const id of [...new Set(imageIdsIn(markdown))].slice(0, MAX_EXPORT_IMAGES)) {
    const row = await prisma.noteImage.findFirst({ where: { id, user_id: userId } });
    if (!row) continue;

    let data: Buffer;
    try {
      data = await readFile(imagePath(id, row.mime));
    } catch {
      continue;
    }

    let type: EmbeddedImage['type'];
    if (row.mime === 'image/jpeg') type = 'jpg';
    else if (row.mime === 'image/png') type = 'png';
    else if (row.mime === 'image/gif') type = 'gif';
    else {
      const transcoded = await transcodeToPng(data);
      if (!transcoded) continue;
      data = transcoded;
      type = 'png';
    }

    const width = row.width || MAX_IMAGE_WIDTH;
    const height = row.height || MAX_IMAGE_WIDTH;
    const scale = Math.min(1, MAX_IMAGE_WIDTH / width);

    images.set(id, {
      data,
      type,
      width: Math.round(width * scale),
      height: Math.round(height * scale),
    });
  }

  return images;
}

function imageRun(image: EmbeddedImage, alt: string) {
  return new ImageRun({
    data: image.data,
    type: image.type,
    transformation: { width: image.width, height: image.height },
    altText: { name: alt, title: alt, description: alt },
  });
}

/**
 * mathml2omml writes the text it reads back out without escaping it again, so
 * a "<" typed in a formula would come out as markup. The characters that
 * matter travel as private-use stand-ins and come back as escaped text.
 */
const STAND_INS: Record<string, string> = { '&lt;': '\uE000', '&gt;': '\uE001', '&amp;': '\uE002', '&quot;': '\uE003', '&#x27;': '\uE004', '&#39;': '\uE004', '&apos;': '\uE004' }
const ESCAPED: Record<string, string> = { '\uE000': '&lt;', '\uE001': '&gt;', '\uE002': '&amp;', '\uE003': '&quot;', '\uE004': '&apos;' }

function guardText(mathml: string): string {
  return mathml.replace(/&(?:lt|gt|amp|quot|apos|#x27|#39);/g, entity => STAND_INS[entity]!)
}

function unguardText(omml: string): string {
  return omml.replace(/[\uE000-\uE004]/g, char => ESCAPED[char]!)
}

function mathRun(tex: string, displayMode: boolean): ParagraphChild | null {
  try {
    const html = katex.renderToString(tex, {
      output: 'mathml',
      displayMode,
      throwOnError: false,
      strict: false,
    });
    const mathml = html
      .match(/<math[\s\S]*?<\/math>/)?.[0]
      .replace(/<annotation[\s\S]*?<\/annotation>/g, '')
      .replace(/<\/?semantics>/g, '');
    if (!mathml) return null;

    const omml = repairOmml(unguardText(mml2omml(guardText(mathml))));
    const wrapper = ImportedXmlComponent.fromXmlString(omml) as unknown as { root: unknown[] };
    return (wrapper.root[0] ?? null) as ParagraphChild | null;
  } catch {
    return null;
  }
}

function inlineRuns(text: string, base: RunStyle = {}, images?: ImageMap): ParagraphChild[] {
  const runs: ParagraphChild[] = [];
  const pattern = /(!\[([^\]]*)\]\((\/api\/notes\/images\/[a-f0-9]{64})\))|(\[([^\]]+)\]\(([^)\s]+)\))|(\*\*|__)(.+?)\7|(\*|_)(.+?)\9|(~~)(.+?)\11|(`)([^`]+)\13|\$\$(.+?)\$\$|\$(?!\s)((?:[^$\n])+?)(?<!\s)\$/;

  let rest = text;
  while (rest.length > 0) {
    const match = pattern.exec(rest);
    if (!match) {
      runs.push(styledRun(rest, base));
      break;
    }

    if (match.index > 0) runs.push(styledRun(rest.slice(0, match.index), base));

    if (match[1]) {
      const image = images?.get(match[3].slice(IMAGE_PATH.length));
      runs.push(image ? imageRun(image, match[2] || 'image') : styledRun(match[2], base));
    } else if (match[4]) {
      runs.push(
        new ExternalHyperlink({
          link: match[6],
          children: [styledRun(match[5], { ...base, code: false })],
        }),
      );
    } else if (match[7]) {
      runs.push(styledRun(match[8], { ...base, bold: true }));
    } else if (match[9]) {
      runs.push(styledRun(match[10], { ...base, italics: true }));
    } else if (match[11]) {
      runs.push(styledRun(match[12], { ...base, strike: true }));
    } else if (match[13]) {
      runs.push(styledRun(match[14], { ...base, code: true }));
    } else if (match[15] || match[16]) {
      const source = match[15] ?? match[16];
      const math = mathRun(source, false);
      runs.push(math ?? styledRun(match[0], base));
    }

    rest = rest.slice(match.index + match[0].length);
  }

  return runs.length > 0 ? runs : [styledRun('', base)];
}

function styledRun(text: string, style: RunStyle) {
  return new TextRun({
    text,
    bold: style.bold,
    italics: style.italics,
    strike: style.strike,
    font: style.code ? 'Consolas' : undefined,
    shading: style.code ? { fill: 'F1F5F9' } : undefined,
  });
}

function tableFromLines(lines: string[], images?: ImageMap) {
  const cellsOf = (line: string) =>
    line
      .replace(/^\||\|$/g, '')
      .split('|')
      .map(c => c.trim());

  const rows = lines
    .filter(line => !/^\s*\|?[\s:-]+\|[\s:|-]*$/.test(line))
    .map((line, rowIndex) =>
      new TableRow({
        children: cellsOf(line).map(
          cell =>
            new TableCell({
              children: [new Paragraph({ children: inlineRuns(cell, { bold: rowIndex === 0 }, images) })],
              shading: rowIndex === 0 ? { fill: 'F1F5F9' } : undefined,
            }),
        ),
      }),
    );

  return new Table({ rows, width: { size: 100, type: WidthType.PERCENTAGE } });
}

function markdownToDocxBlocks(markdown: string, images?: ImageMap): (Paragraph | Table)[] {
  const blocks: (Paragraph | Table)[] = [];
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (/^\s*```/.test(line)) {
      const code: string[] = [];
      i++;
      while (i < lines.length && !/^\s*```/.test(lines[i])) {
        code.push(lines[i]);
        i++;
      }
      for (const codeLine of code) {
        blocks.push(
          new Paragraph({
            spacing: { before: 0, after: 0 },
            shading: { fill: 'F8FAFC' },
            children: [new TextRun({ text: codeLine || ' ', font: 'Consolas', size: 20 })],
          }),
        );
      }
      blocks.push(new Paragraph({ text: '' }));
      continue;
    }

    const loneImage = /^\s*!\[([^\]]*)\]\((\/api\/notes\/images\/[a-f0-9]{64})\)\s*$/.exec(line);
    if (loneImage) {
      const image = images?.get(loneImage[2].slice(IMAGE_PATH.length));
      blocks.push(
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 160, after: 160 },
          children: image
            ? [imageRun(image, loneImage[1] || 'image')]
            : inlineRuns(loneImage[1], {}, images),
        }),
      );
      continue;
    }

    if (/^\s*\$\$/.test(line)) {
      const opener = line.trim().slice(2);
      const tex: string[] = [];
      let closed = false;

      if (opener.endsWith('$$') && opener.length > 2) {
        tex.push(opener.slice(0, -2));
        closed = true;
      } else {
        if (opener) tex.push(opener);
        i++;
        while (i < lines.length) {
          const current = lines[i];
          if (/\$\$\s*$/.test(current)) {
            const head = current.replace(/\$\$\s*$/, '');
            if (head.trim()) tex.push(head);
            closed = true;
            break;
          }
          tex.push(current);
          i++;
        }
      }

      const source = tex.join('\n').trim();
      const math = closed ? mathRun(source, true) : null;
      blocks.push(
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 160, after: 160 },
          children: math ? [math] : inlineRuns(source, {}, images),
        }),
      );
      continue;
    }

    if (/^\s*\|.*\|\s*$/.test(line)) {
      const tableLines: string[] = [];
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) {
        tableLines.push(lines[i]);
        i++;
      }
      i--;
      blocks.push(tableFromLines(tableLines, images));
      blocks.push(new Paragraph({ text: '' }));
      continue;
    }

    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      blocks.push(
        new Paragraph({
          heading: HEADING_LEVELS[heading[1].length - 1],
          spacing: { before: 240, after: 120 },
          children: inlineRuns(heading[2], {}, images),
        }),
      );
      continue;
    }

    if (/^\s*([-*_])\s*\1\s*\1[\s-*_]*$/.test(line)) {
      blocks.push(
        new Paragraph({
          border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: 'CBD5E1' } },
          children: [],
        }),
      );
      continue;
    }

    const quote = /^\s*>\s?(.*)$/.exec(line);
    if (quote) {
      blocks.push(
        new Paragraph({
          indent: { left: 360 },
          border: { left: { style: BorderStyle.SINGLE, size: 12, color: 'CBD5E1', space: 8 } },
          children: inlineRuns(quote[1], { italics: true }, images),
        }),
      );
      continue;
    }

    const bullet = /^(\s*)[-*+]\s+(.*)$/.exec(line);
    if (bullet) {
      blocks.push(
        new Paragraph({
          bullet: { level: Math.min(Math.floor(bullet[1].length / 2), 4) },
          children: inlineRuns(bullet[2], {}, images),
        }),
      );
      continue;
    }

    const numbered = /^(\s*)\d+[.)]\s+(.*)$/.exec(line);
    if (numbered) {
      blocks.push(
        new Paragraph({
          numbering: { reference: 'md-numbering', level: Math.min(Math.floor(numbered[1].length / 2), 4) },
          children: inlineRuns(numbered[2], {}, images),
        }),
      );
      continue;
    }

    if (line.trim() === '') {
      blocks.push(new Paragraph({ text: '' }));
      continue;
    }

    blocks.push(new Paragraph({ spacing: { after: 120 }, children: inlineRuns(line, {}, images) }));
  }

  return blocks;
}

async function buildNoteDocument(content: string, userId: number) {
  const images = await loadImages(content, userId);

  return new Document({
    numbering: {
      config: [
        {
          reference: 'md-numbering',
          levels: [0, 1, 2, 3, 4].map(level => ({
            level,
            format: 'decimal' as const,
            text: `%${level + 1}.`,
            alignment: AlignmentType.START,
            style: { paragraph: { indent: { left: 720 * (level + 1), hanging: 360 } } },
          })),
        },
      ],
    },
    sections: [{ children: markdownToDocxBlocks(content, images) }],
  });
}

/**
 * A note as a Word document: headings, lists, tables, code, links, the
 * account's pictures and formulas as Word equations. The title is the file
 * name, not part of the text.
 */
export async function noteToDocxBuffer(content: string, userId: number) {
  return Packer.toBuffer(await buildNoteDocument(content, userId));
}
