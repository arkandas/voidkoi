'use client';

import { useCallback } from 'react';
import { ApiError, isApiErrorCode } from '@/lib/error-codes';
import { useApiError } from '@/lib/use-api-error';

/**
 * The message for an error code a tool's route answered with: Utilikit's own
 * codes from `utilikit.errors`, the suite's from `errors`, and `generic` for
 * anything it doesn't know.
 */
export function useErrorMessage() {
  const apiError = useApiError();
  return useCallback((code: unknown) => apiError(new ApiError(isApiErrorCode(code) ? code : 'generic'), 'generic'), [apiError]);
}

/** The error code in a failed response, or `generic`. */
export async function readErrorCode(response: Response): Promise<string> {
  const data = await response.json().catch(() => null);
  return typeof data?.error === 'string' ? data.error : 'generic';
}
