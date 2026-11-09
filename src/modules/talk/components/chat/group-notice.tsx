'use client';

import { describeNotice } from '@/modules/talk/lib/groups';
import { useNoticeWords } from '@/modules/talk/lib/hooks/use-notice-words';
import type { ChatMessage, GroupEvent, GroupInfo } from '@/modules/talk/lib/protocol';
import { useTimeFormat } from '@/modules/talk/lib/time';

/** Something that happened to the group, as a quiet centred line between the messages: "Ada added Grace". */
export function GroupNotice({ message, event, group, viewerId }: { message: ChatMessage; event: GroupEvent; group: GroupInfo | null; viewerId: number }) {
  const words = useNoticeWords();
  const format = useTimeFormat();
  return (
    <div className="flex justify-center py-1">
      <p className="max-w-[min(90%,34rem)] rounded-full border border-line bg-surface px-3 py-1 text-center text-xs font-medium text-ink-muted">
        {describeNotice(event, message.senderId, viewerId, group, words)}
        <span className="ml-2 font-normal text-ink-faint tabular-nums">{format.time(message.createdAt)}</span>
      </p>
    </div>
  );
}
