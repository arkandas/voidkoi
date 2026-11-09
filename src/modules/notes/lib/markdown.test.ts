import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ReactMarkdown from 'react-markdown';
import { describe, expect, it } from 'vitest';
import { MARKDOWN_PLUGINS, REHYPE_PLUGINS } from './markdown';

function render(markdown: string) {
  return renderToStaticMarkup(
    createElement(ReactMarkdown, { remarkPlugins: MARKDOWN_PLUGINS, rehypePlugins: REHYPE_PLUGINS }, markdown),
  );
}

describe('markdown rendering', () => {
  it('renders HTML written in a note', () => {
    const html = render('Press <kbd>Ctrl</kbd>, <mark>marked</mark>, H<sub>2</sub>O, <span style="color:red">red</span>.');
    expect(html).toContain('<kbd>Ctrl</kbd>');
    expect(html).toContain('<mark>marked</mark>');
    expect(html).toContain('<sub>2</sub>');
    expect(html).toContain('<span style="color:red">red</span>');
  });

  it('keeps sizes and alignment on images', () => {
    const html = render('<div align="center">\n<img src="/api/notes/images/abc" width="200" alt="pic">\n</div>');
    expect(html).toContain('<div align="center">');
    expect(html).toContain('<img src="/api/notes/images/abc" width="200" alt="pic"/>');
  });

  it('renders markdown inside an HTML block', () => {
    const html = render('<details>\n<summary>More</summary>\n\nHidden **part**\n\n</details>');
    expect(html).toContain('<summary>More</summary>');
    expect(html).toContain('<p>Hidden <strong>part</strong></p>');
  });

  it('renders video and audio, but no frames from other sites', () => {
    const html = render('<iframe width="560" height="315" src="https://example.com/login" allow="camera; microphone" allowfullscreen></iframe>');
    expect(html).not.toContain('iframe');
    expect(html).not.toContain('camera');
    expect(render('<video controls src="https://example.com/v.mp4"></video>')).toContain('<video controls="" src="https://example.com/v.mp4">');
  });

  it('keeps inline styles for colour and type, and drops the ones that place, size or load', () => {
    const html = render('<span style="color:#c00;position:fixed;inset:0;z-index:9;font-weight:bold">a</span> <b style="background-image:url(https://example.com/t.png)">b</b> <i style="background-color: url(x)">c</i>');
    expect(html).toContain('<span style="color:#c00;font-weight:bold">a</span>');
    expect(html).toContain('<b>b</b>');
    expect(html).toContain('<i>c</i>');
    expect(html).not.toContain('position');
    expect(html).not.toContain('url(');
  });

  it('drops scripts and styles together with their contents', () => {
    const html = render('<script>alert(1)</script>\n\n<script async src="https://example.com/x.js"></script>\n\n<style>body{display:none}</style>\n\nkept');
    expect(html).not.toContain('script');
    expect(html).not.toContain('alert');
    expect(html).not.toContain('display:none');
    expect(html).toContain('kept');
  });

  it('drops event handlers and javascript URLs', () => {
    const html = render('<img src="/a.png" onerror="alert(1)">\n\n<a href="javascript:alert(1)">link</a>\n\n<iframe srcdoc="<b>x</b>" src="javascript:alert(1)"></iframe>');
    expect(html).not.toContain('onerror');
    expect(html).not.toContain('javascript');
    expect(html).not.toContain('srcdoc');
    expect(html).toContain('<img src="/a.png"/>');
  });

  it('drops tags that would reach outside the note', () => {
    const html = render('<title>Hijacked</title>\n\n<meta http-equiv="refresh" content="0">\n\n<link rel="stylesheet" href="https://example.com/x.css">\n\n<base href="https://example.com/">\n\n<form action="/api/notes/trash"><button>go</button></form>');
    for (const tag of ['<title', '<meta', '<link rel="stylesheet"', '<base', '<form', '<button']) {
      expect(html).not.toContain(tag);
    }
  });

  it('drops classes and names, which could collide with the app', () => {
    const html = render('<div class="fixed inset-0 hidden" id="intro">text</div>\n\n<img name="createElement" src="/a.png">');
    expect(html).toContain('<div id="intro">text</div>');
    expect(html).not.toContain('createElement');
  });

  it('keeps footnote links pointing at their ids', () => {
    const html = render('A note[^1].\n\n[^1]: The footnote.');
    expect(html).toContain('href="#user-content-fn-1"');
    expect(html).toContain('id="user-content-fn-1"');
    expect(html).toContain('href="#user-content-fnref-1"');
    expect(html).toContain('id="user-content-fnref-1"');
  });

  it('still renders code, task lists, tables and math', () => {
    const html = render('```js\nconst a = 1 < 2;\n```\n\n- [x] done\n\n| a |\n|---|\n| 1 |\n\n$c = n \\cdot t$');
    expect(html).toContain('<code class="language-js">const a = 1 &lt; 2;');
    expect(html).toContain('<input type="checkbox" disabled="" checked=""/>');
    expect(html).toContain('<td>1</td>');
    expect(html).toContain('class="katex"');
  });

  it('shows text that only looks like a tag', () => {
    expect(render('a < b and c > d')).toContain('a &lt; b and c &gt; d');
    expect(render('`<div>` in code')).toContain('<code>&lt;div&gt;</code>');
  });
});
