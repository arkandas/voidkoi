/**
 * Talk's calls to its routes, typed from the protocol, with the suite's own
 * spread in. A failure throws the suite's ApiError: the server's code, or the
 * fallback when there was no answer to read.
 */
import { api as suiteApi, request, urls as suiteUrls } from '@/lib/api';
import { ApiError, isApiErrorCode, type ApiErrorCode } from '@/lib/error-codes';

import type {
  CallsFilter,
  CallsResponse,
  ConversationResponse,
  ConversationsResponse,
  CreateGroupRequest,
  FilesFilter,
  FilesResponse,
  OkResponse,
  PeopleResponse,
  PushKeyResponse,
  PushSubscriptionRequest,
  PushSubscriptionsResponse,
  TalkConfigResponse,
  TimelineResponse,
  UploadResponse,
} from './protocol';

function query(params: Record<string, string | number | undefined | null>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') search.set(key, String(value));
  }
  const encoded = search.toString();
  return encoded === '' ? '' : `?${encoded}`;
}

/** An answer that came back as text, as an XMLHttpRequest gives it. */
function settle<T>(status: number, text: string, fallback: ApiErrorCode): T {
  let payload: unknown = null;
  try {
    payload = text === '' ? null : JSON.parse(text);
  } catch {
    payload = null;
  }
  if (status < 200 || status >= 300) {
    const code = (payload as { error?: unknown } | null)?.error;
    throw new ApiError(isApiErrorCode(code) ? code : fallback, status);
  }
  return payload as T;
}

/** Raw bytes rather than JSON, with the file's particulars in headers. */
async function sendBytes<T>(method: string, path: string, body: Blob, headers: Record<string, string>, fallback: ApiErrorCode): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api${path}`, { method, cache: 'no-store', headers: { 'Content-Type': 'application/octet-stream', ...headers }, body });
  } catch {
    throw new ApiError(fallback, 0);
  }
  return settle<T>(response.status, await response.text(), fallback);
}

/** Thrown when the person stopped the upload themselves. */
export class UploadAbortedError extends Error {
  constructor() {
    super('Upload cancelled');
    this.name = 'UploadAbortedError';
  }
}

export interface UploadHandle {
  promise: Promise<UploadResponse>;
  abort(): void;
}

/**
 * Upload one file to a conversation, to be sent in a message. An
 * XMLHttpRequest rather than fetch: fetch still can't say how much of a body
 * has gone, and a bar that sits at nothing for the length of a video is worse
 * than none.
 */
export function uploadFile(conversationId: number, file: File, onProgress?: (fraction: number) => void): UploadHandle {
  const xhr = new XMLHttpRequest();
  const promise = new Promise<UploadResponse>((resolve, reject) => {
    xhr.open('POST', `/api/talk/conversations/${conversationId}/uploads`);
    xhr.setRequestHeader('Content-Type', 'application/octet-stream');
    // Headers are Latin-1; file names are anything but.
    xhr.setRequestHeader('X-File-Name', encodeURIComponent(file.name));
    xhr.setRequestHeader('X-File-Type', file.type);
    xhr.upload.onprogress = event => {
      if (event.lengthComputable && event.total > 0) onProgress?.(event.loaded / event.total);
    };
    xhr.onload = () => {
      try {
        resolve(settle<UploadResponse>(xhr.status, xhr.responseText, 'uploadFailed'));
      } catch (error) {
        reject(error);
      }
    };
    xhr.onerror = () => reject(new ApiError('uploadFailed', 0));
    xhr.onabort = () => reject(new UploadAbortedError());
    xhr.send(file);
  });
  return { promise, abort: () => xhr.abort() };
}

export const api = {
  ...suiteApi,
  config: () => request<TalkConfigResponse>('GET', '/talk/config', undefined, 'loadFailed'),
  talkPeople: () => request<PeopleResponse>('GET', '/talk/people', undefined, 'loadFailed'),

  conversations: () => request<ConversationsResponse>('GET', '/talk/conversations', undefined, 'loadFailed'),
  /** The 1:1 conversation with someone, made on first use. */
  conversationWith: (userId: number) => request<ConversationResponse>('POST', `/talk/conversations/with/${userId}`, {}, 'loadFailed'),
  timeline: (conversationId: number, options: { before?: string | null; limit?: number } = {}) =>
    request<TimelineResponse>('GET', `/talk/conversations/${conversationId}/messages${query(options)}`, undefined, 'loadFailed'),
  markRead: (conversationId: number, messageId?: number) =>
    request<OkResponse>('POST', `/talk/conversations/${conversationId}/read`, messageId === undefined ? {} : { messageId }, 'saveFailed'),
  /** 'everyone' withdraws it from everyone and only the sender may; 'me' takes it out of this person's copy. */
  deleteMessage: (messageId: number, scope: 'me' | 'everyone' = 'me') =>
    request<OkResponse>('DELETE', `/talk/messages/${messageId}?scope=${scope}`, undefined, 'deleteFailed'),
  /** Take a chat out of this person's list, with their copy of it. A group only once they left it. */
  deleteConversation: (conversationId: number) => request<OkResponse>('DELETE', `/talk/conversations/${conversationId}`, undefined, 'deleteFailed'),
  clearConversation: (conversationId: number) => request<OkResponse>('DELETE', `/talk/conversations/${conversationId}/messages`, undefined, 'deleteFailed'),

  createGroup: (body: CreateGroupRequest) => request<ConversationResponse>('POST', '/talk/groups', body, 'saveFailed'),
  renameGroup: (conversationId: number, name: string) => request<ConversationResponse>('PATCH', `/talk/groups/${conversationId}`, { name }, 'saveFailed'),
  addGroupMembers: (conversationId: number, userIds: number[]) =>
    request<ConversationResponse>('POST', `/talk/groups/${conversationId}/members`, { userIds }, 'saveFailed'),
  removeGroupMember: (conversationId: number, userId: number) =>
    request<ConversationResponse>('DELETE', `/talk/groups/${conversationId}/members/${userId}`, undefined, 'saveFailed'),
  /** The group as it is now, or nothing when this was the last person in it and it is gone. */
  leaveGroup: (conversationId: number) => request<Partial<ConversationResponse>>('POST', `/talk/groups/${conversationId}/leave`, {}, 'saveFailed'),
  /** The photo, already cropped and shrunk like a profile picture: base64. */
  setGroupPhoto: (conversationId: number, image: string) =>
    request<ConversationResponse>('PUT', `/talk/groups/${conversationId}/photo`, { image }, 'saveFailed'),
  removeGroupPhoto: (conversationId: number) => request<ConversationResponse>('DELETE', `/talk/groups/${conversationId}/photo`, undefined, 'deleteFailed'),
  deleteGroup: (conversationId: number) => request<OkResponse>('DELETE', `/talk/groups/${conversationId}`, undefined, 'deleteFailed'),

  calls: (options: { filter?: CallsFilter; before?: string | null; limit?: number } = {}) =>
    request<CallsResponse>('GET', `/talk/calls${query(options)}`, undefined, 'loadFailed'),
  markCallsSeen: () => request<OkResponse>('POST', '/talk/calls/seen', {}, 'saveFailed'),
  /** Take one call out of this person's log. */
  deleteCall: (callId: number) => request<OkResponse>('DELETE', `/talk/calls/${callId}`, undefined, 'deleteFailed'),
  clearCallHistory: () => request<OkResponse>('DELETE', '/talk/calls', undefined, 'deleteFailed'),

  files: (options: { filter?: FilesFilter; before?: string | null; limit?: number } = {}) =>
    request<FilesResponse>('GET', `/talk/files${query(options)}`, undefined, 'loadFailed'),
  /** The small copy of a picture just uploaded, with the original's size. Only before it is sent. */
  uploadPreview: (attachmentId: string, preview: Blob, original: { width: number; height: number }) =>
    sendBytes<UploadResponse>(
      'PUT',
      `/talk/uploads/${encodeURIComponent(attachmentId)}/preview`,
      preview,
      { 'X-Image-Width': String(original.width), 'X-Image-Height': String(original.height) },
      'uploadFailed',
    ),
  /** Throw away an upload that was never sent. */
  cancelUpload: (attachmentId: string) => request<OkResponse>('DELETE', `/talk/uploads/${encodeURIComponent(attachmentId)}`, undefined, 'deleteFailed'),

  pushKey: () => request<PushKeyResponse>('GET', '/talk/push/key', undefined, 'loadFailed'),
  pushSubscriptions: () => request<PushSubscriptionsResponse>('GET', '/talk/push/subscriptions', undefined, 'loadFailed'),
  addPushSubscription: (body: PushSubscriptionRequest) => request<OkResponse>('POST', '/talk/push/subscriptions', body, 'saveFailed'),
  removePushSubscription: (endpoint: string) => request<OkResponse>('DELETE', '/talk/push/subscriptions', { endpoint }, 'deleteFailed'),
  testPush: (endpoint: string) => request<OkResponse>('POST', '/talk/push/test', { endpoint }, 'saveFailed'),
};

export const urls = {
  ...suiteUrls,
  socket(): string {
    const scheme = window.location.protocol === 'https:' ? 'wss' : 'ws';
    return `${scheme}://${window.location.host}/api/talk/socket`;
  },
  /** A shared file. A picture opens in the page unless `download` says otherwise. */
  attachment: (id: string, options: { download?: boolean } = {}) => `/api/talk/attachments/${encodeURIComponent(id)}${options.download ? '?download=1' : ''}`,
  /** The small copy of a picture, when `hasPreview` is true. */
  preview: (id: string) => `/api/talk/attachments/${encodeURIComponent(id)}/preview`,
  /** A group's photo, or null without one. Its version is in the URL, so it can be kept for good. */
  groupPhoto: (groupId: number, version: string | null) =>
    version === null ? null : `/api/talk/groups/${groupId}/photo?v=${encodeURIComponent(version)}`,
};
