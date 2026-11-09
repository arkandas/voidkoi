'use client';

import { Check, Copy } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useId, useRef, useState, type ComponentProps } from 'react';

/**
 * A code block with a Copy button. With a title, the button sits at the end of
 * the title's bar. Without one, it shows in the top corner on hover, and on a
 * touch screen, where it always shows, the code starts below it.
 */
export function CodeBlock({ 'data-title': title, ...props }: ComponentProps<'pre'> & { 'data-title'?: string }) {
  const t = useTranslations('wiki.markdown');
  const ref = useRef<HTMLPreElement>(null);
  const titleId = useId();
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  const copy = async (): Promise<void> => {
    const code = ref.current?.querySelector('code') ?? ref.current;
    try {
      await navigator.clipboard.writeText((code?.textContent ?? '').replace(/\n$/, ''));
      setCopied(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1600);
    } catch {
      // Nothing to copy with: the text can still be selected by hand.
    }
  };

  const button = (
    <button
      type="button"
      onClick={() => void copy()}
      aria-label={copied ? t('copied') : t('copy')}
      title={copied ? t('copied') : t('copy')}
      className="code-copy"
    >
      {copied ? <Check size={15} aria-hidden="true" /> : <Copy size={15} aria-hidden="true" />}
    </button>
  );

  if (title !== undefined) {
    return (
      <figure className="code-figure" aria-labelledby={titleId}>
        <figcaption className="code-title">
          <span id={titleId}>{title}</span>
          {button}
        </figcaption>
        <pre ref={ref} {...props} />
      </figure>
    );
  }

  return (
    <div className="code-block">
      <pre ref={ref} {...props} />
      {button}
    </div>
  );
}
