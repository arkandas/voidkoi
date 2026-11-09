/**
 * The apps, in the order the rail shows them. Each account picks the ones it
 * uses, and within some apps the parts it leaves out (sub-apps), at its first
 * sign-in and later in Settings. Names and descriptions are in each app's
 * messages, under `<id>.app`.
 */

import { manifest as files } from '@/modules/files/manifest';
import { manifest as habits } from '@/modules/habits/manifest';
import { manifest as notes } from '@/modules/notes/manifest';
import { manifest as talk } from '@/modules/talk/manifest';
import { manifest as tasks } from '@/modules/tasks/manifest';
import { manifest as utilikit } from '@/modules/utilikit/manifest';
import { manifest as wiki } from '@/modules/wiki/manifest';
import { APP_IDS, type AppId, type AppManifest } from '@/modules/types';

export { APP_IDS, type AppId };
export type AppInfo = AppManifest;

export const APPS: readonly AppInfo[] = [notes, tasks, files, utilikit, habits, talk, wiki];

export function isAppId(value: unknown): value is AppId {
  return typeof value === 'string' && (APP_IDS as readonly string[]).includes(value);
}

export function appInfo(id: AppId): AppInfo {
  return APPS.find(app => app.id === id)!;
}

/** "tasks.boards": a sub-app, by its app. */
export function appKey(app: AppId, subApp: string): string {
  return `${app}.${subApp}`;
}

/** "-tasks.stickies": a sub-app the account leaves out. Every other sub-app of an app it uses is on, new ones too. */
export function offKey(app: AppId, subApp: string): string {
  return `-${appKey(app, subApp)}`;
}

/** Every app with all of its parts: what a new account starts with. */
export function allAppKeys(): string[] {
  return [...APP_IDS];
}

/**
 * The account's keys as stored: the apps it uses, in rail order, then the
 * parts of those it leaves out. Anything else is dropped.
 */
export function cleanAppKeys(keys: readonly unknown[]): string[] {
  const wanted = new Set(keys.filter((key): key is string => typeof key === 'string'));
  const apps = APPS.filter(app => wanted.has(app.id));
  return [
    ...apps.map(app => app.id as string),
    ...apps.flatMap(app => app.subApps.map(sub => offKey(app.id, sub.id)).filter(key => wanted.has(key))),
  ];
}

/** Whether every app in the keys keeps at least one of its parts on. */
export function keepsAPart(keys: readonly string[]): boolean {
  return APPS.every(app => !keys.includes(app.id) || app.subApps.length === 0 || app.subApps.some(sub => uses(keys, app.id, sub.id)));
}

/** Whether an account with these keys uses the app, or that part of it. */
export function uses(keys: readonly string[], app: AppId, subApp?: string): boolean {
  if (!keys.includes(app)) return false;
  return subApp ? !keys.includes(offKey(app, subApp)) : true;
}

/** The apps an account uses, in rail order. */
export function enabledApps(keys: readonly string[]): AppInfo[] {
  return APPS.filter(app => keys.includes(app.id));
}

/** The app a path belongs to, if any. */
export function appOfPath(pathname: string): AppInfo | null {
  return APPS.find(app => pathname === app.href || pathname.startsWith(`${app.href}/`)) ?? null;
}
