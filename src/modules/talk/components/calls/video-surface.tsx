'use client';

import { useEffect, useRef } from 'react';

import { cn } from '@/lib/cn';

export interface VideoSurfaceProps {
  stream: MediaStream | null;
  /** Always true for our own preview: hearing yourself is unbearable. */
  muted?: boolean;
  /** Flip our own preview, so it behaves like a mirror. */
  mirrored?: boolean;
  className?: string;
  label?: string;
}

/**
 * A `<video>` bound to a MediaStream.
 *
 * `srcObject` cannot be set from JSX, so it is assigned in an effect. Autoplay
 * is allowed here because the stream came from a call the user answered, but
 * the play() promise is still caught: browsers reject it in ways that are not
 * worth surfacing.
 */
export function VideoSurface({
  stream,
  muted = false,
  mirrored = false,
  className,
  label,
}: VideoSurfaceProps) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    if (element.srcObject !== stream) element.srcObject = stream;
    if (stream) void element.play().catch(() => undefined);
  }, [stream]);

  return (
    <video
      ref={ref}
      autoPlay
      playsInline
      muted={muted}
      aria-label={label}
      className={cn('size-full object-cover', mirrored && '-scale-x-100', className)}
    />
  );
}
