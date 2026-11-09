import type { AdminUser, MeDto, PersonDto } from '@/lib/api-types'
import { ApiError, readApiError, type ApiErrorCode } from '@/lib/error-codes'
import type { AppId } from '@/modules/types'

/**
 * A request to `/api<path>`, with a JSON body or a form (`FormData`), that
 * answers JSON. A failure throws an ApiError: the server's own code, or `fallback`.
 */
export async function request<T>(method: string, path: string, body?: unknown, fallback: ApiErrorCode = 'generic', signal?: AbortSignal): Promise<T> {
  let response: Response
  try {
    response = await fetch(`/api${path}`, {
      method,
      cache: 'no-store',
      signal,
      ...(body === undefined
        ? {}
        : body instanceof FormData
          ? { body }
          : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
    })
  } catch {
    throw new ApiError(fallback, 0)
  }
  if (!response.ok) throw await readApiError(response, fallback)
  return response.json() as Promise<T>
}

export interface NewUser {
  username: string
  email: string
  password: string
  role: 'ADMIN' | 'USER'
}

/** The account, people and the administrator's users. Each app has its own calls next to its code. */
export const api = {
  me: (signal?: AbortSignal) => request<MeDto>('GET', '/me', undefined, 'loadFailed', signal),
  saveProfile: (changes: { name?: string | null; locale?: string }) => request<MeDto>('PATCH', '/me', changes, 'saveFailed'),
  saveApps: (apps: string[]) => request<MeDto>('PUT', '/me/apps', { apps }, 'saveFailed'),
  setAvatar: (image: string) => request<MeDto>('PUT', '/me/avatar', { image }, 'saveFailed'),
  clearAvatar: () => request<MeDto>('DELETE', '/me/avatar', undefined, 'deleteFailed'),
  changePassword: (current: string, password: string) => request<unknown>('PUT', '/me/password', { current, password }, 'saveFailed'),
  /** Everyone else, or those who use `app`. */
  people: (app?: AppId) => request<PersonDto[]>('GET', `/people${app ? `?app=${app}` : ''}`, undefined, 'loadFailed'),

  users: () => request<AdminUser[]>('GET', '/users', undefined, 'fetchUsersFailed'),
  createUser: (user: NewUser) => request<AdminUser>('POST', '/users', user, 'createUserFailed'),
  setRole: (id: number, role: AdminUser['role']) => request<AdminUser>('PATCH', `/users/${id}`, { role }, 'saveFailed'),
  deleteUser: (id: number) => request<unknown>('DELETE', `/users/${id}`, undefined, 'deleteUserFailed'),
  setUserPassword: (id: number, password: string) => request<unknown>('PUT', `/users/${id}/password`, { password }, 'saveFailed'),
}

export const urls = {
  /** Through a Files link, for its visitors: `link` for a share link, `upload` for an upload link. */
  avatar: (userId: number, key: string, through?: { link?: string; upload?: string }) =>
    `/api/users/${userId}/avatar?v=${encodeURIComponent(key)}${through?.link ? `&link=${through.link}` : ''}${through?.upload ? `&upload=${through.upload}` : ''}`,
}

/** Start a download without leaving the page: the server answers with `attachment`. */
export function download(url: string): void {
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = ''
  anchor.rel = 'noopener'
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
}
