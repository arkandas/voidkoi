export const DOCUMENT_FORMATS = {
  markdown: {
    extensions: ['.md', '.markdown'],
    mimeTypes: ['text/markdown', 'text/x-markdown'],
    pandocFormat: 'markdown',
    displayName: 'Markdown',
  },
  docx: {
    extensions: ['.docx'],
    mimeTypes: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    pandocFormat: 'docx',
    displayName: 'Microsoft Word (DOCX)',
  },
  html: {
    extensions: ['.html', '.htm'],
    mimeTypes: ['text/html'],
    pandocFormat: 'html',
    displayName: 'HTML',
  },
  pdf: {
    extensions: ['.pdf'],
    mimeTypes: ['application/pdf'],
    pandocFormat: 'pdf',
    displayName: 'PDF',
  },
  txt: {
    extensions: ['.txt'],
    mimeTypes: ['text/plain'],
    pandocFormat: 'plain',
    displayName: 'TXT',
  },
} as const

export type DocumentFormat = keyof typeof DOCUMENT_FORMATS

export const DOCUMENT_SIZE_LIMIT = 50 * 1024 * 1024

/** Typst only: LaTeX, wkhtmltopdf and WeasyPrint can read the server's files or fetch URLs a document names. */
export const PDF_ENGINES = ['typst'] as const
export type PdfEngine = (typeof PDF_ENGINES)[number]

export function isDocumentFormat(value: unknown): value is DocumentFormat {
  return typeof value === 'string' && Object.hasOwn(DOCUMENT_FORMATS, value)
}

export function isPdfEngine(value: unknown): value is PdfEngine {
  return typeof value === 'string' && (PDF_ENGINES as readonly string[]).includes(value)
}

export function detectDocumentFormat(filename: string, mimeType?: string): DocumentFormat | null {
  const extension = `.${filename.split('.').pop()?.toLowerCase() ?? ''}`
  const formats = Object.entries(DOCUMENT_FORMATS) as Array<[DocumentFormat, (typeof DOCUMENT_FORMATS)[DocumentFormat]]>

  const byExtension = formats.find(([, info]) => (info.extensions as readonly string[]).includes(extension))
  if (byExtension) return byExtension[0]

  const byMimeType = mimeType && formats.find(([, info]) => (info.mimeTypes as readonly string[]).includes(mimeType))
  return byMimeType ? byMimeType[0] : null
}
