/** Turning notifications on and off for a device, and testing them. */
import { ApiError } from '@/lib/error-codes';
import type { PushKeyResponse, PushSubscriptionsResponse } from '@/modules/talk/lib/protocol';

import type { TalkHub } from '../hub';
import { decodeSubscriptionKeys, PushKeyError } from '../push/encryption';
import { isAllowedPushEndpoint } from '../push/endpoints';
import { testNotification } from '../push/notifications';
import { deletePushSubscription, listPushSubscriptions, trimPushSubscriptions, upsertPushSubscription } from '../push/store';

/** Phones get replaced; nobody needs notifications on twenty of them. */
const MAX_DEVICES = 10;

function endpointOf(body: Record<string, unknown> | null): string | null {
  const endpoint = body?.endpoint;
  return typeof endpoint === 'string' && endpoint !== '' ? endpoint : null;
}

export function pushKey(hub: TalkHub): PushKeyResponse {
  return { publicKey: hub.push.publicKey };
}

/** The devices this account gets notifications on, so a page can tell whether it is one. */
export async function devices(hub: TalkHub, userId: number): Promise<PushSubscriptionsResponse> {
  const rows = await listPushSubscriptions(hub.db, userId);
  return { endpoints: rows.map(row => row.endpoint) };
}

/** A device turning notifications on, for the sign-ins of the account as they are now. */
export async function subscribe(hub: TalkHub, user: { id: number; session_version: number }, body: Record<string, unknown> | null): Promise<void> {
  const endpoint = endpointOf(body);
  // Only the push services browsers use: any other URL would point the server at its own network.
  if (endpoint === null || !isAllowedPushEndpoint(endpoint)) throw new ApiError('pushServiceNotAllowed', 400);
  const keys = body?.keys as { p256dh?: unknown; auth?: unknown } | undefined;
  if (!keys || typeof keys.p256dh !== 'string' || typeof keys.auth !== 'string') throw new ApiError('pushKeysInvalid', 400);
  try {
    decodeSubscriptionKeys({ p256dh: keys.p256dh, auth: keys.auth });
  } catch (error) {
    if (error instanceof PushKeyError) throw new ApiError('pushKeysInvalid', 400);
    throw error;
  }

  await upsertPushSubscription(hub.db, { endpoint, user_id: user.id, session_version: user.session_version, p256dh: keys.p256dh, auth: keys.auth });
  await trimPushSubscriptions(hub.db, user.id, MAX_DEVICES);
}

export async function unsubscribe(hub: TalkHub, userId: number, body: Record<string, unknown> | null): Promise<void> {
  const endpoint = endpointOf(body);
  if (endpoint === null) throw new ApiError('invalidInput', 400);
  await deletePushSubscription(hub.db, endpoint, userId);
}

/** Send this device a notification, so turning them on can be proved on the spot. */
export async function test(hub: TalkHub, userId: number, body: Record<string, unknown> | null): Promise<void> {
  const endpoint = endpointOf(body);
  if (endpoint === null) throw new ApiError('invalidInput', 400);
  const result = await hub.push.notifyDevice(userId, endpoint, testNotification);
  if (result === 'unknown') throw new ApiError('pushNotOn', 404);
  if (result === 'gone') throw new ApiError('pushDeviceGone', 502);
  if (result === 'failed') throw new ApiError('pushRefused', 502);
}
