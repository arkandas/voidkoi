'use client';

import { BellRing, MessageCircle, Play } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useSyncExternalStore } from 'react';

import { Card, CardTitle, IconButton, Select } from '@/components/ui';
import {
  MESSAGE_STYLES,
  RINGTONE_STYLES,
  messageStyle,
  playMessageTone,
  previewRingtone,
  ringtoneStyle,
  setMessageStyle,
  setRingtoneStyle,
  subscribeSoundChoices,
  type MessageStyle,
  type RingtoneStyle,
} from '@/modules/talk/lib/tones';

/** Which ringtone and which message sound, kept in this browser. */
export function SoundsCard() {
  const t = useTranslations('talk.settings.sounds');
  // The server render can't see this browser's choice, so it draws the default.
  const ringtone = useSyncExternalStore(subscribeSoundChoices, ringtoneStyle, () => 'chime' as const);
  const message = useSyncExternalStore(subscribeSoundChoices, messageStyle, () => 'chime' as const);

  return (
    <Card>
      <CardTitle>{t('title')}</CardTitle>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div className="flex items-end gap-2">
          <div className="min-w-0 flex-1">
            <Select
              label={t('ringtone')}
              icon={<BellRing size={16} />}
              options={RINGTONE_STYLES.map(style => ({ value: style, label: t(`styles.${style}`) }))}
              value={ringtone}
              onChange={event => {
                const style = event.target.value as RingtoneStyle;
                setRingtoneStyle(style);
                previewRingtone(style);
              }}
            />
          </div>
          <IconButton variant="outline" label={t('play')} onClick={() => previewRingtone(ringtone)} icon={<Play size={16} />} />
        </div>
        <div className="flex items-end gap-2">
          <div className="min-w-0 flex-1">
            <Select
              label={t('messages')}
              icon={<MessageCircle size={16} />}
              options={MESSAGE_STYLES.map(style => ({ value: style, label: t(`styles.${style}`) }))}
              value={message}
              onChange={event => {
                const style = event.target.value as MessageStyle;
                setMessageStyle(style);
                playMessageTone(style);
              }}
            />
          </div>
          <IconButton variant="outline" label={t('play')} disabled={message === 'off'} onClick={() => playMessageTone(message)} icon={<Play size={16} />} />
        </div>
      </div>
    </Card>
  );
}
