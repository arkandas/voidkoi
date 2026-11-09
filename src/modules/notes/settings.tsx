'use client';

import { ALargeSmall, CodeXml, Type } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

import { Card, CardTitle, Select, Spinner, useToast } from '@/components/ui';
import { useApiError } from '@/lib/use-api-error';
import { notesApi } from '@/modules/notes/lib/api';
import { CODE_FONTS, FONT_SIZES, TEXT_FONTS, type Font, type NoteSettings } from '@/modules/notes/lib/fonts';

/** Notes in Settings: the font notes are written and read in, the one for code, and the text size. */
export default function NotesSettings() {
  const t = useTranslations('notes.settings');
  const toast = useToast();
  const apiError = useApiError();
  const [settings, setSettings] = useState<NoteSettings | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    notesApi.settings().then(
      value => {
        if (active) setSettings(value);
      },
      error => {
        if (!active) return;
        setFailed(true);
        toast.show(apiError(error, 'loadFailed'), 'error');
      },
    );
    return () => {
      active = false;
    };
  }, [toast, apiError]);

  /** Shown at once. Should the server say no, what it has is read again. */
  const change = (changes: Partial<NoteSettings>): void => {
    if (!settings) return;
    const next = { ...settings, ...changes };
    setSettings(next);
    notesApi.saveSettings(next).catch(error => {
      toast.show(apiError(error, 'saveFailed'), 'error');
      notesApi.settings().then(setSettings, () => {});
    });
  };

  if (failed) return null;
  if (!settings) {
    return (
      <div className="flex justify-center py-12">
        <Spinner />
      </div>
    );
  }

  const fontOptions = (fonts: readonly Font[]) => fonts.map(font => ({ value: font.id, label: font.name ?? t('system') }));

  return (
    <Card>
      <CardTitle>{t('title')}</CardTitle>
      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <Select
          label={t('text')}
          icon={<Type size={16} />}
          options={fontOptions(TEXT_FONTS)}
          value={settings.textFont}
          onChange={event => change({ textFont: event.target.value as NoteSettings['textFont'] })}
        />
        <Select
          label={t('code')}
          icon={<CodeXml size={16} />}
          options={fontOptions(CODE_FONTS)}
          value={settings.codeFont}
          onChange={event => change({ codeFont: event.target.value as NoteSettings['codeFont'] })}
        />
        <Select
          label={t('size')}
          icon={<ALargeSmall size={16} />}
          options={FONT_SIZES.map(size => ({ value: String(size), label: t('sizeValue', { size }) }))}
          value={String(settings.fontSize)}
          onChange={event => change({ fontSize: Number(event.target.value) })}
        />
      </div>
    </Card>
  );
}
