/** The conversation list, a conversation's timeline, reading, and deleting messages and chats. */
import { ApiError } from '@/lib/error-codes';
import type { ConversationResponse, ConversationsResponse, TimelineResponse } from '@/modules/talk/lib/protocol';

import { attachmentsForMessages } from '../attachments';
import {
  findConversation,
  getConversationSummary,
  getOrCreateDirectConversation,
  isActiveMember,
  isMember,
  listConversationSummaries,
  listMemberIds,
  removeConversation,
  restoreConversation,
  summarize,
  toConversationSummary,
} from '../conversations';
import type { TalkHub } from '../hub';
import { clearConversation, decodeCursor, deleteMessageForEveryone, findMessage, hideMessage, latestMessageId, loadTimeline, markRead } from '../messages';
import { findTalkUser } from '../users';
import { notFound } from './http';

/** Someone's conversations, newest activity first, with the unread total for the badge. */
export async function listConversations(hub: TalkHub, userId: number): Promise<ConversationsResponse> {
  const rows = await listConversationSummaries(hub.db, userId);
  const conversations = await summarize(hub.db, userId, rows, id => hub.presence.statusOf(id));
  return { conversations, totalUnread: conversations.reduce((sum, item) => sum + item.unreadCount, 0) };
}

/** The 1:1 conversation with someone, made on first use. Starting a chat you deleted brings it back, empty. */
export async function conversationWith(hub: TalkHub, userId: number, otherId: number): Promise<ConversationResponse> {
  if (otherId === userId) throw new ApiError('cannotTalkToYourself', 400);
  if (!(await findTalkUser(hub.db, otherId))) notFound('userNotFound');

  const conversation = await getOrCreateDirectConversation(hub.db, userId, otherId);
  await restoreConversation(hub.db, conversation.id, userId);
  const summary = await getConversationSummary(hub.db, userId, conversation.id);
  if (!summary) notFound('conversationNotFound');
  return { conversation: toConversationSummary(summary, id => hub.presence.statusOf(id)) };
}

async function requireMember(hub: TalkHub, conversationId: number, userId: number): Promise<void> {
  if (!(await isMember(hub.db, conversationId, userId))) throw new ApiError('notInConversation', 403);
}

/** Messages and finished calls together, a page at a time, newest page first. */
export async function timeline(
  hub: TalkHub,
  userId: number,
  conversationId: number,
  { before, limit }: { before: string | null; limit: number },
): Promise<TimelineResponse> {
  await requireMember(hub, conversationId, userId);
  const cursor = before ? decodeCursor(before) : null;
  if (before && !cursor) throw new ApiError('invalidInput', 400);
  return loadTimeline(hub.db, conversationId, userId, { before: cursor, limit });
}

/**
 * Delete one message. `everyone` withdraws it from everyone and is its
 * sender's alone; `me` only takes it out of the asker's copy, and anyone in
 * the conversation may do it to anything.
 */
export async function deleteMessage(hub: TalkHub, userId: number, messageId: number, scope: string | null): Promise<void> {
  // The default is the one that destroys least.
  if (scope !== null && scope !== 'me' && scope !== 'everyone') throw new ApiError('invalidInput', 400);
  const message = await findMessage(hub.db, messageId);
  if (!message) notFound('messageNotFound');
  await requireMember(hub, message.conversation_id, userId);

  if (scope !== 'everyone') {
    await hideMessage(hub.db, messageId, userId);
    // If everyone else already deleted it too, its file can go.
    hub.files.sweepSoon();
    return;
  }

  if (message.sender_id !== userId) throw new ApiError('notYourMessage', 403);
  const deleted = await deleteMessageForEveryone(hub.db, messageId, userId);
  // Withdrawn means gone: the file goes from the disk now, not at the next sweep.
  const attachment = (await attachmentsForMessages(hub.db, [messageId])).get(messageId);
  if (attachment) await hub.files.discard([attachment.id]);
  // Withdrawn already: the end is the one asked for.
  const deletedAt = (deleted?.deleted_at ?? message.deleted_at ?? new Date()).toISOString();

  // Former members of a group still have it in their copy, so they hear too.
  for (const memberId of await listMemberIds(hub.db, message.conversation_id, { everyone: true })) {
    hub.presence.sendTo(memberId, { type: 'message-deleted', conversationId: message.conversation_id, messageId, deletedAt });
  }
}

/** Take a chat out of this person's list, with their copy of it. The others keep theirs; a new message brings it back. */
export async function deleteConversation(hub: TalkHub, userId: number, conversationId: number): Promise<void> {
  await requireMember(hub, conversationId, userId);
  // A group is left first, then deleted: deleting it while in it would leave
  // everyone writing to someone who can't see it.
  const conversation = await findConversation(hub.db, conversationId);
  if (conversation && !conversation.is_direct && (await isActiveMember(hub.db, conversationId, userId))) {
    throw new ApiError('leaveGroupFirst', 409);
  }
  await removeConversation(hub.db, conversationId, userId);
  // Their other devices drop it from the list too.
  hub.presence.sendTo(userId, { type: 'conversation-removed', conversationId });
  hub.files.sweepSoon();
}

/** Empty this person's copy of a conversation. The others keep theirs. */
export async function clearChat(hub: TalkHub, userId: number, conversationId: number): Promise<void> {
  await requireMember(hub, conversationId, userId);
  await clearConversation(hub.db, conversationId, userId);
  hub.files.sweepSoon();
}

/** Read up to a message, or everything in it when none is named. */
export async function readConversation(hub: TalkHub, userId: number, conversationId: number, messageId: number | null): Promise<void> {
  await requireMember(hub, conversationId, userId);
  await markRead(hub.db, conversationId, userId, messageId ?? (await latestMessageId(hub.db, conversationId)));
}
