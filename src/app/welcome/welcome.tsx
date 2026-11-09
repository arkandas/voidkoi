'use client';

import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { AppPicker } from '@/components/apps/app-picker';
import { Mark } from '@/components/brand/mark';
import { Wordmark } from '@/components/brand/wordmark';
import { AuthPage } from '@/components/layout/auth-card';
import { Button, useToast } from '@/components/ui';
import { api } from '@/lib/api';
import { useApiError } from '@/lib/use-api-error';
import { isAppId } from '@/modules/registry';

export function Welcome({ initial }: { initial: string[] }) {
  const t = useTranslations('welcome');
  const router = useRouter();
  const toast = useToast();
  const apiError = useApiError();
  const [apps, setApps] = useState(initial);
  const [saving, setSaving] = useState(false);
  const none = !apps.some(isAppId);

  const save = async (): Promise<void> => {
    setSaving(true);
    try {
      await api.saveApps(apps);
      router.replace('/');
    } catch (error) {
      toast.show(apiError(error, 'saveFailed'), 'error');
      setSaving(false);
    }
  };

  return (
    <AuthPage width="md">
      <main className="space-y-6">
        <header className="flex items-center gap-3.5">
          <Mark size={44} />
          <Wordmark height={18} className="text-ink" />
        </header>
        <h1 className="text-2xl font-bold tracking-tight text-ink">{t('title')}</h1>
        <AppPicker value={apps} onChange={setApps} disabled={saving} />
        <div className="flex items-center justify-end gap-3">
          {none ? <p className="text-sm font-medium text-danger">{t('pickOne')}</p> : null}
          <Button size="lg" onClick={() => void save()} disabled={saving || none}>
            {saving ? t('saving') : t('continue')}
          </Button>
        </div>
      </main>
    </AuthPage>
  );
}
