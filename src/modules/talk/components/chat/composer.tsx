'use client';

import { Paperclip, SendHorizontal } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useRef, useState, type ClipboardEvent, type KeyboardEvent } from 'react';

import { IconButton, Textarea } from '@/components/ui';
import { MESSAGE_MAX } from '@/modules/talk/lib/protocol';

/** Matches `max-h-40` on the textarea: about six lines before it scrolls. */
const MAX_HEIGHT_PX = 160;

export interface ComposerProps {
  onSend(text: string): void;
  /** Files picked, or pasted, to send. Each one becomes its own message. */
  onFiles?(files: File[]): void;
  placeholder?: string;
}

/** Enter sends, Shift+Enter starts a new line. The field grows to a few lines. */
export function Composer({ onSend, onFiles, placeholder }: ComposerProps) {
  const t = useTranslations('talk.chat.composer');
  const [text, setText] = useState('');
  const ref = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  // A screenshot pasted into the field is a picture to send; pasted words stay words.
  const onPaste = (event: ClipboardEvent<HTMLTextAreaElement>): void => {
    if (!onFiles) return;
    const files = [...event.clipboardData.files];
    if (files.length === 0) return;
    event.preventDefault();
    onFiles(files);
  };

  const submit = useCallback(() => {
    const trimmed = text.trim();
    if (trimmed === '') return;
    onSend(trimmed);
    setText('');
    // Back to one line after sending.
    if (ref.current) ref.current.style.height = '';
  }, [text, onSend]);

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  };

  return (
    <div className="flex items-end gap-2 border-t border-line bg-surface px-3 py-3 sm:px-4">
      {onFiles ? (
        <>
          <input
            ref={fileInput}
            type="file"
            multiple
            tabIndex={-1}
            aria-label={t('chooseFiles')}
            className="sr-only"
            onChange={event => {
              const files = [...(event.target.files ?? [])];
              // Cleared, so choosing the same file again still fires a change.
              event.target.value = '';
              if (files.length > 0) onFiles(files);
            }}
          />
          <IconButton label={t('attach')} onClick={() => fileInput.current?.click()} icon={<Paperclip size={19} />} />
        </>
      ) : null}
      <Textarea
        ref={ref}
        rows={1}
        value={text}
        maxLength={MESSAGE_MAX}
        onChange={event => {
          setText(event.target.value);
          // Grow with the message up to a few lines, then scroll. The height includes the border; scrollHeight doesn't.
          const element = event.target;
          element.style.height = 'auto';
          const border = element.offsetHeight - element.clientHeight;
          element.style.height = `${Math.min(element.scrollHeight + border, MAX_HEIGHT_PX)}px`;
        }}
        onKeyDown={onKeyDown}
        onPaste={onPaste}
        placeholder={placeholder ?? t('placeholder')}
        aria-label={t('label')}
        containerClassName="flex-1"
        className="max-h-40 min-h-10 py-[7px] leading-6"
      />
      <IconButton variant="default" label={t('send')} onClick={submit} disabled={text.trim() === ''} icon={<SendHorizontal size={18} />} />
    </div>
  );
}
