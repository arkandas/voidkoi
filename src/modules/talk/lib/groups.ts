/**
 * Saying things about group chats: who a message is from, what a notice
 * means, and who is in the group. Pure, and handed its words, so the list,
 * the header and the timeline all say it the same way in either language.
 */
import type englishTalk from '@/messages/en/talk.json';

import type { ConversationSummary, GroupEvent, GroupInfo, GroupMember, TimelineItem } from './protocol';

/** The `talk.chat.notice` catalog, as a plain function so this module works outside React. */
export type NoticeWords = (key: keyof typeof englishTalk.chat.notice, values?: Record<string, string | number>) => string;

/** Past this many people the header counts them instead of naming them. */
const NAMED_MEMBERS_MAX = 4;

/** What a conversation is called: the other person, or the group's name. */
export function conversationTitle(conversation: ConversationSummary): string {
  return conversation.group?.name ?? conversation.other?.displayName ?? '';
}

/** Anyone who is or was in the group. Former members still name old messages. */
export function findMember(group: GroupInfo | null, userId: number | null): GroupMember | null {
  if (group === null || userId === null) return null;
  return group.members.find((member) => member.id === userId) ?? null;
}

export function isOwner(group: GroupInfo | null, userId: number): boolean {
  return group !== null && group.active && group.ownerId === userId;
}

/** Only the people still in it: the ones a header names and an owner can remove. */
export function activeMembers(group: GroupInfo): GroupMember[] {
  return group.members.filter((member) => member.active);
}

/**
 * A group notice as a sentence: "Ada added Grace", "You left", "Ada removed
 * you". The viewer is always "you", whichever side of it they were on.
 */
export function describeNotice(
  event: GroupEvent,
  actorId: number | null,
  viewerId: number,
  group: GroupInfo | null,
  words: NoticeWords,
): string {
  const nameOf = (userId: number | null): string =>
    findMember(group, userId)?.displayName ?? words('someone');
  const who = {
    actor: nameOf(actorId),
    target: nameOf(event.userId),
    actorIsYou: actorId === viewerId ? 'yes' : 'no',
    targetIsYou: event.userId === viewerId ? 'yes' : 'no',
  };
  // A rename says the name it got then, not whatever it is called now.
  const name = event.text ?? group?.name ?? '';

  switch (event.type) {
    case 'created':
      return words('created', { ...who, name });
    case 'renamed':
      return words('renamed', { ...who, name });
    case 'added':
      return words('added', who);
    case 'removed':
      return words('removed', who);
    case 'left':
      return words('left', who);
    case 'owner':
      return words('owner', who);
    case 'photo':
      return words(event.text === 'removed' ? 'photoRemoved' : 'photoChanged', who);
  }
}

/**
 * The line under a group's name: "Ada, Grace and you", or "12 members" once
 * naming everybody would only be truncated. Someone who has left is not in
 * it, so they are not named.
 */
export function membersLine(
  group: GroupInfo,
  viewerId: number,
  locale: string,
  words: NoticeWords,
): string {
  const members = activeMembers(group);
  const others = members.filter((member) => member.id !== viewerId);
  const includesYou = members.length > others.length;

  if (members.length > NAMED_MEMBERS_MAX) return words('memberCount', { count: members.length });
  if (others.length === 0) return includesYou ? words('onlyYou') : words('memberCount', { count: 0 });

  const names = others.map((member) => member.displayName);
  if (includesYou) names.push(words('youInList'));
  return new Intl.ListFormat(locale, { style: 'long', type: 'conjunction' }).format(names);
}

/** The words a preview needs besides the notices. */
export interface PreviewWords {
  notice: NoticeWords;
  deleted: string;
  photo: string;
  noMessages: string;
}

/** A first name is enough in a preview, where the line is truncated anyway. */
function firstName(displayName: string): string {
  return displayName.trim().split(/\s+/)[0] ?? displayName;
}

/**
 * The line under a name in the list. A file has no text of its own, so it is
 * described; a withdrawn message is said in the reader's language; in a group,
 * who said it comes first: "Ada: hola", "You: hola".
 */
export function previewLine(
  conversation: ConversationSummary,
  viewerId: number,
  words: PreviewWords,
): string {
  const { group } = conversation;
  if (conversation.lastEvent) {
    return describeNotice(
      conversation.lastEvent,
      conversation.lastSenderId ?? null,
      viewerId,
      group,
      words.notice,
    );
  }
  if (conversation.lastMessageDeleted) return words.deleted;

  const file = conversation.lastAttachment;
  const text = file
    ? file.isImage
      ? `📷 ${words.photo}`
      : `📎 ${file.name}`
    : conversation.lastMessage;
  if (text === null || text === undefined) return words.noMessages;
  if (group === null || conversation.lastSenderId === null || conversation.lastSenderId === undefined) {
    return text;
  }

  const name =
    conversation.lastSenderId === viewerId
      ? words.notice('you')
      : firstName(findMember(group, conversation.lastSenderId)?.displayName ?? words.notice('someone'));
  return words.notice('sender', { name, text });
}

/**
 * Whether a message in a group names its sender above the text. Only the
 * first of a run from the same person does, the way a group chat reads; a
 * notice, a call or a new day starts a new run.
 */
export function startsRun(previous: TimelineItem | undefined, item: TimelineItem): boolean {
  if (item.kind !== 'message' || item.event) return false;
  if (previous === undefined || previous.kind !== 'message' || previous.event) return true;
  return previous.senderId !== item.senderId;
}
