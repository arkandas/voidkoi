'use client';

import { useState, type CSSProperties, type ReactNode } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { saveAs } from 'file-saver';
import { Download, FileText } from 'lucide-react';
import { ToolLayout } from '@/modules/utilikit/components/tool-layout';
import { GuideCard } from '@/modules/utilikit/components/ui/guide-card';
import { CopyButton } from '@/modules/utilikit/components/ui/copy-button';
import { cn } from '@/lib/cn';
import { Button, Card, CardTitle } from '@/components/ui';
import { Textarea } from '@/modules/utilikit/components/ui/fields';
import { MARKDOWN_SAMPLES } from '@/modules/utilikit/lib/markdown-sample';

const PANE = 'h-[28rem] lg:h-[calc(100dvh-15.5rem)] lg:min-h-[28rem]';

const FEATURES = ['basicSyntax', 'lists', 'codeBlocks', 'tables', 'blockquotes', 'strikethrough'] as const;

const TOKEN_COLORS: [string, string[]][] = [
  ['var(--ink-muted)', ['prolog', 'doctype', 'cdata', 'punctuation']],
  ['var(--accent)', ['keyword', 'atrule', 'important', 'tag', 'selector', 'builtin']],
  ['var(--success)', ['string', 'char', 'attr-value', 'regex', 'inserted', 'url']],
  ['var(--warning)', ['number', 'boolean', 'constant', 'symbol', 'property', 'attr-name']],
  ['var(--danger)', ['deleted']],
];

const CODE_STYLE: Record<string, CSSProperties> = {
  ...Object.fromEntries(TOKEN_COLORS.flatMap(([color, tokens]) => tokens.map(token => [token, { color }]))),
  comment: { color: 'var(--ink-muted)', fontStyle: 'italic' },
};

const REMARK_PLUGINS = [remarkGfm];

function CodeBlockTag({ children }: { children?: ReactNode }) {
  return <>{children}</>;
}

const MARKDOWN_COMPONENTS: Components = {
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  ),
  code: ({ className, children }) => {
    const language = /language-(\w+)/.exec(className ?? '')?.[1];
    if (!language) return <code className={className}>{children}</code>;

    return (
      <SyntaxHighlighter language={language} style={CODE_STYLE} PreTag={CodeBlockTag}>
        {String(children).replace(/\n$/, '')}
      </SyntaxHighlighter>
    );
  },
};

export default function MarkdownPreview() {
  const t = useTranslations('utilikit.markdownPreview');
  const tc = useTranslations('utilikit.common');
  const locale = useLocale();

  const [markdown, setMarkdown] = useState('');

  return (
    <ToolLayout>
      <div className="grid grid-cols-1 gap-4 sm:gap-6 lg:grid-cols-2">
        <Card className="min-w-0">
          <div className="mb-4 flex min-h-8 flex-wrap items-center justify-between gap-2">
            <CardTitle>{t('editor')}</CardTitle>
            <div className="flex items-center gap-2">
              <Button onClick={() => setMarkdown(MARKDOWN_SAMPLES[locale])} size="sm" variant="ghost">
                {t('loadSample')}
              </Button>
              {markdown && (
                <>
                  <CopyButton value={markdown} variant="ghost" />
                  <Button
                    onClick={() => saveAs(new Blob([markdown], { type: 'text/markdown;charset=utf-8' }), 'document.md')}
                    size="sm"
                    variant="ghost"
                    title={tc('download')}
                    aria-label={tc('download')}
                    className="px-2.5"
                  >
                    <Download size={15} />
                  </Button>
                </>
              )}
            </div>
          </div>
          <Textarea
            value={markdown}
            onChange={event => setMarkdown(event.target.value)}
            placeholder={t('enterMarkdown')}
            aria-label={t('editor')}
            className={cn('resize-none font-mono sm:text-sm', PANE)}
          />
        </Card>

        <Card className="min-w-0">
          <div className="mb-4 flex min-h-8 items-center justify-between gap-2">
            <CardTitle>{tc('preview')}</CardTitle>
            <FileText size={20} className="text-ink-muted" />
          </div>
          {markdown ? (
            <div className={cn('markdown-content themed-scroll overflow-auto rounded-lg border border-line bg-raised p-4 text-ink', PANE)}>
              <ReactMarkdown remarkPlugins={REMARK_PLUGINS} components={MARKDOWN_COMPONENTS}>
                {markdown}
              </ReactMarkdown>
            </div>
          ) : (
            <div
              className={cn(
                'flex items-center justify-center rounded-lg border border-line bg-raised p-4 text-center text-sm text-ink-muted',
                PANE
              )}
            >
              <p>{t('previewWillAppear')}</p>
            </div>
          )}
        </Card>
      </div>

      <GuideCard className="mt-4 sm:mt-6">
        <CardTitle className="mb-3">{t('supportedFeatures')}</CardTitle>
        <dl className="grid grid-cols-1 gap-3 text-sm md:grid-cols-2">
          {FEATURES.map(feature => (
            <div key={feature}>
              <dt className="font-medium text-ink">{t(`features.${feature}.title`)}</dt>
              <dd className="text-ink-muted">{t(`features.${feature}.description`)}</dd>
            </div>
          ))}
        </dl>
      </GuideCard>
    </ToolLayout>
  );
}
