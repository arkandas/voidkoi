'use client';

import { Search, UserRound } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';

import { EmptyState, Input, Spinner } from '@/components/ui';
import { cn } from '@/lib/cn';
import { PersonAvatar } from '@/modules/talk/components/ui/person-avatar';
import { api } from '@/modules/talk/lib/api';
import type { DirectoryUser, UserStatus } from '@/modules/talk/lib/protocol';

import { STATUS_KEY } from './chat-header';

/** One person at a time, for a 1:1 chat. */
interface PickOne {
  onPick(user: DirectoryUser): void;
  chosen?: undefined;
}

/** Several, with a checkbox each, for a group. */
interface PickMany {
  onPick?: undefined;
  chosen: ReadonlySet<number>;
  onToggle(user: DirectoryUser): void;
  /** No more may be ticked; the ones already ticked can still be unticked. */
  full?: boolean;
}

export type PeoplePickerProps = (PickOne | PickMany) & {
  /** You, so the list does not offer yourself. */
  meId: number;
  statusOf(userId: number): UserStatus;
  /** Already in the group, so not offered again. */
  exclude?: ReadonlySet<number>;
  /** Said instead of "Nobody else yet" when everybody is excluded. */
  emptyDescription?: string;
};

/** Everyone who uses Talk, searchable by name or username. Fetched when the picker opens. */
export function PeoplePicker(props: PeoplePickerProps) {
  const { meId, statusOf, exclude, emptyDescription } = props;
  const t = useTranslations('talk.chat');
  const [users, setUsers] = useState<DirectoryUser[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [query, setQuery] = useState('');

  useEffect(() => {
    let cancelled = false;
    void api
      .talkPeople()
      .then(({ users: directory }) => {
        if (!cancelled) setUsers(directory.filter(user => user.id !== meId));
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [meId]);

  const offered = useMemo(() => (users ?? []).filter(user => !exclude?.has(user.id)), [users, exclude]);

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (needle === '') return offered;
    return offered.filter(user => user.displayName.toLowerCase().includes(needle) || user.username.toLowerCase().includes(needle));
  }, [offered, query]);

  return (
    <>
      <div className="mt-4">
        <Input
          // Not autofocused: on a short list the first thing most people want is to click a name they can see.
          value={query}
          onChange={event => setQuery(event.target.value)}
          aria-label={t('newChat.searchLabel')}
          placeholder={t('newChat.searchPlaceholder')}
          icon={<Search size={16} />}
        />
      </div>

      <div className="themed-scroll -mx-2 mt-3 max-h-96 overflow-y-auto px-2">
        {failed ? (
          <p role="alert" className="py-6 text-center text-sm text-danger">
            {t('newChat.loadFailed')}
          </p>
        ) : users === null ? (
          <div className="flex justify-center py-8">
            <Spinner label={t('newChat.loading')} />
          </div>
        ) : matches.length === 0 ? (
          <EmptyState
            icon={<UserRound size={24} />}
            title={query.trim() === '' ? t('newChat.emptyTitle') : t('newChat.noMatchTitle')}
            description={query.trim() === '' ? emptyDescription : undefined}
          />
        ) : (
          <ul aria-label={t('newChat.listLabel')} className="flex flex-col gap-0.5">
            {matches.map(user => {
              const status = statusOf(user.id);
              const who = (
                <>
                  <PersonAvatar person={user} size="md" status={status} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-ink">{user.displayName}</span>
                    <span className="block truncate text-xs text-ink-muted">
                      @{user.username} · {t(`status.${STATUS_KEY[status]}`)}
                    </span>
                  </span>
                </>
              );
              const row = cn('flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left transition-colors', 'hover:bg-muted focus:outline-hidden focus-visible:bg-muted');

              if (props.chosen === undefined) {
                return (
                  <li key={user.id}>
                    <button type="button" onClick={() => props.onPick(user)} className={row}>
                      {who}
                    </button>
                  </li>
                );
              }

              const ticked = props.chosen.has(user.id);
              const blocked = !ticked && props.full === true;
              return (
                <li key={user.id}>
                  <label
                    className={cn(
                      row,
                      // A ring rather than a fill for focus, so a ticked row keeps its tint.
                      'cursor-pointer has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-accent/25',
                      ticked && 'bg-accent-soft hover:bg-accent-soft',
                      blocked && 'cursor-not-allowed opacity-50 hover:bg-transparent',
                    )}
                  >
                    {who}
                    <input
                      type="checkbox"
                      checked={ticked}
                      disabled={blocked}
                      onChange={() => props.onToggle(user)}
                      className="size-[18px] shrink-0 cursor-pointer accent-accent disabled:cursor-not-allowed"
                    />
                  </label>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </>
  );
}
