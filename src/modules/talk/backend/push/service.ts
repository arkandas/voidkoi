/**
 * Sending notifications. The rest of Talk decides who gets one and when; this
 * turns it into an encrypted, signed request to each of that person's
 * devices, through the push service of the browser each one runs.
 */
import type { PushPayload } from '@/modules/talk/lib/protocol';

import type { Queryable } from '../db';
import { encryptPayload } from './encryption';
import { notificationLocale, type Notification, type NotificationLocale } from './notifications';
import { deletePushSubscription, findPushSubscription, hasPushSubscriptions, listPushSubscriptions, type PushSubscriptionRow } from './store';
import { vapidAuthorization, type VapidKeys } from './vapid';

export interface PushRequest {
  url: string;
  headers: Record<string, string>;
  body: Buffer;
}

/** How a request reaches a push service: `fetch` in the server, a recorder in the tests. */
export type PushTransport = (request: PushRequest) => Promise<{ status: number }>;

export const fetchTransport: PushTransport = async ({ url, headers, body }) => {
  const response = await fetch(url, { method: 'POST', headers, body: new Uint8Array(body), redirect: 'error', signal: AbortSignal.timeout(10_000) });
  // Read to the end so the connection can be used again.
  await response.arrayBuffer().catch(() => undefined);
  return { status: response.status };
};

export type Urgency = 'very-low' | 'low' | 'normal' | 'high';

export interface DeliveryOptions {
  /** How long the push service may hold it for a device that is offline. */
  ttlSeconds: number;
  urgency: Urgency;
  /** A newer message with the same topic replaces one still waiting. */
  topic?: string;
}

export type DeliveryResult = 'sent' | 'gone' | 'failed';

/** Only the host: an endpoint is a secret of sorts, not something for the logs. */
function hostOf(endpoint: string): string {
  try {
    return new URL(endpoint).host;
  } catch {
    return 'an unreadable endpoint';
  }
}

export class PushService {
  constructor(
    private readonly db: Queryable,
    private readonly keys: VapidKeys,
    /** Who the push services can contact about this server: RFC 8292's `sub`. */
    private readonly subject: string,
    private readonly transport: PushTransport,
    private readonly log: (message: string, error?: unknown) => void,
  ) {}

  /** The `applicationServerKey` browsers subscribe with. */
  get publicKey(): string {
    return this.keys.publicKey;
  }

  /** Whether a notification could reach this person at all. */
  hasDevices(userId: number): Promise<boolean> {
    return hasPushSubscriptions(this.db, userId);
  }

  /** Every device the person turned notifications on for, in the language they last used. */
  async notify(userId: number, compose: (locale: NotificationLocale) => Notification): Promise<void> {
    const subscriptions = await listPushSubscriptions(this.db, userId);
    await Promise.all(
      subscriptions.map(subscription => {
        const { payload, options } = compose(notificationLocale(subscription.locale));
        return this.deliver(subscription, payload, options);
      }),
    );
  }

  /** One device, when it asks to be tested. */
  async notifyDevice(userId: number, endpoint: string, compose: (locale: NotificationLocale) => Notification): Promise<DeliveryResult | 'unknown'> {
    const subscription = await findPushSubscription(this.db, endpoint, userId);
    if (!subscription) return 'unknown';
    const { payload, options } = compose(notificationLocale(subscription.locale));
    return this.deliver(subscription, payload, options);
  }

  private async deliver(subscription: PushSubscriptionRow, payload: PushPayload, options: DeliveryOptions): Promise<DeliveryResult> {
    let status: number;
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/octet-stream',
        'Content-Encoding': 'aes128gcm',
        TTL: String(options.ttlSeconds),
        Urgency: options.urgency,
        Authorization: vapidAuthorization(subscription.endpoint, this.keys, this.subject),
      };
      if (options.topic) headers['Topic'] = options.topic;

      const body = encryptPayload(Buffer.from(JSON.stringify(payload)), subscription);
      ({ status } = await this.transport({ url: subscription.endpoint, headers, body }));
    } catch (error) {
      this.log(`Talk: a notification to ${hostOf(subscription.endpoint)} failed`, error);
      return 'failed';
    }

    // The device unsubscribed, or its browser was reset: nothing will arrive there again.
    if (status === 404 || status === 410) {
      await deletePushSubscription(this.db, subscription.endpoint);
      return 'gone';
    }
    if (status >= 200 && status < 300) return 'sent';

    this.log(`Talk: ${hostOf(subscription.endpoint)} answered a notification with ${status}`);
    return 'failed';
  }
}
