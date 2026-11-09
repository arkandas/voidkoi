'use client';

import { Lock } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { cn } from '@/lib/cn';

import { Button } from './button';
import { fieldClasses } from './input';

export interface PasswordSettingProps {
  /** A password is saved already. */
  hasPassword: boolean;
  /** Replacing the saved one: the field shows instead. */
  changing: boolean;
  onChanging(): void;
  value: string;
  onValue(value: string): void;
  /** The field's name, also its placeholder. */
  label: string;
  maxLength?: number;
  className?: string;
}

/** The password of a link or a page: "A password is set" with Change, or the field for a new one. */
export function PasswordSetting({ hasPassword, changing, onChanging, value, onValue, label, maxLength, className }: PasswordSettingProps) {
  const t = useTranslations('password');
  if (hasPassword && !changing) {
    return (
      <div className={cn('flex items-center justify-between gap-3 rounded-lg bg-muted px-3 py-2 text-sm text-ink-muted dark:bg-canvas', className)}>
        <span className="flex items-center gap-2">
          <Lock size={15} aria-hidden="true" />
          {t('isSet')}
        </span>
        <Button size="sm" variant="ghost" onClick={onChanging}>
          {t('replace')}
        </Button>
      </div>
    );
  }
  return (
    <input
      type="password"
      autoComplete="new-password"
      aria-label={label}
      placeholder={label}
      value={value}
      maxLength={maxLength}
      onChange={event => onValue(event.target.value)}
      className={cn(fieldClasses, 'h-10 px-3.5 text-sm', className)}
    />
  );
}
