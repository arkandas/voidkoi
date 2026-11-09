import type { Root } from 'hast';
import { toJsxRuntime, type Components } from 'hast-util-to-jsx-runtime';
import { AlertTriangle, Flame, Info, Lightbulb, NotebookPen, type LucideIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import type { ComponentProps, ReactNode } from 'react';
import { Fragment, jsx, jsxs } from 'react/jsx-runtime';

import { cn } from '@/lib/cn';
import { CALLOUTS, type Callout as CalloutKind } from '@/modules/wiki/lib/markdown/render';

import { CodeBlock } from './code-block';
import { Mermaid } from './mermaid';

const CALLOUT_ICONS: Record<CalloutKind, LucideIcon> = {
  note: NotebookPen,
  tip: Lightbulb,
  info: Info,
  warning: AlertTriangle,
  danger: Flame,
};

function Callout({ kind, children }: { kind: CalloutKind; children: ReactNode }) {
  const t = useTranslations('wiki.markdown.callouts');
  const Icon = CALLOUT_ICONS[kind] ?? Info;
  const items = Array.isArray(children) ? children : [children];
  // A `:::note[Title]` brings its own title as the first paragraph.
  const isTitle = (child: unknown): boolean => (child as { props?: { className?: string } })?.props?.className === 'callout-title';
  const own = items.find(isTitle) as { props: { children?: ReactNode } } | undefined;
  return (
    <aside className={`callout callout-${kind}`}>
      <p className="callout-title">
        <Icon size={16} aria-hidden="true" className="callout-icon" />
        <span>{own ? own.props.children : t(kind)}</span>
      </p>
      <div className="callout-body">{items.filter(child => !isTitle(child))}</div>
    </aside>
  );
}

function Heading({ level, id, children, ...props }: ComponentProps<'h2'> & { level: 2 | 3 | 4 }) {
  const Tag = `h${level}` as const;
  return (
    <Tag id={id} {...props}>
      {children}
      {id ? (
        <a href={`#${id}`} className="heading-anchor" aria-hidden="true" tabIndex={-1}>
          #
        </a>
      ) : null}
    </Tag>
  );
}

function components(newTabs: boolean): Partial<Components> {
  return {
    pre: props => <CodeBlock {...props} />,
    div: ({ className, ...props }) => {
      const chart = (props as { 'data-chart'?: string })['data-chart'];
      if (className === 'mermaid-diagram' && typeof chart === 'string') return <Mermaid chart={chart} />;
      return <div className={className} {...props} />;
    },
    aside: ({ children, ...props }) => {
      const asked = (props as { 'data-callout'?: string })['data-callout'];
      const kind: CalloutKind = (CALLOUTS as readonly string[]).includes(asked ?? '') ? (asked as CalloutKind) : 'note';
      return <Callout kind={kind}>{children}</Callout>;
    },
    h2: props => <Heading level={2} {...props} />,
    h3: props => <Heading level={3} {...props} />,
    h4: props => <Heading level={4} {...props} />,
    a: ({ href, children, ...props }) => {
      const internal = typeof href === 'string' && href.startsWith('/') && !href.startsWith('//') && !href.startsWith('/api/');
      if (internal && !newTabs) {
        return (
          <Link href={href} {...props}>
            {children}
          </Link>
        );
      }
      const leaves = newTabs ? !href?.startsWith('#') : typeof href === 'string' && /^https?:\/\//i.test(href);
      return (
        <a href={href} {...props} {...(leaves ? { target: '_blank', rel: 'noreferrer noopener' } : {})}>
          {children}
        </a>
      );
    },
    img: ({ alt, ...props }) => <img alt={alt ?? ''} decoding="async" {...props} />,
    table: props => (
      <div className="table-scroll">
        <table {...props} />
      </div>
    ),
  };
}

const READING = components(false);
const PREVIEW = components(true);

/**
 * A page's rendered Markdown, the same on the page, in the editor's preview and
 * on a share link's page. In the preview, links open in a new tab, so a click
 * never leaves the editor.
 */
export function MarkdownView({ tree, className, preview = false }: { tree: Root; className?: string; preview?: boolean }) {
  return (
    <div className={cn('wiki-content', className)}>
      {toJsxRuntime(tree, { Fragment, jsx, jsxs, components: preview ? PREVIEW : READING, passKeys: true })}
    </div>
  );
}
