/**
 * What Talk's browser side and server side say to each other: the JSON of its
 * routes and the frames on its socket. No React, no Node, so both import it.
 *
 * What a browser sends over the socket, which the server can't trust, also
 * gets a runtime check here.
 */

/* ------------------------------------------------------------------ */
/* Primitives                                                          */
/* ------------------------------------------------------------------ */

/** ISO-8601 timestamp, always UTC (`2026-09-09T12:34:56.789Z`). */
export type IsoDate = string;

/** Whether someone has Talk open, as the socket server sees it. */
export type UserStatus = 'offline' | 'online' | 'in-call';

/**
 * Audio only, or audio and video. Fixed when the call is placed: a call does
 * not change media halfway through, which keeps the whole exchange to one
 * offer and one answer.
 */
export type CallMedia = 'audio' | 'video';

export function isCallMedia(value: unknown): value is CallMedia {
  return value === 'audio' || value === 'video';
}

/** How a call finished. Kept on the call's row. */
export type CallOutcome = 'answered' | 'no_answer' | 'declined' | 'cancelled' | 'busy' | 'failed';

/** Outcomes that count as a missed call for the callee. */
export const MISSED_CALL_OUTCOMES: readonly CallOutcome[] = ['no_answer', 'cancelled'];

export function isMissedOutcome(outcome: CallOutcome | null): boolean {
  return outcome !== null && (MISSED_CALL_OUTCOMES as readonly string[]).includes(outcome);
}

/** Shaped like the DOM's `RTCSessionDescriptionInit`. The server never looks inside. */
export interface SessionDescription {
  type: 'offer' | 'answer' | 'pranswer' | 'rollback';
  sdp?: string;
}

/** Shaped like the DOM's `RTCIceCandidateInit`. */
export interface IceCandidate {
  candidate?: string;
  sdpMid?: string | null;
  sdpMLineIndex?: number | null;
  usernameFragment?: string | null;
}

/** Shaped like the DOM's `RTCIceServer`. */
export interface IceServer {
  urls: string | string[];
  username?: string;
  credential?: string;
}

/* ------------------------------------------------------------------ */
/* People and conversations                                            */
/* ------------------------------------------------------------------ */

/** An account as Talk shows it. The picture is the suite's, by its key. */
export interface TalkPerson {
  id: number;
  username: string;
  /** Their name, or the username when they have none. */
  displayName: string;
  /** Cache key of their picture, null for initials. */
  avatar: string | null;
}

/** Someone with whether they have Talk open right now. */
export interface DirectoryUser extends TalkPerson {
  status: UserStatus;
}

/** Who is online, as the socket says it. */
export type PresenceUser = DirectoryUser;

/** A file shared in a conversation. The bytes are on the server's disk; this is what is known about them. */
export interface Attachment {
  /** Random and unguessable: it also names the file on disk. */
  id: string;
  /** As the sender's device named it. */
  name: string;
  /** For a picture, checked from its bytes; otherwise what the sender's browser said, which nothing goes by. */
  contentType: string;
  sizeBytes: number;
  /** A PNG, JPEG, WebP or GIF, by its bytes: shown in the page. Everything else is only a download. */
  isImage: boolean;
  /** A small version made by the sender's browser, for the chat and the Files page. */
  hasPreview: boolean;
  /** The original's size in pixels, so its box is drawn before it loads. */
  width: number | null;
  height: number | null;
}

/**
 * Something that happened to a group, shown in its timeline as a line of its
 * own: "Ada added Grace". The message's `senderId` is who did it; `userId` is
 * who it was done to.
 */
export type GroupEventType = 'created' | 'added' | 'removed' | 'left' | 'renamed' | 'owner' | 'photo';

export const GROUP_EVENT_TYPES: readonly GroupEventType[] = ['created', 'added', 'removed', 'left', 'renamed', 'owner', 'photo'];

export interface GroupEvent {
  type: GroupEventType;
  /** Added, removed, or the new owner. Null for the rest. */
  userId: number | null;
  /** The new name, for `renamed`; `removed` for a `photo` taken away rather than changed. */
  text: string | null;
}

export interface ChatMessage {
  id: number;
  conversationId: number;
  senderId: number;
  /** Set for a group notice rather than something somebody said. Its body is empty. */
  event?: GroupEvent | null;
  /** Empty once withdrawn, and for a message that is only a file. */
  body: string;
  /** The shared file, if this message is one. Null once withdrawn: the file is gone too. */
  attachment?: Attachment | null;
  createdAt: IsoDate;
  /** When the sender withdrew it for everyone. The row stays, so others see something was taken back. */
  deletedAt?: IsoDate | null;
}

export interface CallSummary {
  id: number;
  conversationId: number;
  callerId: number;
  calleeId: number;
  media: CallMedia;
  startedAt: IsoDate;
  answeredAt: IsoDate | null;
  endedAt: IsoDate | null;
  outcome: CallOutcome | null;
  /** Seconds between `answeredAt` and `endedAt`; 0 for calls never answered. */
  durationSeconds: number;
}

/** One entry of a conversation's timeline: messages and finished calls together. */
export type TimelineItem = ({ kind: 'message' } & ChatMessage) | ({ kind: 'call' } & CallSummary);

/** Someone who is, or was, in a group. Former members still name old messages. */
export interface GroupMember extends DirectoryUser {
  /** False once they left or were removed. */
  active: boolean;
}

export interface GroupInfo {
  name: string;
  /** Changes with the group's photo and names it in its URL, so each can be cached for good. Null without one. */
  photoVersion: string | null;
  /** Who may rename it, add and remove people, and delete it. */
  ownerId: number | null;
  /** Everyone who is or was in it, current members first. */
  members: GroupMember[];
  /** Whether the person asking is still in it. A group they left stays in their list, read-only. */
  active: boolean;
}

export interface ConversationSummary {
  id: number;
  kind: 'direct' | 'group';
  /** The other person of a 1:1 conversation; null for a group. */
  other: DirectoryUser | null;
  /** The group's name and members; null for a 1:1 conversation. */
  group: GroupInfo | null;
  /** Who wrote the last message, so a group's preview can read "Ada: hola". */
  lastSenderId?: number | null;
  /** The last message was a group notice; the list describes it. */
  lastEvent?: GroupEvent | null;
  lastMessage: string | null;
  /** When the last message was a file: what to say about it instead of its empty text. */
  lastAttachment?: { name: string; isImage: boolean } | null;
  /** The last message was withdrawn; the list says so in the reader's language. */
  lastMessageDeleted?: boolean;
  lastMessageAt: IsoDate | null;
  lastActivityAt: IsoDate;
  unreadCount: number;
}

export type CallDirection = 'incoming' | 'outgoing';

export interface CallHistoryEntry extends CallSummary {
  direction: CallDirection;
  other: TalkPerson;
  /** An unanswered incoming call for the person asking. */
  missed: boolean;
  seen: boolean;
}

/* ------------------------------------------------------------------ */
/* Routes                                                              */
/* ------------------------------------------------------------------ */

export type CallsFilter = 'all' | 'missed';

/** Which shared files to list: everything, or one direction. */
export type FilesFilter = 'all' | 'sent' | 'received';

/** What a browser needs before it uploads or calls. */
export interface TalkConfigResponse {
  /** The largest file the server takes. */
  maxUploadBytes: number;
  /** For `RTCPeerConnection`: the server's own STUN server, unless it is configured otherwise. */
  iceServers: IceServer[];
}

export interface PeopleResponse {
  users: DirectoryUser[];
}

export interface ConversationsResponse {
  conversations: ConversationSummary[];
  /** Every conversation's unread count added up, for the badge. */
  totalUnread: number;
}

export interface ConversationResponse {
  conversation: ConversationSummary;
}

export interface TimelineResponse {
  items: TimelineItem[];
  /** Cursor to pass back as `before` for the previous page, or null at the start. */
  nextBefore: string | null;
}

export interface CreateGroupRequest {
  name: string;
  /** Everyone else to put in it; whoever creates it is its owner. */
  memberIds: number[];
}

/** A shared file as the Files page lists it: the file, who with, and which way it went. */
export interface SharedFile extends Attachment {
  messageId: number;
  conversationId: number;
  direction: 'sent' | 'received';
  /** Who shared it. */
  sender: TalkPerson;
  /** The other person, when it was shared in a 1:1 conversation. */
  other: TalkPerson | null;
  /** The group, when it was shared in one. */
  group: { name: string } | null;
  sharedAt: IsoDate;
}

export interface FilesResponse {
  files: SharedFile[];
  nextBefore: string | null;
}

/** An upload, stored but not yet sent in a message. */
export interface UploadResponse {
  attachment: Attachment;
}

export interface CallsResponse {
  calls: CallHistoryEntry[];
  nextBefore: string | null;
  /** Missed incoming calls not yet seen, for the badge. */
  unseenMissed: number;
}

export interface OkResponse {
  ok: true;
}

/* ------------------------------------------------------------------ */
/* Web Push                                                            */
/* ------------------------------------------------------------------ */

/** The public key this server signs notifications with. */
export interface PushKeyResponse {
  /** An uncompressed P-256 point, base64url: `applicationServerKey`. */
  publicKey: string;
}

/** Exactly what `PushSubscription.toJSON()` gives. */
export interface PushSubscriptionRequest {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

/** The devices this account gets notifications on. */
export interface PushSubscriptionsResponse {
  endpoints: string[];
}

export type PushKind = 'message' | 'call' | 'missed-call' | 'test';

/**
 * What a notification carries, encrypted so only the device can read it. The
 * service worker shows it as it stands; nothing here needs the page open.
 */
export interface PushPayload {
  kind: PushKind;
  title: string;
  body: string;
  /** Notifications with the same tag replace each other: one per conversation, one per call. */
  tag: string;
  /** Where tapping it goes. */
  url: string;
  /** Unread messages, for the number on the Home Screen icon. */
  badge?: number;
  /** When it happened, in epoch milliseconds. */
  timestamp: number;
}

/* ------------------------------------------------------------------ */
/* Limits shared by both sides                                         */
/* ------------------------------------------------------------------ */

export const GROUP_NAME_MAX = 64;
/** Everyone in a group, its creator included. */
export const GROUP_MEMBERS_MAX = 100;
export const MESSAGE_MAX = 4000;
/** Longest file name kept; longer ones are shortened, keeping the extension. */
export const FILE_NAME_MAX = 200;
/** The preview a browser makes of a picture: its longest side, and its size cap. */
export const PREVIEW_MAX_EDGE = 640;
export const PREVIEW_MAX_BYTES = 256 * 1024;
export const DEFAULT_PAGE_SIZE = 50;
export const MAX_PAGE_SIZE = 100;

/** What is wrong with a group's name, as a message key and the number it mentions. */
export type GroupNameIssue = { key: 'groupNameRequired'; values?: undefined } | { key: 'groupNameTooLong'; values: { max: number } };

export function validateGroupName(value: string): GroupNameIssue | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) return { key: 'groupNameRequired' };
  if (trimmed.length > GROUP_NAME_MAX) return { key: 'groupNameTooLong', values: { max: GROUP_NAME_MAX } };
  return null;
}

/* ------------------------------------------------------------------ */
/* Socket: browser to server                                           */
/* ------------------------------------------------------------------ */

export interface ClientChat {
  type: 'chat';
  conversationId: number;
  /** May be empty when the message carries a file. */
  text: string;
  /** A file uploaded to this conversation beforehand, sent as this message. */
  attachmentId?: string;
  /** Echoed back on the resulting `message`, so the sender can match it. */
  clientId: string;
}

export interface ClientCallOffer {
  type: 'call-offer';
  to: number;
  /** Audio when left out. */
  media?: CallMedia;
  sdp: SessionDescription;
}

export interface ClientCallAccept {
  type: 'call-accept';
  callId: number;
  sdp: SessionDescription;
}

export interface ClientCallDecline {
  type: 'call-decline';
  callId: number;
}

export interface ClientCallCancel {
  type: 'call-cancel';
  callId: number;
}

export interface ClientHangup {
  type: 'hangup';
  callId: number;
}

export interface ClientIceCandidate {
  type: 'ice-candidate';
  callId: number;
  candidate: IceCandidate;
}

/**
 * "My camera is on / off", passed to the other side. The media can't say so:
 * a disabled video track sends black frames rather than stopping.
 */
export interface ClientCameraState {
  type: 'camera-state';
  callId: number;
  on: boolean;
}

export interface ClientPing {
  type: 'ping';
}

/** Whether the page is on screen. A notification is sent only when nobody is looking. */
export interface ClientVisibility {
  type: 'visibility';
  visible: boolean;
}

export type ClientMessage =
  | ClientChat
  | ClientCallOffer
  | ClientCallAccept
  | ClientCallDecline
  | ClientCallCancel
  | ClientHangup
  | ClientIceCandidate
  | ClientCameraState
  | ClientPing
  | ClientVisibility;

export type ClientMessageType = ClientMessage['type'];

/* ------------------------------------------------------------------ */
/* Socket: server to browser                                           */
/* ------------------------------------------------------------------ */

export interface ServerWelcome {
  type: 'welcome';
  me: PresenceUser;
  users: PresenceUser[];
}

export interface ServerPresence {
  type: 'presence';
  users: PresenceUser[];
}

/** This socket was replaced by a newer one for the same account. */
export interface ServerReplaced {
  type: 'replaced';
}

export interface ServerMessage {
  type: 'message';
  message: ChatMessage;
  /** Only for the socket that sent the `chat`. */
  clientId?: string;
}

/** A message was withdrawn for everyone, sent to everyone in the conversation. */
export interface ServerMessageDeleted {
  type: 'message-deleted';
  conversationId: number;
  messageId: number;
  deletedAt: IsoDate;
}

/** A conversation's name, members or owner changed, or this person was added to a group. */
export interface ServerConversationChanged {
  type: 'conversation-changed';
  conversationId: number;
}

/** This person deleted a chat, maybe on another device, or a group they were in was deleted. */
export interface ServerConversationRemoved {
  type: 'conversation-removed';
  conversationId: number;
}

/** Answers a `call-offer`: the caller now knows the call's id. */
export interface ServerCallRinging {
  type: 'call-ringing';
  callId: number;
  to: number;
  conversationId: number;
  media: CallMedia;
}

export interface ServerIncomingCall {
  type: 'incoming-call';
  callId: number;
  from: PresenceUser;
  conversationId: number;
  /** Whether answering asks for the camera. */
  media: CallMedia;
  sdp: SessionDescription;
}

export interface ServerCallAccepted {
  type: 'call-accepted';
  callId: number;
  from: number;
  sdp: SessionDescription;
}

/** Nobody could be reached. The call is kept as missed for them. */
export interface ServerUnavailable {
  type: 'unavailable';
  callId: number;
  to: number;
}

/** They were already in a call. */
export interface ServerBusy {
  type: 'busy';
  callId: number;
  to: number;
}

/** It rang out; sent to both sides. */
export interface ServerNoAnswer {
  type: 'no-answer';
  callId: number;
}

/** The last event of every call, sent to both sides. */
export interface ServerCallEnded {
  type: 'call-ended';
  callId: number;
  outcome: CallOutcome;
  /** Seconds connected; 0 unless it was answered. */
  duration: number;
  /** Who ended it, when a person did. */
  from?: number;
}

export interface ServerIceCandidate {
  type: 'ice-candidate';
  callId: number;
  from: number;
  candidate: IceCandidate;
}

/** The other side's camera went on or off. */
export interface ServerCameraState {
  type: 'camera-state';
  callId: number;
  from: number;
  on: boolean;
}

export interface ServerError {
  type: 'error';
  code: SocketErrorCode;
  message: string;
  /** The `chat` it refuses, so the sender can take back the bubble it drew. */
  clientId?: string;
}

export interface ServerPong {
  type: 'pong';
}

export type SocketErrorCode =
  | 'bad_message'
  | 'unknown_call'
  | 'not_allowed'
  | 'unknown_user'
  | 'unknown_conversation'
  | 'invalid_state'
  | 'too_long'
  /** The file is not this sender's upload for this conversation, or was already sent. */
  | 'bad_attachment'
  /** Too many calls or messages in a minute; this one was dropped. */
  | 'rate_limited'
  | 'internal';

export type ServerToClientMessage =
  | ServerWelcome
  | ServerPresence
  | ServerReplaced
  | ServerMessage
  | ServerMessageDeleted
  | ServerCallRinging
  | ServerIncomingCall
  | ServerCallAccepted
  | ServerUnavailable
  | ServerBusy
  | ServerNoAnswer
  | ServerCallEnded
  | ServerIceCandidate
  | ServerCameraState
  | ServerError
  | ServerConversationRemoved
  | ServerConversationChanged
  | ServerPong;

export type ServerMessageType = ServerToClientMessage['type'];

/* ------------------------------------------------------------------ */
/* Checks                                                              */
/* ------------------------------------------------------------------ */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isPositiveInt(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isOptionalString(value: unknown): value is string | undefined {
  return value === undefined || typeof value === 'string';
}

function isOptionalNullableString(value: unknown): value is string | null | undefined {
  return value === undefined || value === null || typeof value === 'string';
}

function isOptionalNullableNumber(value: unknown): value is number | null | undefined {
  return value === undefined || value === null || typeof value === 'number';
}

export function isSessionDescription(value: unknown): value is SessionDescription {
  if (!isRecord(value)) return false;
  const { type, sdp } = value;
  if (type !== 'offer' && type !== 'answer' && type !== 'pranswer' && type !== 'rollback') return false;
  return isOptionalString(sdp);
}

export function isIceCandidate(value: unknown): value is IceCandidate {
  if (!isRecord(value)) return false;
  return (
    isOptionalString(value['candidate']) &&
    isOptionalNullableString(value['sdpMid']) &&
    isOptionalNullableNumber(value['sdpMLineIndex']) &&
    isOptionalNullableString(value['usernameFragment'])
  );
}

const CLIENT_GUARDS: Record<ClientMessageType, (value: Record<string, unknown>) => boolean> = {
  chat: value =>
    isPositiveInt(value['conversationId']) &&
    typeof value['text'] === 'string' &&
    isNonEmptyString(value['clientId']) &&
    (value['attachmentId'] === undefined || isNonEmptyString(value['attachmentId'])),
  'call-offer': value =>
    isPositiveInt(value['to']) && (value['media'] === undefined || isCallMedia(value['media'])) && isSessionDescription(value['sdp']),
  'call-accept': value => isPositiveInt(value['callId']) && isSessionDescription(value['sdp']),
  'call-decline': value => isPositiveInt(value['callId']),
  'call-cancel': value => isPositiveInt(value['callId']),
  hangup: value => isPositiveInt(value['callId']),
  'ice-candidate': value => isPositiveInt(value['callId']) && isIceCandidate(value['candidate']),
  'camera-state': value => isPositiveInt(value['callId']) && typeof value['on'] === 'boolean',
  ping: () => true,
  visibility: value => typeof value['visible'] === 'boolean',
};

export function isClientMessage(value: unknown): value is ClientMessage {
  if (!isRecord(value)) return false;
  const type = value['type'];
  if (typeof type !== 'string' || !Object.hasOwn(CLIENT_GUARDS, type)) return false;
  return CLIENT_GUARDS[type as ClientMessageType](value);
}

/** A raw frame as a checked message, or null for anything that isn't JSON or isn't one. */
export function parseClientMessage(raw: string): ClientMessage | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  return isClientMessage(parsed) ? parsed : null;
}

// Keyed by every server type, so one left out doesn't compile.
const SERVER_TYPES: Record<ServerMessageType, true> = {
  welcome: true,
  presence: true,
  replaced: true,
  message: true,
  'message-deleted': true,
  'conversation-removed': true,
  'conversation-changed': true,
  'call-ringing': true,
  'incoming-call': true,
  'call-accepted': true,
  unavailable: true,
  busy: true,
  'no-answer': true,
  'call-ended': true,
  'ice-candidate': true,
  'camera-state': true,
  error: true,
  pong: true,
};

/** A shallow check of a server frame, so the browser drops one it doesn't know instead of breaking. */
export function parseServerMessage(raw: string): ServerToClientMessage | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  return isRecord(parsed) && typeof parsed['type'] === 'string' && Object.hasOwn(SERVER_TYPES, parsed['type'])
    ? (parsed as unknown as ServerToClientMessage)
    : null;
}
