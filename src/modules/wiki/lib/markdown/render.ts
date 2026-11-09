import type { Element, Root as HastRoot } from 'hast'
import { toString as hastToString } from 'hast-util-to-string'
import type { Blockquote, Code, Paragraph, Root as MdastRoot, RootContent, Text } from 'mdast'
import type { ContainerDirective, LeafDirective, TextDirective } from 'mdast-util-directive'
import rehypeKatex from 'rehype-katex'
import rehypePrismCommon from 'rehype-prism-plus/common'
import rehypeRaw from 'rehype-raw'
import rehypeSanitize, { defaultSchema, type Options as SanitizeSchema } from 'rehype-sanitize'
import rehypeSlug from 'rehype-slug'
import remarkDirective from 'remark-directive'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import remarkParse from 'remark-parse'
import remarkRehype from 'remark-rehype'
import { unified, type Plugin } from 'unified'
import { SKIP, visit } from 'unist-util-visit'

/* What a page can say --------------------------------------------------------
 *
 * GitHub-flavored Markdown (tables, task lists, footnotes, strikethrough),
 * math between $ and $$, Docusaurus callouts (:::note … :::) and GitHub's
 * (> [!NOTE]), code blocks with a title="…" and highlighted {1,3-5} lines,
 * Mermaid diagrams, and plain HTML, cleaned of anything that runs.
 */

export const CALLOUTS = ['note', 'tip', 'info', 'warning', 'danger'] as const
export type Callout = (typeof CALLOUTS)[number]

/** GitHub's alert names, as the callout each one is drawn as. */
const ALERTS: Record<string, Callout> = {
  NOTE: 'note',
  TIP: 'tip',
  IMPORTANT: 'info',
  WARNING: 'warning',
  CAUTION: 'danger',
}

/** Docusaurus' other names for the same five. */
const CALLOUT_ALIASES: Record<string, Callout> = {
  note: 'note',
  tip: 'tip',
  info: 'info',
  important: 'info',
  warning: 'warning',
  caution: 'warning',
  danger: 'danger',
}

export interface TocItem {
  id: string
  text: string
  depth: 2 | 3
}

export interface Rendered {
  tree: HastRoot
  toc: TocItem[]
}



function calloutNode(kind: Callout, title: string | null, children: RootContent[]): RootContent {
  const titleNode = title
    ? [
        {
          type: 'paragraph',
          data: { hName: 'p', hProperties: { className: ['callout-title'] } },
          children: [{ type: 'text', value: title }],
        } as Paragraph,
      ]
    : []
  return {
    type: 'blockquote',
    data: { hName: 'aside', hProperties: { className: ['callout', `callout-${kind}`], dataCallout: kind } },
    children: [...titleNode, ...children],
  } as unknown as RootContent
}

/** `:::note[Title]` blocks become callouts; any other directive goes back to the text it was. */
const remarkCallouts: Plugin<[], MdastRoot> = () => tree => {
  visit(tree, (node, index, parent) => {
    if (!parent || index === undefined) return
    if (node.type === 'containerDirective') {
      const directive = node as ContainerDirective
      const kind = CALLOUT_ALIASES[directive.name.toLowerCase()]
      const [first, ...rest] = directive.children
      const labelled = first?.type === 'paragraph' && (first.data as { directiveLabel?: boolean } | undefined)?.directiveLabel
      const title = labelled ? toPlain(first as Paragraph) : null
      const body = (labelled ? rest : directive.children) as RootContent[]
      if (kind) {
        parent.children.splice(index, 1, calloutNode(kind, title, body) as never)
      } else {
        parent.children.splice(index, 1, ...(body as never[]))
      }
      return [SKIP, index]
    }
    if (node.type === 'leafDirective' || node.type === 'textDirective') {
      const directive = node as LeafDirective | TextDirective
      const marker = node.type === 'leafDirective' ? '::' : ':'
      const label = directive.children.length ? `[${directive.children.map(child => toPlain(child)).join('')}]` : ''
      const text: Text = { type: 'text', value: `${marker}${directive.name}${label}` }
      parent.children.splice(index, 1, (node.type === 'leafDirective' ? { type: 'paragraph', children: [text] } : text) as never)
      return [SKIP, index + 1]
    }
  })
}

function toPlain(node: { type: string; value?: string; children?: unknown[] }): string {
  if (typeof node.value === 'string') return node.value
  return (node.children ?? []).map(child => toPlain(child as typeof node)).join('')
}

/** `> [!NOTE]` quotes become callouts too. */
const remarkAlerts: Plugin<[], MdastRoot> = () => tree => {
  visit(tree, 'blockquote', (node: Blockquote, index, parent) => {
    if (!parent || index === undefined) return
    const first = node.children[0]
    if (first?.type !== 'paragraph') return
    const lead = first.children[0]
    if (lead?.type !== 'text') return
    const match = /^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\][ \t]*\n?/i.exec(lead.value)
    if (!match) return
    const kind = ALERTS[match[1]!.toUpperCase()]!
    lead.value = lead.value.slice(match[0].length)
    // A soft break after the marker would open the text with an empty line.
    if (lead.value === '' && first.children[1]?.type === 'break') first.children.splice(1, 1)
    const body = node.children.filter(child => child !== first || toPlain(first).trim() !== '') as RootContent[]
    parent.children.splice(index, 1, calloutNode(kind, null, body) as never)
    return [SKIP, index]
  })
}

/** A code block's info after the language (`title="x" {1,3}`) survives into the HTML, for the steps below. */
const remarkCodeMeta: Plugin<[], MdastRoot> = () => tree => {
  visit(tree, 'code', (node: Code) => {
    if (!node.meta) return
    node.data = { ...node.data, hProperties: { ...(node.data?.hProperties ?? {}), metastring: node.meta } }
  })
}

/**
 * What HTML a page may hold. Every id and name written in a page gets the
 * `user-content-` prefix (the schema's default), so none can stand in for a
 * global the browser or the app's scripts read, like `document.currentScript`.
 */
const SCHEMA: SanitizeSchema = {
  ...defaultSchema,
  tagNames: [...(defaultSchema.tagNames ?? []), 'aside', 'figure', 'figcaption', 'mark', 'abbr', 'u'],
  attributes: {
    ...defaultSchema.attributes,
    '*': [...(defaultSchema.attributes?.['*'] ?? []), 'id', 'title'],
    aside: [['className', 'callout', ...CALLOUTS.map(kind => `callout-${kind}`)], ['dataCallout', ...CALLOUTS]],
    p: [['className', 'callout-title']],
    code: [['className', /^language-./, 'math-inline', 'math-display'], 'metastring'],
    div: [['className', 'math', 'math-display']],
    span: [['className', 'math', 'math-inline']],
    img: [...(defaultSchema.attributes?.img ?? []), 'width', 'height', 'loading'],
    td: [...(defaultSchema.attributes?.td ?? []), 'align', 'colSpan', 'rowSpan'],
    th: [...(defaultSchema.attributes?.th ?? []), 'align', 'colSpan', 'rowSpan'],
  },
}

function className(node: Element): string[] {
  const value: unknown = node.properties.className
  return Array.isArray(value) ? value.map(String) : typeof value === 'string' ? value.split(' ') : []
}

/**
 * Highlighted lines (`{1,3-5}`) kept to the lines the block has, at most 200
 * ranges. The highlighter lists every line of a range, so `{1-999999999}`
 * would otherwise fill the server's memory.
 */
export function clampLines(meta: string, code: string): string {
  return meta.replace(/\{([^}]*)\}/g, (_whole, inside: string) => {
    const count = code.split('\n').length
    const ranges: string[] = []
    for (const part of inside.split(',').slice(0, 200)) {
      const match = /^\s*(\d+)\s*(?:-\s*(\d+)\s*)?$/.exec(part)
      if (!match) continue
      const from = Math.max(1, Number(match[1]))
      const to = Math.min(count, Number(match[2] ?? match[1]))
      if (from > count || to < from) continue
      ranges.push(from === to ? String(from) : `${from}-${to}`)
    }
    return ranges.length ? `{${ranges.join(',')}}` : ''
  })
}

/**
 * Code blocks: Mermaid becomes a diagram, a title="…" goes on the block for the
 * bar over its code, and the rest of the info is left for the highlighter.
 */
const rehypeCodeBlocks: Plugin<[], HastRoot> = () => tree => {
  visit(tree, 'element', (node: Element, index, parent) => {
    if (node.tagName !== 'pre' || !parent || index === undefined) return
    const code = node.children.find((child): child is Element => child.type === 'element' && child.tagName === 'code')
    if (!code) return
    const classes = className(code)
    if (classes.includes('language-mermaid')) {
      parent.children[index] = {
        type: 'element',
        tagName: 'div',
        properties: { className: ['mermaid-diagram'], dataChart: hastToString(code) },
        children: [],
      }
      return SKIP
    }
    const meta = typeof code.properties.metastring === 'string' ? clampLines(code.properties.metastring, hastToString(code)) : ''
    code.properties.metastring = meta
    const title = /title=(?:"([^"]*)"|'([^']*)'|(\S+))/.exec(meta)
    const language = classes.find(name => name.startsWith('language-'))?.slice(9) ?? null
    node.properties.dataLanguage = language ?? undefined
    if (!title) return
    code.properties.metastring = meta.replace(title[0], '').trim()
    node.properties.dataTitle = title[1] ?? title[2] ?? title[3] ?? ''
  })
}

/**
 * Links within the page (`#fn-1`, `#my-anchor`) to the prefixed ids the
 * cleaning gave their targets.
 */
const rehypeFragments: Plugin<[], HastRoot> = () => tree => {
  const ids = new Set<string>()
  visit(tree, 'element', (node: Element) => {
    if (typeof node.properties.id === 'string') ids.add(node.properties.id)
  })
  visit(tree, 'element', (node: Element) => {
    const href = node.properties.href
    if (node.tagName !== 'a' || typeof href !== 'string' || !href.startsWith('#')) return
    let target = href.slice(1)
    try {
      target = decodeURIComponent(target)
    } catch {}
    if (!ids.has(target) && ids.has(`user-content-${target}`)) node.properties.href = `#user-content-${target}`
  })
}

/**
 * Names a heading's id must not take: globals that scripts look up by name
 * and that an element with that id would stand in for.
 */
const RISKY_IDS = new Set(['process', 'global', 'globalthis', 'module', 'exports', 'require', 'define', 'buffer', 'turbopack', 'constructor', 'prototype'])

/** A heading's id from its words, made safe: a risky one gets `section-` in front. */
const rehypeSafeIds: Plugin<[], HastRoot> = () => tree => {
  visit(tree, 'element', (node: Element) => {
    const id = node.properties.id
    if (!/^h[1-6]$/.test(node.tagName) || typeof id !== 'string' || id.startsWith('user-content-')) return
    if (id.startsWith('_') || RISKY_IDS.has(id)) node.properties.id = `section-${id}`
  })
}

/** The info string has done its work: keep it out of the page. */
const rehypeDropMeta: Plugin<[], HastRoot> = () => tree => {
  visit(tree, 'element', (node: Element) => {
    if (node.tagName === 'code') delete node.properties.metastring
  })
}

/** Pictures load as they scroll into view. */
const rehypeImages: Plugin<[], HastRoot> = () => tree => {
  visit(tree, 'element', (node: Element) => {
    if (node.tagName === 'img') node.properties.loading = 'lazy'
  })
}

/** The page's sections for "On this page": its second and third level headings. */
const rehypeToc: Plugin<[TocItem[]], HastRoot> = toc => tree => {
  visit(tree, 'element', (node: Element) => {
    if ((node.tagName === 'h2' || node.tagName === 'h3') && typeof node.properties.id === 'string' && node.properties.id !== 'user-content-footnote-label') {
      toc.push({ id: node.properties.id, text: hastToString(node).trim(), depth: node.tagName === 'h2' ? 2 : 3 })
    }
  })
}

export function renderMarkdown(markdown: string): Rendered {
  const toc: TocItem[] = []
  const processor = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkMath)
    .use(remarkDirective)
    .use(remarkCallouts)
    .use(remarkAlerts)
    .use(remarkCodeMeta)
    // Footnotes get their prefix from the cleaning, like every other id.
    .use(remarkRehype, { allowDangerousHtml: true, clobberPrefix: '' })
    .use(rehypeRaw)
    .use(rehypeSanitize, SCHEMA)
    .use(rehypeSlug)
    .use(rehypeSafeIds)
    .use(rehypeFragments)
    .use(rehypeCodeBlocks)
    .use(rehypePrismCommon, { ignoreMissing: true })
    .use(rehypeDropMeta)
    .use(rehypeKatex, { strict: 'ignore' })
    .use(rehypeImages)
    .use(rehypeToc, toc)
  const tree = processor.runSync(processor.parse(markdown)) as HastRoot
  return { tree, toc }
}

/** The first paragraph's words, for a page's card in its folder. */
export function excerpt(markdown: string, max = 180): string {
  const tree = unified().use(remarkParse).use(remarkGfm).parse(markdown) as MdastRoot
  const paragraph = tree.children.find(node => node.type === 'paragraph')
  const text = paragraph ? toPlain(paragraph as never).replace(/\s+/g, ' ').trim() : ''
  return text.length > max ? `${text.slice(0, max).replace(/\s+\S*$/, '')}…` : text
}
