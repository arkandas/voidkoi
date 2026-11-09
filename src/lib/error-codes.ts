import { ERRORS as HABITS } from '@/modules/habits/errors';
import { ERRORS as NOTES } from '@/modules/notes/errors';
import { ERRORS as TALK } from '@/modules/talk/errors';
import { ERRORS as TASKS } from '@/modules/tasks/errors';
import { ERRORS as UTILIKIT } from '@/modules/utilikit/errors';
import { ERRORS as WIKI } from '@/modules/wiki/errors';
import type { AppId } from '@/modules/types';

/** The suite's own codes, with Files' among them. Their messages are in `errors.<code>`. */
const SUITE_ERRORS = [
  'generic',
  'unauthorized',
  'forbidden',
  'notFound',
  'invalidInput',
  'invalidName',
  'nameTaken',
  'folderNotFound',
  'cannotMoveIntoItself',
  'fileTooLarge',
  'quotaExceeded',
  'folderFull',
  'uploadNotFound',
  'uploadIncomplete',
  'chunkInvalid',
  'folderGone',
  'linkNotFound',
  'linkExpired',
  'linkUsedUp',
  'signInRequired',
  'passwordRequired',
  'wrongPassword',
  'tooManyAttempts',
  'invalidDate',
  'invalidLimit',
  'invalidPeople',
  'usersManagedByProvider',
  'missingFields',
  'invalidEmail',
  'passwordLength',
  'invalidRole',
  'userExists',
  'userNotFound',
  'cannotDeleteSelf',
  'invalidQuota',
  'invalidImage',
  'imageTooLarge',
  'notEditable',
  'editConflict',
  'loadFailed',
  'saveFailed',
  'deleteFailed',
  'uploadFailed',
  'restoreFailed',
  'fetchUsersFailed',
  'createUserFailed',
  'deleteUserFailed',
  'noApps',
  'invalidLocale',
  'cannotChangeOwnRole',
] as const;

/** Each app's own codes. Their messages are in `<app>.errors.<code>`. */
const APP_ERRORS = { notes: NOTES, tasks: TASKS, talk: TALK, habits: HABITS, utilikit: UTILIKIT, wiki: WIKI } as const;

export const API_ERRORS = [...SUITE_ERRORS, ...NOTES, ...TASKS, ...TALK, ...HABITS, ...UTILIKIT, ...WIKI] as const;

export type ApiErrorCode = (typeof API_ERRORS)[number];

/** The app whose code it is, or null for the suite's own. */
export function errorOwner(code: ApiErrorCode): AppId | null {
  for (const [app, codes] of Object.entries(APP_ERRORS)) {
    if ((codes as readonly string[]).includes(code)) return app as AppId;
  }
  return null;
}

export class ApiError extends Error {
  constructor(public code: ApiErrorCode, public status = 400) {
    super(code);
  }
}

export function errorCode(error: unknown, fallback: ApiErrorCode): ApiErrorCode {
  return error instanceof ApiError ? error.code : fallback;
}

export function isApiErrorCode(value: unknown): value is ApiErrorCode {
  return typeof value === 'string' && (API_ERRORS as readonly string[]).includes(value);
}

export async function readApiError(response: Response, fallback: ApiErrorCode): Promise<ApiError> {
  const body = await response.json().catch(() => null);
  return new ApiError(isApiErrorCode(body?.error) ? body.error : fallback, response.status);
}
