import { spawn } from 'child_process'
import path from 'path'
import { ToolError } from '@/modules/utilikit/lib/tool-error'
import { DOCUMENT_FORMATS, DocumentFormat, PDF_ENGINES, PdfEngine } from '@/modules/utilikit/lib/document-formats'

export interface PandocOptions {
  inputFormat: string
  outputFormat: DocumentFormat
  standalone: boolean
  toc: boolean
  pdfEngine?: PdfEngine
}

function run(binary: string, args: string[], cwd?: string): Promise<{ code: number | null; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, { cwd })
    let stderr = ''

    child.stderr.on('data', data => {
      stderr = (stderr + data.toString()).slice(-4000)
    })
    child.on('error', reject)
    child.on('close', code => resolve({ code, stderr }))
  })
}

async function isAvailable(binary: string): Promise<boolean> {
  return run(binary, ['--version']).then(result => result.code === 0, () => false)
}

export async function findPdfEngine(preferred?: PdfEngine): Promise<PdfEngine | null> {
  const candidates = preferred ? [preferred, ...PDF_ENGINES.filter(engine => engine !== preferred)] : PDF_ENGINES
  for (const engine of candidates) {
    if (await isAvailable(engine)) return engine
  }
  return null
}

/** Markdown without its ways to pass raw TeX, typst or HTML straight to the output. */
const MARKDOWN_READER = 'markdown-raw_tex-raw_attribute-raw_html'

/**
 * The sandbox keeps pandoc's readers and writers to the files named here. For
 * a PDF, pandoc writes typst source to `outputPath` and `convertDocument`
 * compiles it: pandoc's own PDF step copies every picture the document points
 * at, wherever it is on the server, which its sandbox doesn't cover.
 */
export function buildPandocArgs(inputPath: string, outputPath: string, options: PandocOptions): string[] {
  const reader = options.inputFormat === 'markdown' ? MARKDOWN_READER : options.inputFormat
  const pdf = options.outputFormat === 'pdf'
  const args = ['--sandbox', '-f', reader, '-t', pdf ? 'typst' : DOCUMENT_FORMATS[options.outputFormat].pandocFormat]
  if (options.standalone || pdf) args.push('--standalone')
  if (options.toc) args.push('--toc')
  return [...args, '-o', outputPath, inputPath]
}

/** typst's arguments: compile `source` with `root` as the only folder it may read from. */
export function buildTypstArgs(source: string, outputPath: string, root: string): string[] {
  return ['compile', '--root', root, source, outputPath]
}

/** Why pandoc failed, from what it printed. The page gets the code and the exit status; the log gets its words. */
export function classifyPandocError(stderr: string, exitCode: number | null): ToolError {
  const lines = stderr.split('\n').map(line => line.trim()).filter(Boolean)
  const start = Math.max(0, lines.findIndex(line => /error|failed|^!/i.test(line)))
  const output = lines.slice(start).join(' ').slice(0, 300)
  const detail = `pandoc exited with code ${exitCode}`

  if (/typst/.test(stderr)) return new ToolError('pdfEngineError', detail, 400, output)
  return new ToolError('documentCorrupted', detail, 400, output)
}

/** Runs pandoc in `dir`, a folder of the job's own. */
export async function runPandoc(args: string[], dir: string): Promise<void> {
  const { code, stderr } = await run('pandoc', args, dir)
  if (code !== 0) throw classifyPandocError(stderr, code)
}

/**
 * Converts `inputPath` to `outputPath`. `dir` is the job's own folder, holding
 * only its input. A PDF is typst source compiled with `dir` as typst's root,
 * so a picture path pointing anywhere else fails the job instead of ending up
 * in the document.
 */
export async function convertDocument(inputPath: string, outputPath: string, options: PandocOptions, dir: string): Promise<void> {
  if (options.outputFormat !== 'pdf') {
    await runPandoc(buildPandocArgs(inputPath, outputPath, options), dir)
    return
  }
  const source = path.join(dir, 'document.typ')
  await runPandoc(buildPandocArgs(inputPath, source, options), dir)
  const { code, stderr } = await run('typst', buildTypstArgs(source, outputPath, dir), dir)
  if (code !== 0) {
    const output = stderr.split('\n').map(line => line.trim()).filter(Boolean).join(' ').slice(0, 300)
    throw new ToolError('pdfEngineError', `typst exited with code ${code}`, 400, output)
  }
}

export async function extractPdfText(pdfPath: string, outputPath: string): Promise<void> {
  const extractors: Array<[string, string[]]> = [
    ['pdftotext', ['-layout', pdfPath, outputPath]],
    ['gs', ['-sDEVICE=txtwrite', '-o', outputPath, '-dQUIET', pdfPath]],
  ]

  for (const [binary, args] of extractors) {
    const result = await run(binary, args).catch(() => null)
    if (!result) continue
    if (result.code === 0) return
    throw new ToolError('pdfExtractionFailed', `${binary} exited with code ${result.code}`, 400, result.stderr.slice(0, 200))
  }

  throw new ToolError('pdfExtractionUnavailable')
}
