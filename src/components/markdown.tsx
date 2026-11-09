'use client';

import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';

const GFM = [remarkGfm];

/** Links open in a new tab, and a click on one stays with the link: it doesn't open or drag a card it sits in. */
const COMPONENTS: Components = {
  a: ({ href, title, children }) => (
    <a href={href} title={title} target="_blank" rel="noopener noreferrer" onClick={event => event.stopPropagation()}>
      {children}
    </a>
  ),
};

/**
 * Markdown as text, without raw HTML, and only links a browser can follow
 * safely. GitHub's flavour (tables, task lists) unless `plain`. The look comes
 * from the class: `markdown-body` for documents, an app's own for compact text.
 * Notes draws its preview with its own pipeline, which allows some HTML.
 */
export function Markdown({ children, className, plain = false }: { children: string; className?: string; plain?: boolean }) {
  return (
    <div className={className}>
      <ReactMarkdown remarkPlugins={plain ? undefined : GFM} components={COMPONENTS}>
        {children}
      </ReactMarkdown>
    </div>
  );
}
