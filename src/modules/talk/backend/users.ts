/**
 * The suite's accounts as Talk sees them. People are the accounts that use
 * Talk; their names and pictures are the suite's own.
 */
import type { DirectoryUser, TalkPerson, UserStatus } from '@/modules/talk/lib/protocol';

import type { Queryable } from './db';

/** An account, as Talk's queries select it. */
export interface UserRow {
  id: number;
  username: string;
  /** Their name, or the username when they have none. */
  display_name: string;
  avatar_key: string | null;
}

/** The columns of a `UserRow`, from the `users` row under `alias`. */
export function personColumns(alias: string, prefix = ''): string {
  return [
    `${alias}.id as ${prefix}id`,
    `${alias}.username as ${prefix}username`,
    `coalesce(${alias}.name, ${alias}.username) as ${prefix}display_name`,
    `${alias}.avatar_key as ${prefix}avatar_key`,
  ].join(', ');
}

/** SQL that holds for an account that uses Talk, under `alias`. */
export function usesTalk(alias: string): string {
  return `'talk' = any(${alias}.apps)`;
}

export function toPerson(row: UserRow): TalkPerson {
  return { id: row.id, username: row.username, displayName: row.display_name, avatar: row.avatar_key };
}

export function toDirectoryUser(row: UserRow, status: UserStatus): DirectoryUser {
  return { ...toPerson(row), status };
}

/** A row's `prefix`ed person columns, or null when the join found nobody. */
export function personFrom(row: Record<string, unknown>, prefix: string): UserRow | null {
  const id = row[`${prefix}id`];
  if (typeof id !== 'number') return null;
  return {
    id,
    username: row[`${prefix}username`] as string,
    display_name: row[`${prefix}display_name`] as string,
    avatar_key: (row[`${prefix}avatar_key`] as string | null) ?? null,
  };
}

/** Everyone who uses Talk, by name. */
export async function listTalkUsers(db: Queryable): Promise<UserRow[]> {
  const { rows } = await db.query<UserRow>(
    `select ${personColumns('u')} from users u
      where ${usesTalk('u')}
      order by lower(coalesce(u.name, u.username)), u.id`,
  );
  return rows;
}

/** An account, whether or not it uses Talk now. */
export async function findUser(db: Queryable, id: number): Promise<UserRow | null> {
  const { rows } = await db.query<UserRow>(`select ${personColumns('u')} from users u where u.id = $1`, [id]);
  return rows[0] ?? null;
}

/** An account that uses Talk: someone who can be called, written to or put in a group. */
export async function findTalkUser(db: Queryable, id: number): Promise<UserRow | null> {
  const { rows } = await db.query<UserRow>(`select ${personColumns('u')} from users u where u.id = $1 and ${usesTalk('u')}`, [id]);
  return rows[0] ?? null;
}

/** The language an account last used, for what the server writes to it on its own. */
export async function localeOf(db: Queryable, id: number): Promise<string | null> {
  const { rows } = await db.query<{ locale: string | null }>('select locale from users where id = $1', [id]);
  return rows[0]?.locale ?? null;
}
