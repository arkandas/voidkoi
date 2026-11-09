'use client';

import { Bell, BellOff, Send } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback } from 'react';

import { Alert, Button, Card, CardTitle, Spinner, useToast } from '@/components/ui';
import { usePush } from '@/modules/talk/lib/hooks/use-push';

/** Notifications on this device, and getting it onto the Home Screen, which an iPhone needs first. */
export function NotificationsCard() {
  const t = useTranslations('talk.settings.notifications');
  const toast = useToast();
  const onError = useCallback((message: string) => toast.show(message, 'error'), [toast]);
  const onTested = useCallback(() => toast.show(t('testSent'), 'success'), [toast, t]);
  const push = usePush({ onError, onTested });

  return (
    <Card>
      <CardTitle>{t('title')}</CardTitle>

      <div className="mt-5">
        {push.status === 'loading' ? (
          <Spinner label={t('checking')} />
        ) : push.status === 'insecure' ? (
          <Alert tone="info">{t('insecure')}</Alert>
        ) : push.status === 'needs-install' ? (
          <Alert tone="info" title={t('needsInstallTitle')}>
            <p className="mt-1 font-normal">{t('needsInstall')}</p>
          </Alert>
        ) : push.status === 'unsupported' ? (
          <p className="text-sm text-ink-muted">{t('unsupported')}</p>
        ) : push.status === 'denied' ? (
          <Alert tone="warning">{t('denied')}</Alert>
        ) : push.status === 'on' ? (
          <div className="flex flex-wrap items-center gap-3">
            <span className="mr-1 flex items-center gap-2 text-sm font-medium text-success">
              <span aria-hidden="true" className="size-2 rounded-full bg-success" />
              {t('on')}
            </span>
            <Button variant="outline" icon={<Send size={16} />} disabled={push.busy} onClick={() => void push.test()}>
              {t('sendTest')}
            </Button>
            <Button variant="ghost" icon={<BellOff size={16} />} disabled={push.busy} onClick={() => void push.disable()} className="text-ink-muted">
              {t('turnOff')}
            </Button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <Button icon={<Bell size={16} />} disabled={push.busy} onClick={() => void push.enable()}>
              {push.busy ? t('turningOn') : t('turnOn')}
            </Button>
            <span className="text-sm text-ink-muted">{t('off')}</span>
          </div>
        )}
      </div>
    </Card>
  );
}
