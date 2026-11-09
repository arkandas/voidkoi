import { spawnSync } from 'child_process'
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import path from 'path'
import { unzipSync } from 'fflate'
import { afterAll, describe, expect, it } from 'vitest'
import {
  createWorkDir,
  extractPages,
  mergePdfs,
  parsePdfInfo,
  pdfError,
  readPdfInfo,
  renderPages,
  splitPdf,
  writeZip,
} from '@/modules/utilikit/lib/pdf-tools'
import { getTempDir } from '@/modules/utilikit/lib/temp'

const hasPoppler = ['pdfinfo', 'pdfunite', 'pdfseparate', 'pdftoppm', 'pdftotext'].every(
  binary => spawnSync(binary, ['-v']).status === 0,
)

function makePdf(count: number, label = 'Page'): Buffer {
  const objects: string[] = []
  const pages = Array.from({ length: count }, (_, index) => ({ page: 4 + index * 2, content: 5 + index * 2, text: `${label} ${index + 1}` }))
  objects[1] = '<< /Type /Catalog /Pages 2 0 R >>'
  objects[2] = `<< /Type /Pages /Kids [${pages.map(page => `${page.page} 0 R`).join(' ')}] /Count ${count} >>`
  objects[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'
  for (const page of pages) {
    const stream = `BT /F1 24 Tf 72 720 Td (${page.text}) Tj ET`
    objects[page.page] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${page.content} 0 R >>`
    objects[page.content] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`
  }

  let output = '%PDF-1.4\n'
  const offsets: number[] = []
  for (let id = 1; id < objects.length; id++) {
    offsets[id] = output.length
    output += `${id} 0 obj\n${objects[id]}\nendobj\n`
  }
  const xref = output.length
  output += `xref\n0 ${objects.length}\n0000000000 65535 f \n`
  output += offsets.slice(1).map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')
  output += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return Buffer.from(output, 'latin1')
}

const dir = mkdtempSync(path.join(tmpdir(), 'utilikit-pdf-test-'))
afterAll(() => rmSync(dir, { recursive: true, force: true }))

const file = (name: string) => path.join(dir, name)
const text = (pdf: string) => spawnSync('pdftotext', ['-layout', pdf, '-']).stdout.toString().replace(/\s+/g, ' ').trim()

describe('createWorkDir', () => {
  it('makes a fresh folder of its own in the temp directory', async () => {
    const [first, second] = [await createWorkDir(), await createWorkDir()]
    try {
      expect(path.dirname(first)).toBe(getTempDir())
      expect(path.basename(first).startsWith('pdf-')).toBe(true)
      expect(statSync(first).isDirectory()).toBe(true)
      expect(second).not.toBe(first)
    } finally {
      rmSync(first, { recursive: true, force: true })
      rmSync(second, { recursive: true, force: true })
    }
  })
})

describe('parsePdfInfo', () => {
  it('reads the page count and encryption', () => {
    expect(parsePdfInfo('Title: x\nPages:           12\nEncrypted:       no\n')).toEqual({ pages: 12, encrypted: false })
    expect(parsePdfInfo('Pages: 3\nEncrypted:       yes (print:no)\n')).toEqual({ pages: 3, encrypted: true })
  })

  it('rejects output without pages', () => {
    expect(() => parsePdfInfo('Title: x')).toThrow(expect.objectContaining({ code: 'pdfInvalid' }))
  })
})

describe('pdfError', () => {
  it('recognizes encrypted and damaged documents', () => {
    expect(pdfError('Command Line Error: Incorrect password', 'x').code).toBe('pdfEncrypted')
    expect(pdfError("Syntax Error: Couldn't read xref table", 'x').code).toBe('pdfInvalid')
    expect(pdfError('something else', 'pdfunite exited with code 1').code).toBe('conversionFailed')
  })

  it('shows only its own detail, and keeps what poppler printed for the log', () => {
    const error = pdfError("Unimplemented Feature: Could not merge encrypted files ('/tmp/x/input-1.pdf')", 'pdfunite exited with code 1')
    expect(error).toMatchObject({ code: 'pdfEncrypted', detail: 'pdfunite exited with code 1' })
    expect(error.message).toContain("Could not merge encrypted files ('/tmp/x/input-1.pdf')")
  })
})

describe.skipIf(!hasPoppler)('poppler integration', () => {
  writeFileSync(file('a.pdf'), makePdf(3, 'Alpha'))
  writeFileSync(file('b.pdf'), makePdf(2, 'Beta'))
  writeFileSync(file('bad.pdf'), 'not a pdf')

  it('reads the page count', async () => {
    expect(await readPdfInfo(file('a.pdf'))).toEqual({ pages: 3, encrypted: false })
  })

  it('reports damaged and password-protected files', async () => {
    await expect(readPdfInfo(file('bad.pdf'))).rejects.toMatchObject({ code: 'pdfInvalid' })
    await expect(readPdfInfo(path.join(process.cwd(), 'src/modules/utilikit/lib/fixtures/encrypted-user.pdf'))).rejects.toMatchObject({ code: 'pdfEncrypted' })
  })

  it('refuses to merge a protected file', async () => {
    const owner = path.join(process.cwd(), 'src/modules/utilikit/lib/fixtures/encrypted-owner.pdf')
    expect(await readPdfInfo(owner)).toEqual({ pages: 5, encrypted: true })
    await expect(mergePdfs([owner, file('a.pdf')], file('never.pdf'))).rejects.toMatchObject({ code: 'pdfEncrypted' })
  })

  it('merges files in order', async () => {
    await mergePdfs([file('b.pdf'), file('a.pdf')], file('merged.pdf'))
    expect(await readPdfInfo(file('merged.pdf'))).toEqual({ pages: 5, encrypted: false })
    expect(text(file('merged.pdf'))).toBe('Beta 1 Beta 2 Alpha 1 Alpha 2 Alpha 3')
  })

  it('extracts pages in the order asked for', async () => {
    const work = mkdtempSync(path.join(dir, 'extract-'))
    await extractPages(file('a.pdf'), [3, 1], work, file('extracted.pdf'))
    expect(text(file('extracted.pdf'))).toBe('Alpha 3 Alpha 1')

    await extractPages(file('a.pdf'), [2], work, file('single.pdf'))
    expect(text(file('single.pdf'))).toBe('Alpha 2')
  })

  it('splits into one file per group', async () => {
    const work = mkdtempSync(path.join(dir, 'split-'))
    const progress: number[] = []
    const parts = await splitPdf(file('a.pdf'), [[1, 2], [3]], work, 'report', done => progress.push(done))

    expect(parts.map(part => part.name)).toEqual(['report-pages-1-2.pdf', 'report-page-3.pdf'])
    expect(parts.map(part => text(part.path))).toEqual(['Alpha 1 Alpha 2', 'Alpha 3'])
    expect(progress).toEqual([1, 2])
  })

  it('renders pages as images at the chosen resolution', async () => {
    const work = mkdtempSync(path.join(dir, 'images-'))
    const [png, jpeg] = [
      ...(await renderPages(file('a.pdf'), [2], 'png', 72, work, 'report', () => {})),
      ...(await renderPages(file('a.pdf'), [3], 'jpeg', 150, work, 'report', () => {})),
    ]

    expect(png.name).toBe('report-page-2.png')
    expect(readFileSync(png.path).subarray(0, 4).toString('latin1')).toBe('\x89PNG')
    expect(jpeg.name).toBe('report-page-3.jpg')
    expect([...readFileSync(jpeg.path).subarray(0, 2)]).toEqual([0xff, 0xd8])

    const size = spawnSync('file', [png.path]).stdout.toString()
    expect(size).toMatch(/612 x 792/)
  })

  it('writes a ZIP with unique names', async () => {
    writeFileSync(file('one.txt'), 'one')
    writeFileSync(file('two.txt'), 'two')
    await writeZip(
      [
        { name: 'same.txt', path: file('one.txt') },
        { name: 'same.txt', path: file('two.txt') },
      ],
      file('out.zip'),
    )

    const entries = unzipSync(readFileSync(file('out.zip')))
    expect(Object.keys(entries)).toEqual(['same.txt', 'same-2.txt'])
    expect(new TextDecoder().decode(entries['same-2.txt'])).toBe('two')
    expect(statSync(file('out.zip')).size).toBeGreaterThan(0)
  })
})
