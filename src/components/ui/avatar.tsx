'use client';

import { useState } from 'react';

import { urls } from '@/lib/api';
import type { PersonDto } from '@/lib/api-types';
import { avatarTint, initials } from '@/lib/avatar';
import { cn } from '@/lib/cn';

export type AvatarSize = 'xs' | 'sm' | 'md' | 'lg';

const BOXES: Record<AvatarSize, string> = {
  xs: 'size-6 text-[10px]',
  sm: 'size-8 text-xs',
  md: 'size-10 text-sm',
  lg: 'size-24 text-3xl',
};

export interface AvatarProps {
  person: Pick<PersonDto, 'id' | 'username' | 'avatar'>;
  size?: AvatarSize;
  /** On a share link's page: the link is what lets a visitor see the picture. */
  link?: string;
  /** The same, on an upload link's page. */
  uploadLink?: string;
  className?: string;
}

/** A person's picture, or their initials on their own colour when they have none. */
export function Avatar({ person, size = 'md', link, uploadLink, className }: AvatarProps) {
  const [failed, setFailed] = useState<string | null>(null);
  const source = person.avatar && failed !== person.avatar ? urls.avatar(person.id, person.avatar, { link, upload: uploadLink }) : null;

  return (
    <span className={cn('relative inline-flex shrink-0', className)}>
      {source ? (
        <img
          src={source}
          alt=""
          aria-hidden="true"
          onError={() => setFailed(person.avatar)}
          className={cn('rounded-full object-cover ring-1 ring-line', BOXES[size])}
        />
      ) : (
        <span
          aria-hidden="true"
          className={cn(
            'avatar-disc inline-flex items-center justify-center rounded-full font-semibold select-none',
            `avatar-${avatarTint(person.id)}`,
            BOXES[size],
          )}
        >
          {initials(person.username)}
        </span>
      )}
    </span>
  );
}

/** A few faces overlapping, for "shared with 3 people". */
export function AvatarStack({ people, max = 3 }: { people: PersonDto[]; max?: number }) {
  const shown = people.slice(0, max);
  return (
    <span className="inline-flex items-center">
      {shown.map((person, index) => (
        <Avatar key={person.id} person={person} size="xs" className={cn('ring-2 ring-surface rounded-full', index > 0 && '-ml-1.5')} />
      ))}
      {people.length > max ? (
        <span className="-ml-1.5 inline-flex size-6 items-center justify-center rounded-full bg-muted text-[10px] font-semibold text-ink-muted ring-2 ring-surface">
          +{people.length - max}
        </span>
      ) : null}
    </span>
  );
}
