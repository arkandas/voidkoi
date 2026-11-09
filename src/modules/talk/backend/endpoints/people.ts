/** Who can be talked to, and what a browser needs before it uploads or calls. */
import { ApiError } from '@/lib/error-codes';
import { allow } from '@/lib/rate-limit';
import type { PeopleResponse, TalkConfigResponse } from '@/modules/talk/lib/protocol';

import { iceServersFor } from '../config';
import type { TalkHub } from '../hub';

/** Everyone else who uses Talk, with whether they have it open. */
export async function people(hub: TalkHub, userId: number): Promise<PeopleResponse> {
  return { users: (await hub.directory()).filter(user => user.id !== userId) };
}

/** `host` is the name the browser reached the server at, where Talk's STUN server is too. */
export function talkConfig(hub: TalkHub, host: string | null): TalkConfigResponse {
  return { maxUploadBytes: hub.config.maxUploadBytes, iceServers: iceServersFor(hub.config, host) };
}

/** Refuse a burst: `max` tries of one kind by one account in `minutes`. */
export function limit(kind: string, userId: number, max: number, minutes: number): void {
  if (!allow(`talk-${kind}:${userId}`, max, minutes * 60 * 1000)) throw new ApiError('tooManyAttempts', 429);
}
