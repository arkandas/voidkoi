'use client';

import { useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { errorCode, errorOwner, type ApiErrorCode } from '@/lib/error-codes';
import { LIMITS } from '@/lib/validate';

/** The message for an error from the API: the suite's in `errors`, an app's in `<app>.errors`. */
export function useApiError() {
  const t = useTranslations();

  return useCallback(
    (error: unknown, fallback: ApiErrorCode) => {
      const code = errorCode(error, fallback);
      const owner = errorOwner(code);
      const key = (owner ? `${owner}.errors.${code}` : `errors.${code}`) as Parameters<typeof t>[0];
      return t(key, { min: LIMITS.passwordMin, max: LIMITS.passwordMax });
    },
    [t],
  );
}
