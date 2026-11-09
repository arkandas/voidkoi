'use client';

import { Check, Copy } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState, type ReactNode } from 'react';

import { cn } from '@/lib/cn';

import { Button } from './button';
import { fieldClasses } from './input';
import { useToast } from './toast';

/** An address to read and copy, like a share link: the address, Copy, and any buttons passed in after them. */
export function CopyField({ value, label, children }: { value: string; label: string; children?: ReactNode }) {
  const t = useTranslations('common');
  const toast = useToast();
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  const copy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.show(t('copyFailed'), 'error');
    }
  };

  return (
    <div className="flex gap-2">
      <input
        readOnly
        value={value}
        aria-label={label}
        onFocus={event => event.currentTarget.select()}
        className={cn(fieldClasses, 'h-10 min-w-0 flex-1 px-3.5 font-mono text-[13px]')}
      />
      <Button onClick={() => void copy()} icon={copied ? <Check size={16} /> : <Copy size={16} />} className="shrink-0">
        {copied ? t('copied') : t('copy')}
      </Button>
      {children}
    </div>
  );
}
