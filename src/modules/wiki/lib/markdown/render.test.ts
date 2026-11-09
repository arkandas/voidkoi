import type { Element, Root } from 'hast'
import { describe, expect, it } from 'vitest'
import { clampLines, excerpt, renderMarkdown } from '@/modules/wiki/lib/markdown/render'
import { imageKeysIn } from '@/modules/wiki/lib/markdown/images'

function find(tree: Root | Element, test: (node: Element) => boolean): Element[] {
  const found: Element[] = []
  const walk = (node: Root | Element): void => {
    for (const child of node.children) {
      if (child.type !== 'element') continue
      if (test(child)) found.push(child)
      walk(child)
    }
  }
  walk(tree)
  return found
}

const classes = (node: Element) => (node.properties.className as string[] | undefined) ?? []

describe('renderMarkdown', () => {
  it('turns Docusaurus blocks into callouts, with their title', () => {
    const { tree } = renderMarkdown(':::tip[Before you start]\nBack up first.\n:::')
    const [aside] = find(tree, node => node.tagName === 'aside')
    expect(classes(aside!)).toContain('callout-tip')
    expect(JSON.stringify(aside)).toContain('Before you start')
    expect(JSON.stringify(aside)).toContain('Back up first.')
  })

  it('turns GitHub alerts into callouts', () => {
    const { tree } = renderMarkdown('> [!WARNING]\n> Mind the gap.')
    const [aside] = find(tree, node => node.tagName === 'aside')
    expect(aside?.properties.dataCallout).toBe('warning')
    expect(JSON.stringify(aside)).toContain('Mind the gap.')
    expect(JSON.stringify(aside)).not.toContain('[!WARNING]')
  })

  it('leaves colons in ordinary text alone', () => {
    const { tree } = renderMarkdown('Meet at 10:30, see note:this and :smile.')
    expect(JSON.stringify(tree)).toContain('note:this')
    expect(JSON.stringify(tree)).toContain(':smile')
  })

  it('gives code blocks a title and highlighted lines', () => {
    const { tree } = renderMarkdown('```ts title="app.ts" {2}\nconst a = 1\nconst b = 2\n```')
    const [pre] = find(tree, node => node.tagName === 'pre')
    expect(pre?.properties.dataTitle).toBe('app.ts')
    expect(find(tree, node => classes(node).includes('highlight-line'))).toHaveLength(1)
    expect(JSON.stringify(tree)).not.toContain('metastring')
  })

  it('draws Mermaid blocks as diagrams', () => {
    const { tree } = renderMarkdown('```mermaid\ngraph TD; A-->B\n```')
    const [diagram] = find(tree, node => classes(node).includes('mermaid-diagram'))
    expect(diagram?.properties.dataChart).toContain('A-->B')
  })

  it('renders math', () => {
    const { tree } = renderMarkdown('Euler: $e^{i\\pi} + 1 = 0$')
    expect(find(tree, node => classes(node).includes('katex')).length).toBeGreaterThan(0)
  })

  it('removes scripts and event handlers from HTML', () => {
    const { tree } = renderMarkdown('<script>alert(1)</script><img src="x" onerror="alert(1)"><a href="javascript:alert(1)">x</a>')
    const text = JSON.stringify(tree)
    expect(text).not.toContain('script')
    expect(text).not.toContain('onerror')
    expect(text).not.toContain('javascript:')
  })

  it('lists second and third level headings for the table of contents', () => {
    const { toc } = renderMarkdown('# Title\n\n## Install\n\n### On a Mac\n\n#### Deep')
    expect(toc).toEqual([
      { id: 'install', text: 'Install', depth: 2 },
      { id: 'on-a-mac', text: 'On a Mac', depth: 3 },
    ])
  })

  it('keeps footnote links pointing at their notes', () => {
    const { tree } = renderMarkdown('Text[^1]\n\n[^1]: The note.')
    const [ref] = find(tree, node => node.tagName === 'a' && String(node.properties.href).startsWith('#'))
    const target = String(ref!.properties.href).slice(1)
    expect(find(tree, node => node.properties.id === target)).toHaveLength(1)
  })
})

describe('clampLines', () => {
  it('keeps highlighted lines to the lines a block has', () => {
    expect(clampLines('{1-999999999}', 'a\nb\nc')).toBe('{1-3}')
    expect(clampLines('title="x" {2,9,1-2}', 'a\nb')).toBe('title="x" {2,1-2}')
    expect(clampLines('{5}', 'a')).toBe('')
  })

  it('renders a block asking for a billion lines at once', () => {
    const started = Date.now()
    const { tree } = renderMarkdown('```js {1-999999999}\nconst a = 1\n```')
    expect(Date.now() - started).toBeLessThan(2000)
    expect(JSON.stringify(tree)).toContain('highlight-line')
  })
})

describe('ids written in pages', () => {
  it('prefixes ids and names from HTML, so they can’t stand in for globals', () => {
    const { tree } = renderMarkdown('<img id="currentScript" name="x" src="/a.png">')
    const [img] = find(tree, node => node.tagName === 'img')
    expect(img?.properties.id).toBe('user-content-currentScript')
    expect(img?.properties.name).toBe('user-content-x')
  })

  it('keeps headings’ ids readable, except risky names', () => {
    const { toc } = renderMarkdown('## Install\n\n## Process\n\n## __next_f')
    expect(toc.map(item => item.id)).toEqual(['install', 'section-process', 'section-__next_f'])
  })

  it('points links within the page at the prefixed ids', () => {
    const { tree } = renderMarkdown('<a href="#spot">go</a>\n\n<span id="spot">here</span>')
    const [link] = find(tree, node => node.tagName === 'a')
    expect(link?.properties.href).toBe('#user-content-spot')
  })

  it('keeps callouts to the five kinds', () => {
    const { tree } = renderMarkdown('<aside data-callout="constructor" class="callout callout-note fixed">x</aside>')
    const [aside] = find(tree, node => node.tagName === 'aside')
    expect(aside?.properties.dataCallout).toBeUndefined()
    expect(classes(aside!)).not.toContain('fixed')
  })
})

describe('excerpt', () => {
  it('takes the first paragraph as plain words', () => {
    expect(excerpt('# Title\n\nSome **bold** and [a link](/x).\n\nMore.')).toBe('Some bold and a link.')
  })
})

describe('imageKeysIn', () => {
  it('finds uploaded images once each', () => {
    const key = 'abcdefghijklmnopqrstuv'
    expect(imageKeysIn(`![a](/api/wiki/images/${key}) ![b](/api/wiki/images/${key}?x)`)).toEqual([key])
  })
})
