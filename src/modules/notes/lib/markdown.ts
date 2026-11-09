import rehypeKatex from 'rehype-katex'
import rehypeRaw from 'rehype-raw'
import rehypeSanitize, { defaultSchema, type Options } from 'rehype-sanitize'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'

/**
 * HTML written in a note is drawn, within limits: GitHub's list of safe tags
 * plus media and a few for text, and inline styles for colour and type only.
 * No scripts, forms, frames or anything that reaches outside the note.
 */
const HTML_SCHEMA: Options = {
  ...defaultSchema,
  clobber: [],
  strip: ['script', 'style'],
  tagNames: [
    ...(defaultSchema.tagNames ?? []),
    'abbr', 'audio', 'caption', 'center', 'cite', 'col', 'colgroup', 'figcaption', 'figure',
    'mark', 'small', 'time', 'track', 'u', 'video',
  ],
  attributes: {
    ...defaultSchema.attributes,
    '*': [...(defaultSchema.attributes?.['*'] ?? []).filter(name => name !== 'name'), 'style'],
    audio: ['src', 'controls', 'loop', 'muted', 'preload'],
    source: [...(defaultSchema.attributes?.source ?? []), 'src', 'type', 'sizes'],
    track: ['src', 'default', 'kind', 'srcLang'],
    video: ['src', 'controls', 'loop', 'muted', 'playsInline', 'poster', 'preload'],
  },
  protocols: { ...defaultSchema.protocols, poster: ['http', 'https'] },
}

/** Inline styles keep what styles text: colour, weight, slant, lines, alignment. Nothing that moves, sizes or loads. */
const STYLE_PROPERTIES = new Set([
  'color', 'background-color', 'font-weight', 'font-style', 'font-variant', 'text-align', 'text-decoration',
  'text-decoration-color', 'text-decoration-line', 'text-decoration-style', 'vertical-align',
])

export function safeStyle(style: string): string {
  return style
    .split(';')
    .map(declaration => {
      const colon = declaration.indexOf(':')
      if (colon <= 0) return null
      const property = declaration.slice(0, colon).trim().toLowerCase()
      const value = declaration.slice(colon + 1).trim()
      if (!STYLE_PROPERTIES.has(property) || !value || /url\(|expression|image-set|@import|\\|\/\*/i.test(value)) return null
      return `${property}:${value}`
    })
    .filter(Boolean)
    .join(';')
}

interface HastNode {
  type: string
  properties?: Record<string, unknown>
  children?: HastNode[]
}

function rehypeSafeStyles() {
  const visit = (node: HastNode): void => {
    const style = node.properties?.style
    if (typeof style === 'string') {
      const kept = safeStyle(style)
      if (kept) node.properties!.style = kept
      else delete node.properties!.style
    }
    node.children?.forEach(visit)
  }
  return visit
}

export const MARKDOWN_PLUGINS = [remarkGfm, remarkMath]

export const REHYPE_PLUGINS = [
  rehypeRaw,
  [rehypeSanitize, HTML_SCHEMA],
  rehypeSafeStyles,
  [rehypeKatex, { strict: false, throwOnError: false }],
] as never
