'use client';

import { Check, Copy } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { memo, useState, type ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { gruvboxDark } from 'react-syntax-highlighter/dist/esm/styles/prism';

import { MARKDOWN_PLUGINS, REHYPE_PLUGINS } from '@/modules/notes/lib/markdown';

type Position = { start: { line: number }; end: { line: number } };

/** The highlighting colours, in the code font picked in Settings. */
const CODE_THEME = {
  ...gruvboxDark,
  'pre[class*="language-"]': { ...gruvboxDark['pre[class*="language-"]'], fontFamily: 'var(--notes-code-font)' },
  'code[class*="language-"]': { ...gruvboxDark['code[class*="language-"]'], fontFamily: 'var(--notes-code-font)' },
};

/** Code in a note: a highlighted block with a copy button, or a word in the text. */
function CodeBlock({ className, children, node }: { className?: string; children?: ReactNode; node?: unknown }) {
  const t = useTranslations('notes.preview');
  const [copied, setCopied] = useState(false);
  const language = /language-(\w+)/.exec(className || '')?.[1];
  const position = (node as { position?: Position } | undefined)?.position;
  const block = position?.start.line !== position?.end.line;
  const text = String(children).replace(/\n$/, '');

  const copy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {}
  };

  if (language || block) {
    return (
      <div className="highlighted-block group/code relative">
        <button
          type="button"
          onClick={() => void copy()}
          title={t('copyCode')}
          className="absolute top-2 right-2 z-10 flex h-8 items-center gap-1.5 rounded-md bg-white/10 px-2.5 text-xs font-medium text-white/90 opacity-0 transition-opacity group-hover/code:opacity-100 hover:bg-white/20 focus:opacity-100 [@media(hover:none)]:opacity-100"
        >
          {copied ? <Check size={13} /> : <Copy size={13} />}
          {copied ? t('copied') : t('copy')}
        </button>
        <SyntaxHighlighter
          style={CODE_THEME}
          language={language ?? 'text'}
          PreTag="div"
          showLineNumbers
          customStyle={{ borderRadius: '10px', fontSize: '0.85em', margin: 0, padding: '1.25em' }}
        >
          {text}
        </SyntaxHighlighter>
      </div>
    );
  }

  return <code>{children}</code>;
}

/**
 * A task list's box: the only input the sanitizer lets through. `checked` is
 * always set, or a ticked box and an empty one swapping places as the text
 * changes would switch React between a controlled and an uncontrolled input.
 */
function TaskBox({ checked }: { checked?: boolean }) {
  return <input type="checkbox" checked={Boolean(checked)} disabled readOnly />;
}

const COMPONENTS = { code: CodeBlock, input: TaskBox };
const PLAIN = { input: TaskBox };

/** A note drawn: GitHub's Markdown, HTML within limits, formulas and highlighted code. */
export const MarkdownView = memo(function MarkdownView({ text, plain = false }: { text: string; plain?: boolean }) {
  return (
    <ReactMarkdown remarkPlugins={MARKDOWN_PLUGINS} rehypePlugins={REHYPE_PLUGINS} components={plain ? PLAIN : COMPONENTS}>
      {text}
    </ReactMarkdown>
  );
});
