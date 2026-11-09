/** Making groups, changing them, and leaving them. */
import { Readable } from 'node:stream';

import sharp from 'sharp';

import { ApiError } from '@/lib/error-codes';
import { GROUP_MEMBERS_MAX, validateGroupName, type ConversationResponse, type GroupEvent } from '@/modules/talk/lib/protocol';

import { getConversationSummary, isActiveMember, isMember, listMemberIds, summarize } from '../conversations';
import type { Queryable } from '../db';
import { newFileId } from '../files/store';
import {
  addMembers,
  countActiveMembers,
  deleteGroup,
  findGroup,
  findGroupPhotoSeenBy,
  insertGroup,
  markLeft,
  nextOwner,
  renameGroup,
  setGroupPhoto,
  setOwner,
  type GroupRow,
} from '../groups';
import type { TalkHub } from '../hub';
import { insertEvent, toChatMessage, type MessageRow } from '../messages';
import { findTalkUser } from '../users';
import { notFound } from './http';

/** A group photo is kept like a profile picture: a square this big. */
const PHOTO_SIZE = 256;
/** The browser crops and shrinks it first, so anything bigger isn't one. */
const PHOTO_MAX_BYTES = 512 * 1024;

function event(type: GroupEvent['type'], userId: number | null, text: string | null = null): GroupEvent {
  return { type, userId, text };
}

/** A list of distinct account ids, or null when it isn't one. */
export function userIds(value: unknown): number[] | null {
  if (!Array.isArray(value) || !value.every(id => Number.isInteger(id) && id > 0)) return null;
  return [...new Set(value as number[])];
}

function checkName(raw: unknown): string {
  const name = typeof raw === 'string' ? raw.trim() : '';
  const issue = validateGroupName(name);
  if (issue) throw new ApiError(issue.key, 400);
  return name;
}

/** The group as the person asking sees it, which every change answers with. */
async function describe(hub: TalkHub, userId: number, groupId: number): Promise<ConversationResponse> {
  const row = await getConversationSummary(hub.db, userId, groupId);
  if (!row) notFound('groupNotFound');
  const [conversation] = await summarize(hub.db, userId, [row], id => hub.presence.statusOf(id));
  return { conversation: conversation! };
}

/**
 * Tell everyone concerned: the notices go into open timelines like any
 * message, and lists and headers are fetched again. `also` is someone no
 * longer in it who still needs to hear, like the person just removed.
 */
async function announce(hub: TalkHub, groupId: number, notices: MessageRow[], also: number[] = []): Promise<void> {
  const recipients = new Set([...(await listMemberIds(hub.db, groupId)), ...also]);
  for (const userId of recipients) {
    for (const notice of notices) hub.presence.sendTo(userId, { type: 'message', message: toChatMessage(notice) });
    hub.presence.sendTo(userId, { type: 'conversation-changed', conversationId: groupId });
  }
}

/** The group, if it exists and the person asking is or was in it. */
async function loadGroup(hub: TalkHub, userId: number, groupId: number): Promise<GroupRow> {
  const group = await findGroup(hub.db, groupId);
  if (!group || !(await isMember(hub.db, group.id, userId))) notFound('groupNotFound');
  return group;
}

function ownerOnly(group: GroupRow, userId: number): void {
  if (group.owner_id !== userId) throw new ApiError('notGroupOwner', 403);
}

/** People who use Talk, other than the one asking. */
async function checkPeople(db: Queryable, ids: number[], selfId: number): Promise<number[]> {
  const others = ids.filter(id => id !== selfId);
  for (const id of others) {
    if (!(await findTalkUser(db, id))) notFound('userNotFound');
  }
  return others;
}

export async function createGroup(hub: TalkHub, userId: number, body: Record<string, unknown>): Promise<ConversationResponse> {
  const name = checkName(body.name);
  const ids = userIds(body.memberIds);
  if (ids === null) throw new ApiError('invalidInput', 400);
  const members = await checkPeople(hub.db, ids, userId);
  if (members.length === 0) throw new ApiError('groupNeedsPeople', 400);
  if (members.length + 1 > GROUP_MEMBERS_MAX) throw new ApiError('groupFull', 400);

  const { groupId, notice } = await hub.db.transaction(async tx => {
    const id = await insertGroup(tx, name, userId, members);
    return { groupId: id, notice: await insertEvent(tx, id, userId, event('created', null, name)) };
  });
  await announce(hub, groupId, [notice]);
  return describe(hub, userId, groupId);
}

export async function renameGroupTo(hub: TalkHub, userId: number, groupId: number, body: Record<string, unknown>): Promise<ConversationResponse> {
  const group = await loadGroup(hub, userId, groupId);
  ownerOnly(group, userId);
  const name = checkName(body.name);
  if (name === group.name) return describe(hub, userId, group.id);

  const notice = await hub.db.transaction(async tx => {
    await renameGroup(tx, group.id, name);
    return insertEvent(tx, group.id, userId, event('renamed', null, name));
  });
  await announce(hub, group.id, [notice]);
  return describe(hub, userId, group.id);
}

export async function addPeople(hub: TalkHub, userId: number, groupId: number, body: Record<string, unknown>): Promise<ConversationResponse> {
  const group = await loadGroup(hub, userId, groupId);
  ownerOnly(group, userId);
  const ids = userIds(body.userIds);
  if (ids === null) throw new ApiError('invalidInput', 400);
  const people = await checkPeople(hub.db, ids, userId);
  if ((await countActiveMembers(hub.db, group.id)) + people.length > GROUP_MEMBERS_MAX) throw new ApiError('groupFull', 400);

  const notices = await hub.db.transaction(async tx => {
    const added = await addMembers(tx, group.id, people);
    const rows: MessageRow[] = [];
    for (const id of added) rows.push(await insertEvent(tx, group.id, userId, event('added', id)));
    return rows;
  });
  await announce(hub, group.id, notices);
  return describe(hub, userId, group.id);
}

export async function removePerson(hub: TalkHub, userId: number, groupId: number, personId: number): Promise<ConversationResponse> {
  const group = await loadGroup(hub, userId, groupId);
  ownerOnly(group, userId);
  if (personId === userId) throw new ApiError('useLeaveGroup', 400);
  if (!(await isActiveMember(hub.db, group.id, personId))) notFound('notInGroup');

  const notice = await hub.db.transaction(async tx => {
    const row = await insertEvent(tx, group.id, userId, event('removed', personId));
    await markLeft(tx, group.id, personId, row.id);
    return row;
  });
  // They hear it too: it is the last thing in their copy of the group.
  await announce(hub, group.id, [notice], [personId]);
  return describe(hub, userId, group.id);
}

/** Gone for everyone: its messages, and its files and photo from the disk. */
async function removeGroup(hub: TalkHub, groupId: number): Promise<void> {
  const everyone = await listMemberIds(hub.db, groupId, { everyone: true });
  const photo = (await findGroup(hub.db, groupId))?.photo_id ?? null;
  const files = await deleteGroup(hub.db, groupId);
  await Promise.all(files.map(id => hub.files.store.remove(id)));
  if (photo) await hub.files.store.removeFrom('group-photos', photo);
  for (const userId of everyone) hub.presence.sendTo(userId, { type: 'conversation-removed', conversationId: groupId });
}

/** Anyone may leave. The group stays in their list, read-only, until they delete the chat. */
export async function leave(hub: TalkHub, userId: number, groupId: number): Promise<ConversationResponse | null> {
  const group = await loadGroup(hub, userId, groupId);
  if (!(await isActiveMember(hub.db, group.id, userId))) throw new ApiError('alreadyLeftGroup', 409);

  // The last one out: nobody is left to read it, so it goes.
  if ((await countActiveMembers(hub.db, group.id)) === 1) {
    await removeGroup(hub, group.id);
    return null;
  }

  const notices = await hub.db.transaction(async tx => {
    const left = await insertEvent(tx, group.id, userId, event('left', null));
    await markLeft(tx, group.id, userId, left.id);
    const rows = [left];
    // An owner who leaves hands the group on, to whoever has been in it longest.
    if (group.owner_id === userId) {
      const heir = await nextOwner(tx, group.id, userId);
      await setOwner(tx, group.id, heir);
      if (heir !== null) rows.push(await insertEvent(tx, group.id, heir, event('owner', heir)));
    }
    return rows;
  });
  await announce(hub, group.id, notices, [userId]);
  return describe(hub, userId, group.id);
}

/** The owner's: gone for everyone, with its messages and files. */
export async function deleteForEveryone(hub: TalkHub, userId: number, groupId: number): Promise<void> {
  const group = await loadGroup(hub, userId, groupId);
  ownerOnly(group, userId);
  await removeGroup(hub, group.id);
}

/**
 * The group's photo, like a profile picture: cropped and shrunk in the
 * browser, then decoded and encoded again here, which checks it is a picture
 * and drops whatever else the file carried.
 */
export async function setPhoto(hub: TalkHub, userId: number, groupId: number, body: Record<string, unknown>): Promise<ConversationResponse> {
  const group = await loadGroup(hub, userId, groupId);
  ownerOnly(group, userId);
  const image = typeof body.image === 'string' ? Buffer.from(body.image, 'base64') : Buffer.alloc(0);
  if (image.length === 0) throw new ApiError('invalidImage', 400);
  if (image.length > PHOTO_MAX_BYTES) throw new ApiError('imageTooLarge', 413);

  let webp: Buffer;
  try {
    webp = await sharp(image, { failOn: 'error', limitInputPixels: 4096 * 4096 })
      .rotate()
      .resize(PHOTO_SIZE, PHOTO_SIZE, { fit: 'cover' })
      .webp({ quality: 84 })
      .toBuffer();
  } catch {
    throw new ApiError('invalidImage', 400);
  }

  // A new id for every photo: its URL changes, so a cached old one is never shown.
  const photoId = newFileId();
  await hub.files.store.receive('group-photos', photoId, Readable.from([webp]), PHOTO_MAX_BYTES);
  const notice = await hub.db.transaction(async tx => {
    await setGroupPhoto(tx, group.id, { id: photoId, type: 'image/webp' });
    return insertEvent(tx, group.id, userId, event('photo', null));
  });
  if (group.photo_id) await hub.files.store.removeFrom('group-photos', group.photo_id);

  await announce(hub, group.id, [notice]);
  return describe(hub, userId, group.id);
}

export async function removePhoto(hub: TalkHub, userId: number, groupId: number): Promise<ConversationResponse> {
  const group = await loadGroup(hub, userId, groupId);
  ownerOnly(group, userId);
  if (!group.photo_id) return describe(hub, userId, group.id);

  const notice = await hub.db.transaction(async tx => {
    await setGroupPhoto(tx, group.id, null);
    return insertEvent(tx, group.id, userId, event('photo', null, 'removed'));
  });
  await hub.files.store.removeFrom('group-photos', group.photo_id);
  await announce(hub, group.id, [notice]);
  return describe(hub, userId, group.id);
}

/** The photo, for anyone who is or was in the group: a former member's copy shows the one they saw, while it is still up. */
export async function photoOf(hub: TalkHub, userId: number, groupId: number): Promise<{ id: string; type: string; size: number }> {
  const group = await loadGroup(hub, userId, groupId);
  const photo = await findGroupPhotoSeenBy(hub.db, group.id, userId);
  if (!photo) notFound();
  const size = await hub.files.store.size('group-photos', photo.id);
  if (size === null) notFound();
  return { ...photo, size };
}
