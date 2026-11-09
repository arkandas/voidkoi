'use client';

import { UsersRound } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { Avatar } from '@/components/ui';
import { cn } from '@/lib/cn';
import type { TalkPerson, UserStatus } from '@/modules/talk/lib/protocol';

export type TalkAvatarSize = 'sm' | 'md' | 'xl' | 'lg';

/** The suite's sizes, and 64px, which sits level with a call control. */
const SUITE_SIZE = { sm: 'sm', md: 'md', xl: 'lg', lg: 'lg' } as const;
const XL = '[&>img]:size-16 [&>span]:size-16 [&>span]:text-xl';
const BOXES: Record<TalkAvatarSize, string> = { sm: 'size-8', md: 'size-10', xl: 'size-16', lg: 'size-24' };

/** On the edge of the circle at every size, not off its corner. */
const DOTS: Record<TalkAvatarSize, string> = {
  sm: 'size-2.5 ring-2 right-0 bottom-0',
  md: 'size-3 ring-2 right-0 bottom-0',
  xl: 'size-4 ring-[3px] right-0.5 bottom-0.5',
  lg: 'size-5 ring-4 right-1 bottom-1',
};

const DOT_COLOURS: Record<Exclude<UserStatus, 'offline'>, string> = {
  online: 'bg-success',
  'in-call': 'bg-warning',
};

/** A halo that keeps leaving the avatar, like sound, while a call rings. */
function RingHalo({ late = false }: { late?: boolean }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const element = ref.current;
    if (!element || typeof element.animate !== 'function') return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      element.style.opacity = late ? '0' : '0.25';
      element.style.transform = 'scale(1.12)';
      return;
    }
    const animation = element.animate(
      [
        { transform: 'scale(1)', opacity: 0.45 },
        { transform: 'scale(1.45)', opacity: 0 },
      ],
      { duration: 2000, iterations: Infinity, easing: 'cubic-bezier(0.2, 0.6, 0.35, 1)', delay: late ? 1000 : 0, fill: 'backwards' },
    );
    return () => animation.cancel();
  }, [late]);
  return <span ref={ref} aria-hidden="true" className="absolute inset-0 rounded-full bg-accent opacity-0" />;
}

export interface PersonAvatarProps {
  person: Pick<TalkPerson, 'id' | 'username' | 'avatar'>;
  size?: TalkAvatarSize;
  /** Draws the presence dot; offline or left out, none. */
  status?: UserStatus;
  /** The halo of a ringing call. */
  ringing?: boolean;
  /** What the dot is cut out of: whatever the avatar sits on. */
  dotRing?: string;
  className?: string;
}

/** Someone's picture, the suite's, with whether they have Talk open. */
export function PersonAvatar({ person, size = 'md', status, ringing = false, dotRing = 'ring-surface', className }: PersonAvatarProps) {
  const showDot = status === 'online' || status === 'in-call';
  return (
    <span className={cn('relative inline-flex shrink-0', BOXES[size], className)}>
      {ringing ? (
        <>
          <RingHalo />
          <RingHalo late />
        </>
      ) : null}
      <Avatar person={person} size={SUITE_SIZE[size]} className={cn('relative', size === 'xl' && XL)} />
      {showDot ? (
        // The status is always said in words nearby; the dot is decoration.
        <span aria-hidden="true" className={cn('absolute rounded-full', dotRing, DOTS[size], DOT_COLOURS[status])} />
      ) : null}
    </span>
  );
}

const GROUP_ICONS: Record<TalkAvatarSize, number> = { sm: 15, md: 19, xl: 28, lg: 40 };

/**
 * A group's photo, or, without one, a neutral disc with people on it: the
 * size and shape of a person's picture, never taken for one, and never a
 * presence dot.
 */
export function GroupAvatar({ size = 'md', photoUrl = null, className }: { size?: TalkAvatarSize; photoUrl?: string | null; className?: string }) {
  // A photo that fails to load falls back to the people, as a picture does to initials.
  const [failed, setFailed] = useState<string | null>(null);
  const source = photoUrl !== null && failed !== photoUrl ? photoUrl : null;
  return (
    <span className={cn('relative inline-flex shrink-0', className)}>
      {source ? (
        <img src={source} alt="" aria-hidden="true" onError={() => setFailed(source)} className={cn('rounded-full object-cover ring-1 ring-line', BOXES[size])} />
      ) : (
        <span aria-hidden="true" className={cn('inline-flex items-center justify-center rounded-full bg-muted text-ink-muted ring-1 ring-line', BOXES[size])}>
          <UsersRound size={GROUP_ICONS[size]} />
        </span>
      )}
    </span>
  );
}
