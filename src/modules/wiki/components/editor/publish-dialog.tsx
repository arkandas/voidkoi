'use client';

import { Loader2, Send } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useMemo, useState, type FormEvent } from 'react';

import { Button, Input, Modal } from '@/components/ui';
import { diffStats, diffText } from '@/modules/wiki/lib/diff-view';
import { LIMITS } from '@/modules/wiki/lib/validate';

/** Publishing: how much changed since the published version, and a few words on what. */
export function PublishDialog({
  open,
  before,
  after,
  firstTime,
  onClose,
  onPublish,
}: {
  open: boolean;
  before: { title: string; content: string } | null;
  after: { title: string; content: string };
  firstTime: boolean;
  onClose(): void;
  onPublish(message: string): Promise<void>;
}) {
  const t = useTranslations('wiki.editor.publishDialog');
  const tCommon = useTranslations('common');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  // Opened again: from the start.
  const [shownOpen, setShownOpen] = useState(open);
  if (open !== shownOpen) {
    setShownOpen(open);
    if (open) {
      setMessage('');
      setBusy(false);
    }
  }

  const stats = useMemo(() => (open && before ? diffStats(diffText(before.content, after.content)) : null), [open, before, after.content]);
  const renamed = before !== null && before.title !== after.title;

  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    setBusy(true);
    try {
      await onPublish(message.trim());
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} label={t('title')} title={t('title')} onClose={busy ? undefined : onClose}>
      <form onSubmit={submit} className="space-y-4">
        {firstTime ? (
          <p className="text-[15px] text-ink-muted">{t('first')}</p>
        ) : stats ? (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
            <span className="font-semibold text-success tabular-nums">{t('added', { count: stats.added })}</span>
            <span className="font-semibold text-danger tabular-nums">{t('removed', { count: stats.removed })}</span>
            {renamed ? <span className="text-ink-muted">{t('renamed', { from: before!.title, to: after.title })}</span> : null}
          </div>
        ) : null}
        <Input
          label={t('message')}
          placeholder={t('messagePlaceholder')}
          maxLength={LIMITS.publishMessage}
          value={message}
          onChange={event => setMessage(event.target.value)}
          autoFocus
        />
        <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={onClose} disabled={busy}>
            {tCommon('cancel')}
          </Button>
          <Button type="submit" disabled={busy} icon={busy ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}>
            {t('submit')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
