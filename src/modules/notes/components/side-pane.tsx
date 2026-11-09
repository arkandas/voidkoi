'use client';

import { Code, Eye, PanelLeft, X } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { IconButton, Segmented } from '@/components/ui';

import { MarkdownView } from './markdown-view';

type Show = 'source' | 'preview';

/**
 * A second note on the left, to read while writing the other. It stays until closed, and its header has the
 * tint its row in the list has, so the two read as one.
 */
export function SidePane({
  title,
  content,
  show,
  onShow,
  onClose,
  fontSize,
  lineHeight,
}: {
  title: string;
  content: string;
  show: Show;
  onShow(show: Show): void;
  onClose(): void;
  fontSize: number;
  lineHeight: number;
}) {
  const t = useTranslations('notes.side');

  return (
    <section
      aria-label={title}
      className="flex min-h-0 min-w-0 flex-[2] flex-col overflow-hidden bg-surface md:border-l md:border-line"
    >
      <div className="flex h-14 shrink-0 items-center gap-2 border-b border-accent/20 bg-accent-soft pr-2 pl-4">
        <PanelLeft size={16} aria-hidden="true" className="shrink-0 text-accent" />
        <h2 className="min-w-0 flex-1 truncate text-[15px] font-semibold text-ink">{title}</h2>
        <Segmented<Show>
          ariaLabel={t('view')}
          iconOnly
          value={show}
          onChange={onShow}
          options={[
            { value: 'source', label: t('source'), icon: Code },
            { value: 'preview', label: t('preview'), icon: Eye },
          ]}
        />
        <IconButton size="sm" label={t('close')} icon={<X size={15} />} onClick={onClose} />
      </div>
      {show === 'source' ? (
        <textarea
          readOnly
          value={content}
          aria-label={title}
          placeholder={t('empty')}
          spellCheck={false}
          className="themed-scroll min-h-0 flex-1 resize-none border-none bg-surface text-ink outline-hidden placeholder:text-ink-faint"
          style={{ fontFamily: 'var(--notes-text-font)', fontSize: `${fontSize}px`, lineHeight: `${lineHeight}px`, padding: '20px 24px' }}
        />
      ) : (
        <div className="themed-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain bg-surface">
          {content ? (
            <div className="markdown-body px-6 py-5">
              <MarkdownView text={content} />
            </div>
          ) : (
            <p className="px-6 py-5 text-sm text-ink-faint italic">{t('empty')}</p>
          )}
        </div>
      )}
    </section>
  );
}
