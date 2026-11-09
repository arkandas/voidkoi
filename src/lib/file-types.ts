/** What a file is, by its type and name. Shared by the server and the browser. */

export type FileKind =
  | 'image'
  | 'video'
  | 'audio'
  | 'pdf'
  | 'document'
  | 'spreadsheet'
  | 'presentation'
  | 'archive'
  | 'book'
  | 'code'
  | 'text'
  | 'file'

export type PreviewKind = 'image' | 'video' | 'audio' | 'pdf' | 'text' | 'epub'

const TYPES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  avif: 'image/avif',
  bmp: 'image/bmp',
  svg: 'image/svg+xml',
  ico: 'image/x-icon',
  heic: 'image/heic',
  heif: 'image/heif',
  tif: 'image/tiff',
  tiff: 'image/tiff',
  mp4: 'video/mp4',
  m4v: 'video/x-m4v',
  mov: 'video/quicktime',
  webm: 'video/webm',
  mkv: 'video/x-matroska',
  avi: 'video/x-msvideo',
  ogv: 'video/ogg',
  wmv: 'video/x-ms-wmv',
  flv: 'video/x-flv',
  mpg: 'video/mpeg',
  mpeg: 'video/mpeg',
  m2ts: 'video/mp2t',
  mts: 'video/mp2t',
  '3gp': 'video/3gpp',
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
  wav: 'audio/wav',
  flac: 'audio/flac',
  ogg: 'audio/ogg',
  oga: 'audio/ogg',
  opus: 'audio/opus',
  wma: 'audio/x-ms-wma',
  aif: 'audio/aiff',
  aiff: 'audio/aiff',
  mka: 'audio/x-matroska',
  ape: 'audio/ape',
  pdf: 'application/pdf',
  epub: 'application/epub+zip',
  txt: 'text/plain',
  md: 'text/markdown',
  csv: 'text/csv',
  tsv: 'text/tab-separated-values',
  log: 'text/plain',
  json: 'application/json',
  xml: 'application/xml',
  yml: 'text/yaml',
  yaml: 'text/yaml',
  toml: 'text/plain',
  ini: 'text/plain',
  html: 'text/html',
  htm: 'text/html',
  css: 'text/css',
  js: 'text/javascript',
  mjs: 'text/javascript',
  ts: 'text/plain',
  tsx: 'text/plain',
  jsx: 'text/plain',
  py: 'text/x-python',
  sh: 'text/x-shellscript',
  go: 'text/plain',
  rs: 'text/plain',
  java: 'text/plain',
  c: 'text/plain',
  h: 'text/plain',
  cpp: 'text/plain',
  sql: 'text/plain',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  odt: 'application/vnd.oasis.opendocument.text',
  rtf: 'application/rtf',
  pages: 'application/vnd.apple.pages',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ods: 'application/vnd.oasis.opendocument.spreadsheet',
  numbers: 'application/vnd.apple.numbers',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  odp: 'application/vnd.oasis.opendocument.presentation',
  key: 'application/vnd.apple.keynote',
  zip: 'application/zip',
  rar: 'application/vnd.rar',
  '7z': 'application/x-7z-compressed',
  tar: 'application/x-tar',
  gz: 'application/gzip',
  tgz: 'application/gzip',
  bz2: 'application/x-bzip2',
  xz: 'application/x-xz',
  iso: 'application/x-iso9660-image',
  dmg: 'application/x-apple-diskimage',
  apk: 'application/vnd.android.package-archive',
}

const CODE = new Set([
  'js', 'mjs', 'ts', 'tsx', 'jsx', 'py', 'sh', 'go', 'rs', 'java', 'c', 'h', 'cpp', 'sql', 'html', 'htm', 'css',
  'json', 'xml', 'yml', 'yaml', 'toml', 'ini',
])

/** Extensions read as text in the viewer, whatever type the browser reported. */
const TEXT = new Set([...CODE, 'txt', 'md', 'csv', 'tsv', 'log', 'env', 'conf', 'srt', 'vtt'])

const INLINE_IMAGES = new Set([
  'image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/avif', 'image/bmp', 'image/svg+xml', 'image/x-icon',
])

/** Videos and audio a browser plays itself. The rest play through the server, which converts them. */
const INLINE_VIDEO = new Set(['video/mp4', 'video/webm', 'video/ogg', 'video/quicktime', 'video/x-m4v'])

const INLINE_AUDIO = new Set([
  'audio/mpeg', 'audio/mp3', 'audio/mp4', 'audio/aac', 'audio/wav', 'audio/x-wav', 'audio/wave', 'audio/flac',
  'audio/x-flac', 'audio/ogg', 'audio/opus', 'audio/webm', 'audio/x-m4a',
])

const EPUB = 'application/epub+zip'

/** Images the server reads directly. */
const RASTER = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/avif', 'image/tiff'])

/** Photos from iPhones and Macs: read with their own decoder. */
const HEIC = new Set(['image/heic', 'image/heif', 'image/heic-sequence', 'image/heif-sequence'])

/** Images a browser can't show, which get a WebP copy for the viewer. */
const NEEDS_PREVIEW = new Set([...HEIC, 'image/tiff'])

/** The lower-case extension, or '' when there is none worth the name. */
export function fileExtension(name: string): string {
  const dot = name.lastIndexOf('.')
  if (dot <= 0 || dot === name.length - 1) return ''
  const extension = name.slice(dot + 1).toLowerCase()
  return /^[a-z0-9]{1,8}$/.test(extension) ? extension : ''
}

/**
 * The type to store: the browser's when it says something specific, else the
 * one the name implies. Some systems call audio files video, like WMA on a
 * Mac: for those the name decides.
 */
export function typeFor(name: string, given: unknown): string {
  const value = typeof given === 'string' ? given.trim().toLowerCase().split(';')[0]!.trim() : ''
  const valid = /^[a-z0-9][a-z0-9.+-]*\/[a-z0-9][a-z0-9.+-]*$/.test(value) && value.length <= 100
  const named = TYPES[fileExtension(name)]
  if (valid && value.startsWith('video/') && named?.startsWith('audio/')) return named
  if (valid && value !== 'application/octet-stream') return value
  return named ?? 'application/octet-stream'
}

export function fileKind(mime: string | null | undefined, name: string): FileKind {
  const type = typeFor(name, mime)
  const extension = fileExtension(name)
  if (isEpub(type, name)) return 'book'
  if (type === 'application/pdf') return 'pdf'
  if (type.startsWith('image/')) return 'image'
  if (type.startsWith('video/')) return 'video'
  if (type.startsWith('audio/')) return 'audio'
  if (type.includes('spreadsheet') || type.includes('ms-excel') || type === 'text/csv' || type.includes('numbers')) {
    return 'spreadsheet'
  }
  if (type.includes('presentation') || type.includes('powerpoint') || type.includes('keynote')) return 'presentation'
  if (
    type.includes('zip') || type.includes('compressed') || type.includes('x-tar') || type.includes('gzip') ||
    type.includes('x-7z') || type.includes('rar') || type.includes('bzip') || type.includes('x-xz')
  ) {
    return 'archive'
  }
  if (type.includes('wordprocessing') || type === 'application/msword' || type.includes('opendocument.text') ||
      type === 'application/rtf' || type.includes('pages')) {
    return 'document'
  }
  if (CODE.has(extension)) return 'code'
  if (type.startsWith('text/') || TEXT.has(extension)) return 'text'
  return 'file'
}

function isEpub(type: string, name: string): boolean {
  return type === EPUB || fileExtension(name) === 'epub'
}

/**
 * How the viewer shows a file, or null when it can only be downloaded. Every
 * video and audio file plays: what the browser can't play itself, the server
 * converts as it plays.
 */
export function previewKind(mime: string | null | undefined, name: string): PreviewKind | null {
  const type = (mime ?? '').toLowerCase()
  if (INLINE_IMAGES.has(type)) return 'image'
  if (type.startsWith('video/')) return 'video'
  if (type.startsWith('audio/')) return 'audio'
  if (type === 'application/pdf') return 'pdf'
  if (isEpub(type, name)) return 'epub'
  const extension = fileExtension(name)
  if (TEXT.has(extension) || type.startsWith('text/') || type === 'application/json' || type === 'application/xml') {
    return 'text'
  }
  return null
}

/** Whether the browser plays a video or audio file as it is, rather than through the server. */
export function playsDirectly(mime: string | null | undefined): boolean {
  const type = (mime ?? '').toLowerCase()
  return INLINE_VIDEO.has(type) || INLINE_AUDIO.has(type)
}

/**
 * The Content-Type a file may be shown with in the page. Text of any kind is
 * plain text, so an HTML file never runs as this site. Null: download only,
 * like a book, which the reader fetches as bytes.
 */
export function inlineType(mime: string | null | undefined, name: string): string | null {
  const kind = previewKind(mime, name)
  if (kind === null || kind === 'epub') return null
  if (kind === 'text') return 'text/plain; charset=utf-8'
  if ((kind === 'video' || kind === 'audio') && !playsDirectly(mime)) return null
  return (mime ?? '').toLowerCase()
}

export type ThumbnailSource = 'image' | 'heic' | 'video' | 'audio' | 'pdf' | 'epub' | 'text'

/**
 * How a thumbnail is made for a file, or null when it gets none. Videos, the
 * cover art in audio files, and PDFs need ffmpeg and poppler on the server.
 * Books show their cover, and text files their first lines.
 */
export function thumbnailSource(mime: string | null | undefined, name = ''): ThumbnailSource | null {
  const type = (mime ?? '').toLowerCase()
  if (HEIC.has(type)) return 'heic'
  if (RASTER.has(type)) return 'image'
  if (type.startsWith('video/')) return 'video'
  if (type.startsWith('audio/')) return 'audio'
  if (type === 'application/pdf') return 'pdf'
  if (isEpub(type, name)) return 'epub'
  if (previewKind(mime, name) === 'text') return 'text'
  return null
}

export function canThumbnail(mime: string | null | undefined, name = ''): boolean {
  return thumbnailSource(mime, name) !== null
}

/** Shown formatted in the viewer, and edited beside a formatted preview. */
export function isMarkdown(mime: string | null | undefined, name: string): boolean {
  return (mime ?? '').toLowerCase() === 'text/markdown' || ['md', 'markdown', 'mdown', 'mkd'].includes(fileExtension(name))
}

/** Text files up to this size can be edited in the app. */
export const EDIT_LIMIT = 1024 * 1024

export function isEditable(mime: string | null | undefined, name: string, size: number): boolean {
  return previewKind(mime, name) === 'text' && size <= EDIT_LIMIT
}

export function needsPreview(mime: string | null | undefined): boolean {
  return NEEDS_PREVIEW.has((mime ?? '').toLowerCase())
}
