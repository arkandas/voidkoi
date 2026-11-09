/** The call log: reading it, taking calls out of it, and seeing missed ones. */
import { ApiError } from '@/lib/error-codes';
import type { CallsFilter, CallsResponse } from '@/modules/talk/lib/protocol';

import { clearCallHistory, countUnseenMissed, decodeCallsCursor, hideCall, loadCallHistory, markMissedCallsSeen } from '../calls';
import type { TalkHub } from '../hub';
import { notFound } from './http';

export async function callHistory(
  hub: TalkHub,
  userId: number,
  { filter, before, limit }: { filter: string | null; before: string | null; limit: number },
): Promise<CallsResponse> {
  if (filter !== null && filter !== 'all' && filter !== 'missed') throw new ApiError('invalidInput', 400);
  const cursor = before ? decodeCallsCursor(before) : null;
  if (before && !cursor) throw new ApiError('invalidInput', 400);
  const page = await loadCallHistory(hub.db, userId, { filter: (filter ?? 'all') as CallsFilter, before: cursor, limit });
  return { ...page, unseenMissed: await countUnseenMissed(hub.db, userId) };
}

/**
 * Take one call out of this person's log. Not one of theirs reads the same as
 * no such call, so nobody can map other people's calls.
 */
export async function deleteCall(hub: TalkHub, userId: number, callId: number): Promise<void> {
  if (!(await hideCall(hub.db, callId, userId))) notFound('callNotFound');
}

export async function clearCalls(hub: TalkHub, userId: number): Promise<void> {
  await clearCallHistory(hub.db, userId);
}

/** Opening the call log is what sees the missed calls. */
export async function seeMissedCalls(hub: TalkHub, userId: number): Promise<void> {
  await markMissedCallsSeen(hub.db, userId);
}
