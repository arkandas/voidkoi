/** Reading a route's parameters, the same way in every Talk route. */
import { ApiError, type ApiErrorCode } from '@/lib/error-codes';
import { parseId } from '@/lib/validate';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '@/modules/talk/lib/protocol';

export function notFound(code: ApiErrorCode = 'notFound'): never {
  throw new ApiError(code, 404);
}

/** A positive id from a route segment, or a 404: nothing has that id. */
export function idOf(raw: string | null | undefined, missing: ApiErrorCode = 'notFound'): number {
  const id = parseId(raw);
  if (id === null) notFound(missing);
  return id;
}

/** A page size from the query string: the default when absent. */
export function pageLimit(raw: string | null): number {
  if (raw === null || raw === '') return DEFAULT_PAGE_SIZE;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1 || value > MAX_PAGE_SIZE) throw new ApiError('invalidInput', 400);
  return value;
}

export const OK = { ok: true } as const;
