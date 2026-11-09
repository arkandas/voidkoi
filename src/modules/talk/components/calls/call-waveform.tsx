'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useRef } from 'react';

import { createVisualiser, type VisualiserVoice } from '@/modules/talk/lib/audio-visualiser';

export interface CallWaveformProps {
  /** The peer's audio, drawn above the line. */
  remote: MediaStream | null;
  /** Your own microphone, drawn below it. */
  local: MediaStream | null;
  /** Who is above the line, named for the legend. */
  peerName: string;
}

/**
 * The two voices on a call, as a band of moving bars.
 *
 * The canvas is deliberately opaque to React: it is created once and then owned
 * by the animation, which runs at the display's refresh rate. Re-rendering this
 * component per frame to move the bars would put reconciliation between the
 * microphone and the screen, for no gain at all.
 */
export function CallWaveform({ remote, local, peerName }: CallWaveformProps) {
  const t = useTranslations('talk.calls.waveform');
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const voices: VisualiserVoice[] = [];
    if (remote) {
      voices.push({ stream: remote, direction: 'up', colourVar: '--accent' });
    }
    if (local) {
      voices.push({ stream: local, direction: 'down', colourVar: '--ink-faint' });
    }
    if (voices.length === 0) return;

    // Browsers hand back a suspended context until the page has seen a gesture.
    // Answering or placing the call is that gesture, so by here it resumes.
    const visualiser = createVisualiser(canvas, voices);
    return () => visualiser?.stop();
  }, [remote, local]);

  return (
    <div className="w-full">
      <canvas
        ref={canvasRef}
        role="img"
        aria-label={t('label', { name: peerName })}
        className="block h-40 w-full"
      />
      <ul
        aria-label={t('legendLabel')}
        className="mt-2 flex items-center justify-center gap-4 text-xs font-medium text-ink-muted"
      >
        <li className="flex items-center gap-1.5">
          <span aria-hidden="true" className="size-2 rounded-full bg-accent" />
          {peerName}
        </li>
        <li className="flex items-center gap-1.5">
          <span aria-hidden="true" className="size-2 rounded-full bg-ink-faint" />
          {t('you')}
        </li>
      </ul>
    </div>
  );
}
