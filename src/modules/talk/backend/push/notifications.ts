/**
 * What each notification says, and how the push service should treat it.
 *
 * Tags and topics do the same job at the two ends: a notification replaces
 * the last one about the same conversation or call, on the device and while
 * it waits at the push service. A busy conversation is one notification, not
 * twelve, and "Missed call" takes the place of "Incoming call".
 *
 * They are read on a lock screen with the app closed, so the server writes
 * them itself, in the language the person last used.
 */
import type { CallMedia, PushPayload } from '@/modules/talk/lib/protocol';

import type { DeliveryOptions } from './service';

export type NotificationLocale = 'en' | 'es';

export function notificationLocale(value: string | null | undefined): NotificationLocale {
  return value === 'es' ? 'es' : 'en';
}

/** Enough to read on a lock screen; the rest is in the app. */
const BODY_MAX = 180;
const DAY_SECONDS = 24 * 60 * 60;

const TEXT = {
  en: {
    photo: '📷 Photo',
    incomingCall: 'Incoming call',
    incomingVideoCall: 'Incoming video call',
    missedCall: 'Missed call',
    missedVideoCall: 'Missed video call',
    test: 'Notifications work on this device.',
  },
  es: {
    photo: '📷 Foto',
    incomingCall: 'Llamada entrante',
    incomingVideoCall: 'Videollamada entrante',
    missedCall: 'Llamada perdida',
    missedVideoCall: 'Videollamada perdida',
    test: 'Las notificaciones funcionan en este dispositivo.',
  },
} satisfies Record<NotificationLocale, Record<string, string>>;

export interface Notification {
  payload: PushPayload;
  options: DeliveryOptions;
}

/** Shorten by characters, not bytes, so an emoji is never cut in half. */
function excerpt(text: string): string {
  const characters = [...text.trim()];
  return characters.length <= BODY_MAX ? characters.join('') : `${characters.slice(0, BODY_MAX - 1).join('')}…`;
}

export function messageNotification(
  input: {
    conversationId: number;
    senderId: number;
    senderName: string;
    /** In a group, the title is the group and the sender goes before the words. */
    groupName?: string | null;
    text: string;
    /** A file sent with the message, or as all of it. */
    attachment?: { name: string; isImage: boolean } | null;
    unread: number;
    at: Date;
  },
  locale: NotificationLocale = 'en',
): Notification {
  // Words, when there are any, say more than "Photo" does.
  const body =
    input.text.trim() !== '' || !input.attachment ? input.text : input.attachment.isImage ? TEXT[locale].photo : `📎 ${input.attachment.name}`;
  const inGroup = typeof input.groupName === 'string';
  return {
    payload: {
      kind: 'message',
      title: inGroup ? input.groupName! : input.senderName,
      body: excerpt(inGroup ? `${input.senderName}: ${body}` : body),
      tag: `conversation-${input.conversationId}`,
      // A group opens as itself; `with` would open a chat with the sender.
      url: inGroup ? `/talk?conversation=${input.conversationId}` : `/talk?with=${input.senderId}`,
      badge: input.unread,
      timestamp: input.at.getTime(),
    },
    options: { ttlSeconds: DAY_SECONDS, urgency: 'normal', topic: `conversation-${input.conversationId}` },
  };
}

export function ringingNotification(
  input: { callId: number; callerName: string; media: CallMedia; ringSeconds: number },
  locale: NotificationLocale = 'en',
): Notification {
  const text = TEXT[locale];
  return {
    payload: {
      kind: 'call',
      title: input.callerName,
      body: input.media === 'video' ? text.incomingVideoCall : text.incomingCall,
      tag: `call-${input.callId}`,
      url: '/talk',
      timestamp: Date.now(),
    },
    // Worthless once the ringing stops: the push service drops it rather than
    // deliver it to a phone that comes back online later.
    options: { ttlSeconds: input.ringSeconds, urgency: 'high', topic: `call-${input.callId}` },
  };
}

export function missedCallNotification(
  input: { callId: number; callerName: string; media: CallMedia },
  locale: NotificationLocale = 'en',
): Notification {
  const text = TEXT[locale];
  return {
    payload: {
      kind: 'missed-call',
      title: input.callerName,
      body: input.media === 'video' ? text.missedVideoCall : text.missedCall,
      tag: `call-${input.callId}`,
      url: '/talk/calls',
      timestamp: Date.now(),
    },
    options: { ttlSeconds: DAY_SECONDS, urgency: 'normal', topic: `call-${input.callId}` },
  };
}

export function testNotification(locale: NotificationLocale = 'en'): Notification {
  return {
    payload: {
      kind: 'test',
      title: 'Talk',
      body: TEXT[locale].test,
      tag: 'test',
      url: '/settings/talk',
      timestamp: Date.now(),
    },
    options: { ttlSeconds: 60, urgency: 'high' },
  };
}
