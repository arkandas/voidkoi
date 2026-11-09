import { spawn } from 'child_process'
import { createReadStream, createWriteStream } from 'fs'
import { copyFile, mkdir, mkdtemp } from 'fs/promises'
import path from 'path'
import { finished } from 'stream/promises'
import { Zip, ZipPassThrough } from 'fflate'
import { ToolError } from '@/modules/utilikit/lib/tool-error'
import { type ImageDpi, type ImageFormat, pageRangeLabel } from '@/modules/utilikit/lib/pdf-pages'
import { getTempDir } from '@/modules/utilikit/lib/temp'

export interface PdfInfo {
  pages: number
  encrypted: boolean
}

export interface OutputFile {
  name: string
  path: string
}

function run(binary: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args)
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', data => {
      stdout += data.toString()
    })
    child.stderr.on('data', data => {
      stderr = (stderr + data.toString()).slice(-2000)
    })
    child.on('error', reject)
    child.on('close', code => {
      if (code === 0) resolve(stdout)
      else reject(pdfError(stderr, `${binary} exited with code ${code}`))
    })
  })
}

/** Why poppler failed, from what it printed. The page gets the code and `detail`; the log gets its words. */
export function pdfError(stderr: string, detail: string): ToolError {
  const output = stderr.trim().split('\n').pop()
  if (/Incorrect password|encrypted/i.test(stderr)) return new ToolError('pdfEncrypted', detail, 400, output)
  if (/Couldn't (find|read)|damaged|May not be a PDF|Syntax Error/i.test(stderr)) return new ToolError('pdfInvalid', detail, 400, output)
  return new ToolError('conversionFailed', detail, 400, output)
}

export function parsePdfInfo(output: string): PdfInfo {
  const pages = Number(/^Pages:\s+(\d+)/m.exec(output)?.[1])
  if (!Number.isInteger(pages) || pages < 1) throw new ToolError('pdfInvalid', 'No pages found')
  return { pages, encrypted: /^Encrypted:\s+yes/m.test(output) }
}

export async function readPdfInfo(file: string): Promise<PdfInfo> {
  return parsePdfInfo(await run('pdfinfo', [file]))
}

export async function createWorkDir(): Promise<string> {
  await mkdir(getTempDir(), { recursive: true })
  return mkdtemp(path.join(getTempDir(), 'pdf-'))
}

export async function mergePdfs(inputs: string[], output: string) {
  await run('pdfunite', [...inputs, output])
}

async function separate(input: string, pages: number[], dir: string): Promise<Map<number, string>> {
  const first = Math.min(...pages)
  const last = Math.max(...pages)
  await run('pdfseparate', ['-f', String(first), '-l', String(last), input, path.join(dir, 'page-%d.pdf')])
  return new Map(pages.map(page => [page, path.join(dir, `page-${page}.pdf`)]))
}

async function combine(files: string[], output: string) {
  if (files.length === 1) await copyFile(files[0], output)
  else await run('pdfunite', [...files, output])
}

export async function extractPages(input: string, pages: number[], dir: string, output: string) {
  const files = await separate(input, pages, dir)
  await combine(pages.map(page => files.get(page)!), output)
}

export async function splitPdf(
  input: string,
  groups: number[][],
  dir: string,
  baseName: string,
  onProgress: (done: number) => void,
): Promise<OutputFile[]> {
  const files = await separate(input, groups.flat(), dir)
  const outputs: OutputFile[] = []

  for (const [index, group] of groups.entries()) {
    const name = `${baseName}-${pageRangeLabel(group)}.pdf`
    const file = path.join(dir, `part-${index + 1}.pdf`)
    await combine(group.map(page => files.get(page)!), file)
    outputs.push({ name, path: file })
    onProgress(index + 1)
  }

  return outputs
}

export async function renderPages(
  input: string,
  pages: number[],
  format: ImageFormat,
  dpi: ImageDpi,
  dir: string,
  baseName: string,
  onProgress: (done: number) => void,
): Promise<OutputFile[]> {
  const extension = format === 'png' ? 'png' : 'jpg'
  const outputs: OutputFile[] = []

  for (const [index, page] of pages.entries()) {
    const prefix = path.join(/*turbopackIgnore: true*/ dir, `image-${index + 1}`)
    const args = [`-${format}`, '-r', String(dpi), '-f', String(page), '-l', String(page), '-singlefile']
    if (format === 'jpeg') args.push('-jpegopt', 'quality=90')
    await run('pdftoppm', [...args, input, prefix])
    outputs.push({ name: `${baseName}-page-${page}.${extension}`, path: `${prefix}.${extension}` })
    onProgress(index + 1)
  }

  return outputs
}

export async function writeZip(files: OutputFile[], output: string) {
  const stream = createWriteStream(output)
  let failure: Error | null = null
  const zip = new Zip((error, chunk, final) => {
    if (error) failure = error
    else stream.write(chunk)
    if (final || error) stream.end()
  })

  const used = new Set<string>()
  for (const file of files) {
    let name = file.name
    for (let copy = 2; used.has(name); copy++) name = file.name.replace(/(\.[^.]+)$/, `-${copy}$1`)
    used.add(name)

    const entry = new ZipPassThrough(name)
    zip.add(entry)
    for await (const chunk of createReadStream(file.path)) entry.push(chunk as Uint8Array)
    entry.push(new Uint8Array(0), true)
  }

  zip.end()
  await finished(stream)
  if (failure) throw failure
}
