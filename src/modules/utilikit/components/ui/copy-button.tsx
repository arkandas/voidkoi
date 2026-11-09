'use client';

import { Check, Copy } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';

import { Button, type ButtonSize, type ButtonVariant } from '@/components/ui';
import { cn } from '@/lib/cn';

async function copyText(text: string) {
  if (navigator.clipboard) return navigator.clipboard.writeText(text);

  const focused = document.activeElement;
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.readOnly = true;
  textarea.style.cssText = 'position: fixed; top: 0; left: -9999px; font-size: 16px';
  document.body.append(textarea);
  textarea.select();
  textarea.setSelectionRange(0, text.length);
  const copied = document.execCommand('copy');
  textarea.remove();
  if (focused instanceof HTMLElement) focused.focus({ preventScroll: true });
  if (!copied) throw new Error('The browser refused to copy');
}

interface CopyButtonProps {
  value: string | (() => string);
  label?: string;
  ariaLabel?: string;
  variant?: Exclude<ButtonVariant, 'destructive'>;
  size?: ButtonSize;
  disabled?: boolean;
  className?: string;
}

/** Copies a value and says so for two seconds. Without a label it is an icon, named for screen readers. */
export function CopyButton({ value, label, ariaLabel, variant = 'outline', size = 'sm', disabled, className }: CopyButtonProps) {
  const t = useTranslations('utilikit.common');
  const [copied, setCopied] = useState(false);
  const timer = useRef(0);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const copy = async () => {
    try {
      await copyText(typeof value === 'function' ? value() : value);
      setCopied(true);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  };

  const Icon = copied ? Check : Copy;
  const text = copied ? t('copied') : label;
  const name = copied ? t('copied') : (ariaLabel ?? t('copy'));

  return (
    <Button
      variant={variant}
      size={size}
      disabled={disabled}
      onClick={copy}
      title={label ? undefined : name}
      aria-label={label ? undefined : name}
      className={cn('shrink-0', !label && 'px-2.5', copied && 'text-success', className)}
    >
      <Icon size={15} aria-hidden="true" />
      {text}
    </Button>
  );
}
