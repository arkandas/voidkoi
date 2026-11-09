import type { Queryable } from '../db';
import { usesTalk } from '../users';

export interface PushKeysRow {
  public_key: string;
  private_key: string;
}

export interface PushSubscriptionRow {
  endpoint: string;
  user_id: number;
  session_version: number;
  p256dh: string;
  auth: string;
  created_at: Date;
}

/** A device, and the language its account last used, which its notifications are written in. */
export interface PushDeviceRow extends PushSubscriptionRow {
  locale: string | null;
}

/** The server's key pair, made on first use. Two processes starting at once agree on one. */
export async function loadOrInsertPushKeys(db: Queryable, generate: () => PushKeysRow): Promise<PushKeysRow> {
  const existing = await db.query<PushKeysRow>('select public_key, private_key from talk_push_keys where id = 1');
  if (existing.rows[0]) return existing.rows[0];

  const fresh = generate();
  await db.query(
    `insert into talk_push_keys (id, public_key, private_key) values (1, $1, $2)
     on conflict (id) do nothing`,
    [fresh.public_key, fresh.private_key],
  );
  const { rows } = await db.query<PushKeysRow>('select public_key, private_key from talk_push_keys where id = 1');
  return rows[0]!;
}

/**
 * Register a device, or move it: the same browser signed in as somebody else
 * takes its endpoint with it, and stops getting the previous account's
 * notifications.
 */
export async function upsertPushSubscription(db: Queryable, subscription: Omit<PushSubscriptionRow, 'created_at'>): Promise<void> {
  await db.query(
    `insert into talk_push_subscriptions (endpoint, user_id, session_version, p256dh, auth)
     values ($1, $2, $3, $4, $5)
     on conflict (endpoint) do update
        set user_id = excluded.user_id,
            session_version = excluded.session_version,
            p256dh = excluded.p256dh,
            auth = excluded.auth,
            created_at = now()`,
    [subscription.endpoint, subscription.user_id, subscription.session_version, subscription.p256dh, subscription.auth],
  );
}

/** Keep an account's newest `keep` devices; an old phone doesn't live for ever. */
export async function trimPushSubscriptions(db: Queryable, userId: number, keep: number): Promise<void> {
  await db.query(
    `delete from talk_push_subscriptions
      where user_id = $1
        and endpoint not in (
          select endpoint from talk_push_subscriptions
           where user_id = $1
           order by created_at desc
           limit $2
        )`,
    [userId, keep],
  );
}

/**
 * An account's devices, while it uses Talk: one that stops gets nothing, and
 * its devices get notifications again if it takes Talk back. One subscribed
 * before the account's sign-ins were last ended (a new password) belongs to a
 * sign-in that is over: it is left out, and goes.
 */
export async function listPushSubscriptions(db: Queryable, userId: number): Promise<PushDeviceRow[]> {
  await db.query(
    `delete from talk_push_subscriptions p using users u
      where p.user_id = $1 and u.id = p.user_id and p.session_version < u.session_version`,
    [userId],
  );
  const { rows } = await db.query<PushDeviceRow>(
    `select p.endpoint, p.user_id, p.session_version, p.p256dh, p.auth, p.created_at, u.locale
       from talk_push_subscriptions p
       join users u on u.id = p.user_id
      where p.user_id = $1 and ${usesTalk('u')}
      order by p.created_at desc`,
    [userId],
  );
  return rows;
}

export async function findPushSubscription(db: Queryable, endpoint: string, userId: number): Promise<PushDeviceRow | null> {
  const { rows } = await db.query<PushDeviceRow>(
    `select p.endpoint, p.user_id, p.session_version, p.p256dh, p.auth, p.created_at, u.locale
       from talk_push_subscriptions p
       join users u on u.id = p.user_id
      where p.endpoint = $1 and p.user_id = $2 and p.session_version >= u.session_version and ${usesTalk('u')}`,
    [endpoint, userId],
  );
  return rows[0] ?? null;
}

/** Whether a notification could reach the account: a device of a sign-in still on, while it uses Talk. */
export async function hasPushSubscriptions(db: Queryable, userId: number): Promise<boolean> {
  const { rows } = await db.query(
    `select 1 from talk_push_subscriptions p join users u on u.id = p.user_id
      where p.user_id = $1 and p.session_version >= u.session_version and ${usesTalk('u')} limit 1`,
    [userId],
  );
  return rows.length > 0;
}

/** Remove one device. With an account, only if it is theirs. */
export async function deletePushSubscription(db: Queryable, endpoint: string, userId?: number): Promise<number> {
  const { rowCount } =
    userId === undefined
      ? await db.query('delete from talk_push_subscriptions where endpoint = $1', [endpoint])
      : await db.query('delete from talk_push_subscriptions where endpoint = $1 and user_id = $2', [endpoint, userId]);
  return rowCount;
}
