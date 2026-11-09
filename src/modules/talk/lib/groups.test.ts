import { createTranslator } from 'next-intl';
import { describe, expect, it } from 'vitest';
import englishTalk from '@/messages/en/talk.json';
import spanishTalk from '@/messages/es/talk.json';

import {
  conversationTitle,
  describeNotice,
  membersLine,
  previewLine,
  startsRun,
  type NoticeWords,
  type PreviewWords,
} from './groups';
import type { ConversationSummary, GroupEvent, GroupInfo, GroupMember, TimelineItem } from './protocol';

function wordsFor(locale: 'en' | 'es'): NoticeWords {
  const chat = (locale === 'en' ? englishTalk : spanishTalk).chat;
  const t = createTranslator({ locale, messages: { notice: chat.notice }, namespace: 'notice' });
  return (key, values) => t(key, values);
}

const english = wordsFor('en');
const spanish = wordsFor('es');

const ADA = 1;
const GRACE = 2;
const ALAN = 3;

function member(id: number, displayName: string, active = true): GroupMember {
  return {
    id,
    username: displayName.toLowerCase().split(' ')[0]!,
    displayName,
    avatar: null,
    status: 'offline',
    active,
  };
}

function group(overrides: Partial<GroupInfo> = {}): GroupInfo {
  return {
    name: 'Familia',
    photoVersion: null,
    ownerId: ADA,
    members: [member(ADA, 'Ada Lovelace'), member(GRACE, 'Grace Hopper'), member(ALAN, 'Alan Turing')],
    active: true,
    ...overrides,
  };
}

const event = (type: GroupEvent['type'], userId: number | null = null, text: string | null = null) => ({
  type,
  userId,
  text,
});

describe('describeNotice', () => {
  it('names who did it, and says "you" for the viewer', () => {
    expect(describeNotice(event('created', null, 'Familia'), ADA, GRACE, group(), english)).toBe(
      'Ada Lovelace created the group “Familia”',
    );
    expect(describeNotice(event('created', null, 'Familia'), ADA, ADA, group(), english)).toBe(
      'You created the group “Familia”',
    );
    expect(describeNotice(event('added', GRACE), ADA, ALAN, group(), english)).toBe(
      'Ada Lovelace added Grace Hopper',
    );
    expect(describeNotice(event('added', GRACE), ADA, GRACE, group(), english)).toBe(
      'Ada Lovelace added you',
    );
    expect(describeNotice(event('removed', GRACE), ADA, ADA, group(), english)).toBe(
      'You removed Grace Hopper',
    );
    expect(describeNotice(event('left'), GRACE, GRACE, group(), english)).toBe('You left');
    expect(describeNotice(event('owner', GRACE), GRACE, ADA, group(), english)).toBe(
      'Grace Hopper is now the owner',
    );
    expect(describeNotice(event('owner', GRACE), GRACE, GRACE, group(), english)).toBe(
      'You’re now the owner',
    );
  });

  it('says when the photo was changed or taken away', () => {
    expect(describeNotice(event('photo'), ADA, GRACE, group(), english)).toBe(
      'Ada Lovelace changed the group photo',
    );
    expect(describeNotice(event('photo', null, 'removed'), ADA, ADA, group(), english)).toBe(
      'You removed the group photo',
    );
  });

  it('keeps the name a rename gave, not the current one', () => {
    expect(
      describeNotice(event('renamed', null, 'Book club'), ADA, GRACE, group({ name: 'Later' }), english),
    ).toBe('Ada Lovelace renamed the group to “Book club”');
  });

  it('still names people who have since left', () => {
    const past = group({ members: [member(ADA, 'Ada Lovelace'), member(GRACE, 'Grace Hopper', false)] });
    expect(describeNotice(event('left'), GRACE, ADA, past, english)).toBe('Grace Hopper left');
  });

  it('says "someone" for a person it knows nothing about', () => {
    expect(describeNotice(event('added', 99), ADA, GRACE, group(), english)).toBe(
      'Ada Lovelace added Someone',
    );
  });

  it('speaks Spanish with tú', () => {
    expect(describeNotice(event('added', GRACE), ADA, GRACE, group(), spanish)).toBe(
      'Ada Lovelace te ha añadido',
    );
    expect(describeNotice(event('created', null, 'Familia'), ADA, GRACE, group(), spanish)).toBe(
      'Ada Lovelace ha creado el grupo «Familia»',
    );
    expect(describeNotice(event('left'), GRACE, GRACE, group(), spanish)).toBe('Has salido del grupo');
    expect(describeNotice(event('owner', GRACE), ADA, ALAN, group(), spanish)).toBe(
      'Grace Hopper ahora administra el grupo',
    );
  });
});

describe('membersLine', () => {
  it('names everybody still in it, you last', () => {
    expect(membersLine(group(), ADA, 'en', english)).toBe('Grace Hopper, Alan Turing, and you');
    expect(membersLine(group(), ADA, 'es', spanish)).toBe('Grace Hopper, Alan Turing y tú');
  });

  it('leaves out whoever has left, you included', () => {
    const after = group({
      active: false,
      members: [member(GRACE, 'Grace Hopper'), member(ALAN, 'Alan Turing'), member(ADA, 'Ada Lovelace', false)],
    });
    expect(membersLine(after, ADA, 'en', english)).toBe('Grace Hopper and Alan Turing');
  });

  it('counts once there are too many to name', () => {
    const big = group({
      members: [1, 2, 3, 4, 5].map((id) => member(id, `Person ${id}`)),
    });
    expect(membersLine(big, 1, 'en', english)).toBe('5 members');
    expect(membersLine(big, 1, 'es', spanish)).toBe('5 miembros');
  });

  it('says so when you are on your own', () => {
    expect(membersLine(group({ members: [member(ADA, 'Ada Lovelace')] }), ADA, 'en', english)).toBe(
      'Only you',
    );
  });
});

describe('previewLine', () => {
  const words: PreviewWords = {
    notice: english,
    deleted: 'Message deleted',
    photo: 'Photo',
    noMessages: 'No messages yet',
  };

  const summary = (overrides: Partial<ConversationSummary>): ConversationSummary => ({
    id: 7,
    kind: 'group',
    other: null,
    group: group(),
    lastMessage: null,
    lastMessageAt: null,
    lastActivityAt: '2026-01-01T00:00:00.000Z',
    unreadCount: 0,
    ...overrides,
  });

  it('puts the sender first in a group', () => {
    expect(previewLine(summary({ lastMessage: 'hola', lastSenderId: GRACE }), ADA, words)).toBe(
      'Grace: hola',
    );
    expect(previewLine(summary({ lastMessage: 'hola', lastSenderId: ADA }), ADA, words)).toBe(
      'You: hola',
    );
    expect(
      previewLine(
        summary({ lastAttachment: { name: 'a.png', isImage: true }, lastMessage: '', lastSenderId: GRACE }),
        ADA,
        words,
      ),
    ).toBe('Grace: 📷 Photo');
  });

  it('describes a notice', () => {
    expect(
      previewLine(summary({ lastEvent: event('added', ALAN), lastSenderId: ADA }), GRACE, words),
    ).toBe('Ada Lovelace added Alan Turing');
  });

  it('leaves a 1:1 preview as it was', () => {
    const direct = summary({
      kind: 'direct',
      group: null,
      other: member(GRACE, 'Grace Hopper'),
      lastMessage: 'hola',
      lastSenderId: GRACE,
    });
    expect(previewLine(direct, ADA, words)).toBe('hola');
    expect(conversationTitle(direct)).toBe('Grace Hopper');
    expect(previewLine({ ...direct, lastMessageDeleted: true }, ADA, words)).toBe('Message deleted');
    expect(previewLine({ ...direct, lastMessage: null }, ADA, words)).toBe('No messages yet');
  });
});

describe('startsRun', () => {
  const message = (id: number, senderId: number, extra: Partial<TimelineItem> = {}): TimelineItem =>
    ({
      kind: 'message',
      id,
      conversationId: 7,
      senderId,
      body: 'x',
      createdAt: '2026-01-01T00:00:00.000Z',
      ...extra,
    }) as TimelineItem;

  it('names a sender once per run', () => {
    expect(startsRun(undefined, message(1, GRACE))).toBe(true);
    expect(startsRun(message(1, GRACE), message(2, GRACE))).toBe(false);
    expect(startsRun(message(2, GRACE), message(3, ALAN))).toBe(true);
  });

  it('starts again after a notice, and never names a notice', () => {
    const notice = message(4, ADA, { body: '', event: event('added', GRACE) } as Partial<TimelineItem>);
    expect(startsRun(message(3, ADA), notice)).toBe(false);
    expect(startsRun(notice, message(5, ADA))).toBe(true);
  });
});
