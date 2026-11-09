import { OpenGraphData } from '@/modules/utilikit/lib/types'

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
}

export function decodeEntities(value: string): string {
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entity, code: string) => {
    if (code[0] !== '#') return ENTITIES[code.toLowerCase()] ?? entity
    const point = code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10)
    return Number.isFinite(point) && point > 0 && point <= 0x10ffff ? String.fromCodePoint(point) : entity
  })
}

function attribute(tag: string, name: string): string | undefined {
  const match = tag.match(new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'>]+))`, 'i'))
  return match ? (match[1] ?? match[2] ?? match[3]) : undefined
}

export function parseOpenGraph(html: string): OpenGraphData {
  const meta = new Map<string, string>()

  for (const [tag] of html.matchAll(/<meta\b[^>]*>/gi)) {
    const key = (attribute(tag, 'property') ?? attribute(tag, 'name'))?.toLowerCase()
    const content = attribute(tag, 'content')
    if (key && content && !meta.has(key)) meta.set(key, decodeEntities(content.trim()))
  }

  const title = html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim()

  return {
    title: meta.get('og:title') ?? (title ? decodeEntities(title) : undefined),
    description: meta.get('og:description') ?? meta.get('description'),
    image: meta.get('og:image') ?? meta.get('twitter:image'),
    url: meta.get('og:url'),
    type: meta.get('og:type'),
    siteName: meta.get('og:site_name'),
    locale: meta.get('og:locale'),
    twitterCard: meta.get('twitter:card'),
    twitterSite: meta.get('twitter:site'),
    twitterCreator: meta.get('twitter:creator'),
  }
}
