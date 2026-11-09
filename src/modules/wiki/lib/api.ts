import type {
  DraftConflict,
  DraftSaved,
  ImageDto,
  PageDetail,
  RevisionDetail,
  RevisionDto,
  SearchResult,
  TrashEntry,
  TreeNodeDto,
  VisibilityDto,
  WikiAdminSettingsDto,
  WikiMemberDto,
  WikiSettingsDto,
} from '@/modules/wiki/lib/api-types';
import { request } from '@/lib/api';
import { readApiError } from '@/lib/error-codes';

export interface NodeChangesInput {
  title?: string;
  slug?: string;
  visibility?: VisibilityDto;
  password?: string;
}

export interface SettingsInput {
  name: string;
  homePageId: number | null;
  rootVisibility: Exclude<VisibilityDto, 'inherit'>;
  password?: string;
  allowIndexing: boolean;
}

/** The wiki's calls, on the suite's `request`: failures come back as ApiErrors. */
export const api = {
  members: () => request<WikiMemberDto[]>('GET', '/wiki/members', undefined, 'loadFailed'),
  setEditor: (id: number, editor: boolean) => request<WikiMemberDto>('PUT', `/wiki/members/${id}`, { editor }, 'saveFailed'),

  settings: () => request<WikiAdminSettingsDto>('GET', '/wiki/settings', undefined, 'loadFailed'),
  saveSettings: (input: SettingsInput) => request<WikiSettingsDto>('PUT', '/wiki/settings', input, 'saveFailed'),

  tree: () => request<TreeNodeDto[]>('GET', '/wiki/tree', undefined, 'loadFailed'),
  createNode: (kind: 'page' | 'folder', parentId: number | null, title: string) =>
    request<{ id: number; path: string }>('POST', '/wiki/nodes', { kind, parentId, title }, 'saveFailed'),
  node: (id: number) => request<PageDetail>('GET', `/wiki/nodes/${id}`, undefined, 'loadFailed'),
  updateNode: (id: number, changes: NodeChangesInput) => request<PageDetail>('PATCH', `/wiki/nodes/${id}`, changes, 'saveFailed'),
  moveNode: (id: number, parentId: number | null, position: number) =>
    request<unknown>('POST', `/wiki/nodes/${id}/move`, { parentId, position }, 'saveFailed'),
  trashNode: (id: number) => request<unknown>('DELETE', `/wiki/nodes/${id}`, undefined, 'deleteFailed'),

  /** A conflict comes back as a value, not an error: the editor offers to reload or keep its own. */
  async saveDraft(id: number, draft: { title: string; content: string; version: number }): Promise<DraftSaved | DraftConflict> {
    const response = await fetch(`/api/wiki/pages/${id}/draft`, {
      method: 'PUT',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(draft),
    });
    if (response.status === 409) return (await response.json()) as DraftConflict;
    if (!response.ok) throw await readApiError(response, 'saveFailed');
    return (await response.json()) as DraftSaved;
  },
  discardDraft: (id: number) => request<unknown>('DELETE', `/wiki/pages/${id}/draft`, undefined, 'deleteFailed'),
  publish: (id: number, message: string | null, version: number) =>
    request<unknown>('POST', `/wiki/pages/${id}/publish`, { message, version }, 'publishFailed'),

  revisions: (id: number) => request<RevisionDto[]>('GET', `/wiki/pages/${id}/revisions`, undefined, 'loadFailed'),
  revision: (id: number, revision: number) => request<RevisionDetail>('GET', `/wiki/pages/${id}/revisions/${revision}`, undefined, 'loadFailed'),
  restoreRevision: (id: number, revision: number) =>
    request<unknown>('POST', `/wiki/pages/${id}/revisions/${revision}/restore`, {}, 'restoreFailed'),

  unlock: (nodeId: number | null, password: string) => request<unknown>('POST', '/wiki/unlock', { nodeId, password }, 'wrongPassword'),

  uploadImage(file: File): Promise<ImageDto> {
    const form = new FormData();
    form.append('file', file);
    return request<ImageDto>('POST', '/wiki/images', form, 'uploadFailed');
  },

  search: (query: string, signal?: AbortSignal) =>
    request<SearchResult[]>('GET', `/wiki/search?q=${encodeURIComponent(query)}`, undefined, 'loadFailed', signal),

  trash: () => request<TrashEntry[]>('GET', '/wiki/trash', undefined, 'loadFailed'),
  restore: (id: number) => request<{ path: string }>('POST', `/wiki/trash/${id}/restore`, {}, 'restoreFailed'),
  deleteForever: (id: number) => request<unknown>('DELETE', `/wiki/trash/${id}`, undefined, 'deleteFailed'),
  emptyTrash: () => request<unknown>('DELETE', '/wiki/trash', undefined, 'deleteFailed'),
};

/** Every page has one address, the same for members and for visitors. */
export const urls = {
  page: (path: string) => (path ? `/wiki/${path}` : '/wiki'),
  edit: (id: number) => `/wiki/edit/${id}`,
  history: (id: number) => `/wiki/history/${id}`,
  trash: '/wiki/trash',
};
