import { describe, expect, it } from 'vitest'
import {
  canThumbnail, EDIT_LIMIT, fileKind, inlineType, isEditable, isMarkdown, needsPreview, playsDirectly, previewKind, thumbnailSource,
  typeFor,
} from './file-types'

describe('thumbnailSource', () => {
  it('reads common images directly', () => {
    for (const type of ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif', 'image/tiff']) {
      expect(thumbnailSource(type)).toBe('image')
    }
  })

  it('decodes HEIC and HEIF on their own', () => {
    expect(thumbnailSource('image/heic')).toBe('heic')
    expect(thumbnailSource('image/HEIF')).toBe('heic')
    expect(thumbnailSource('image/heic-sequence')).toBe('heic')
  })

  it('takes a frame from any video', () => {
    expect(thumbnailSource('video/mp4')).toBe('video')
    expect(thumbnailSource('video/x-matroska')).toBe('video')
  })

  it('draws the first page of a PDF', () => {
    expect(thumbnailSource('application/pdf')).toBe('pdf')
  })

  it('draws the first lines of text and code files', () => {
    expect(thumbnailSource('text/plain', 'notes.txt')).toBe('text')
    expect(thumbnailSource('text/markdown', 'README.md')).toBe('text')
    expect(thumbnailSource('application/octet-stream', 'server.ts')).toBe('text')
    expect(canThumbnail('application/json', 'data.json')).toBe(true)
  })

  it('takes the cover of a song or a book', () => {
    expect(thumbnailSource('audio/mpeg', 'song.mp3')).toBe('audio')
    expect(thumbnailSource('application/epub+zip', 'book.epub')).toBe('epub')
    expect(thumbnailSource('application/octet-stream', 'Book.EPUB')).toBe('epub')
  })

  it('gives nothing else a thumbnail', () => {
    for (const type of ['image/svg+xml', 'application/zip', '', null, undefined]) {
      expect(thumbnailSource(type)).toBeNull()
      expect(canThumbnail(type)).toBe(false)
    }
  })
})

describe('needsPreview', () => {
  it('is for images a browser cannot show', () => {
    expect(needsPreview('image/heic')).toBe(true)
    expect(needsPreview('image/heif')).toBe(true)
    expect(needsPreview('image/tiff')).toBe(true)
  })

  it('is not for images a browser shows, or anything else', () => {
    for (const type of ['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'application/pdf', null]) {
      expect(needsPreview(type)).toBe(false)
    }
  })
})

describe('typeFor', () => {
  it('knows HEIC by its extension when the browser says nothing useful', () => {
    expect(typeFor('IMG_0042.HEIC', '')).toBe('image/heic')
    expect(typeFor('photo.heif', 'application/octet-stream')).toBe('image/heif')
  })

  it('trusts a specific type from the browser', () => {
    expect(typeFor('clip.mov', 'video/quicktime')).toBe('video/quicktime')
  })

  it('keeps songs the browser calls video as audio', () => {
    expect(typeFor('song.wma', 'video/x-ms-wma')).toBe('audio/x-ms-wma')
    expect(typeFor('song.ogg', 'video/ogg')).toBe('audio/ogg')
    expect(typeFor('clip.webm', 'video/webm')).toBe('video/webm')
  })
})

describe('previewKind', () => {
  it('leaves HEIC to its WebP preview: the browser cannot show the file itself', () => {
    expect(previewKind('image/heic', 'a.heic')).toBeNull()
    expect(previewKind('image/jpeg', 'a.jpg')).toBe('image')
  })

  it('shows any text as text', () => {
    expect(previewKind('application/octet-stream', 'notes.md')).toBe('text')
    expect(previewKind('text/html', 'page.html')).toBe('text')
  })

  it('plays any video or audio, and reads books', () => {
    expect(previewKind('video/mp4', 'clip.mp4')).toBe('video')
    expect(previewKind('video/x-matroska', 'film.mkv')).toBe('video')
    expect(previewKind('video/x-msvideo', 'old.avi')).toBe('video')
    expect(previewKind('audio/mpeg', 'song.mp3')).toBe('audio')
    expect(previewKind('audio/x-ms-wma', 'song.wma')).toBe('audio')
    expect(previewKind('application/epub+zip', 'book.epub')).toBe('epub')
    expect(previewKind('application/octet-stream', 'book.epub')).toBe('epub')
  })
})

describe('playsDirectly', () => {
  it('is for what browsers play themselves', () => {
    for (const type of ['video/mp4', 'video/webm', 'video/quicktime', 'audio/mpeg', 'audio/mp4', 'audio/flac', 'audio/wav']) {
      expect(playsDirectly(type)).toBe(true)
    }
  })

  it('leaves the rest to the server', () => {
    for (const type of ['video/x-matroska', 'video/x-msvideo', 'video/x-ms-wmv', 'audio/x-ms-wma', 'audio/aiff', null]) {
      expect(playsDirectly(type)).toBe(false)
    }
  })
})

describe('inlineType', () => {
  it('shows what plays directly in the page, and nothing that needs converting', () => {
    expect(inlineType('video/mp4', 'clip.mp4')).toBe('video/mp4')
    expect(inlineType('video/x-matroska', 'film.mkv')).toBeNull()
    expect(inlineType('application/epub+zip', 'book.epub')).toBeNull()
  })
})

describe('fileKind', () => {
  it('knows a book, though an EPUB is a ZIP inside', () => {
    expect(fileKind('application/epub+zip', 'book.epub')).toBe('book')
    expect(fileKind('application/zip', 'book.epub')).toBe('book')
    expect(fileKind('application/zip', 'photos.zip')).toBe('archive')
  })
})

describe('isMarkdown', () => {
  it('goes by the type or the extension', () => {
    expect(isMarkdown('text/markdown', 'notes')).toBe(true)
    expect(isMarkdown('text/plain', 'README.md')).toBe(true)
    expect(isMarkdown(null, 'Guide.MARKDOWN')).toBe(true)
    expect(isMarkdown('text/plain', 'notes.txt')).toBe(false)
  })
})

describe('isEditable', () => {
  it('takes text files up to the edit limit', () => {
    expect(isEditable('text/plain', 'notes.txt', 10)).toBe(true)
    expect(isEditable('text/markdown', 'notes.md', EDIT_LIMIT)).toBe(true)
    expect(isEditable('text/plain', 'big.log', EDIT_LIMIT + 1)).toBe(false)
  })

  it('leaves everything else alone', () => {
    expect(isEditable('image/png', 'photo.png', 10)).toBe(false)
    expect(isEditable('application/pdf', 'contract.pdf', 10)).toBe(false)
  })
})

describe('file kinds of shared files whose type says little', () => {
  it('fall back to the name when the browser gave no type', () => {
    expect(fileKind('', 'Budget.xlsx')).toBe('spreadsheet')
    expect(fileKind('', 'backup.7z')).toBe('archive')
    expect(fileKind('application/octet-stream', 'talk.PDF')).toBe('pdf')
    expect(fileKind('', 'IMG_0001.HEIC')).toBe('image')
  })

  it('are plain files when nothing places them', () => {
    expect(fileKind('', 'mystery')).toBe('file')
    expect(fileKind('application/octet-stream', 'thing.bin')).toBe('file')
  })

  it('ignore parameters on the type', () => {
    expect(fileKind('text/csv; charset=utf-8', 'x')).toBe('spreadsheet')
  })
})

