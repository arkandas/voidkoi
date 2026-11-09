import { ApiError, type ApiErrorCode } from '@/lib/error-codes'

/**
 * What went wrong in a tool, as an error code the page can name, plus a
 * detail in our own words that a failed job shows. What a program printed
 * goes in `output`, for the server log only: it can name server paths.
 */
export class ToolError extends ApiError {
  constructor(
    code: ApiErrorCode,
    public detail?: string,
    status = 400,
    output?: string,
  ) {
    super(code, status)
    this.message = [code, detail, output].filter(Boolean).join(': ')
  }
}

/** Any error as a ToolError: a missing program becomes `toolMissing`, anything else `fallback` with its message. */
export function toToolError(error: unknown, fallback: ApiErrorCode): ToolError {
  if (error instanceof ToolError) return error
  if (error instanceof ApiError) return new ToolError(error.code, undefined, error.status)
  const detail = error instanceof Error ? error.message : undefined
  const missingBinary = typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT' && 'syscall' in error
  return new ToolError(missingBinary ? 'toolMissing' : fallback, detail)
}
