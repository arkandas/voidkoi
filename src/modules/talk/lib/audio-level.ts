/**
 * How loud a microphone is, right now.
 *
 * A picker that only lists names is a guess: the useful question is "is this
 * the one that can hear me?", and the only honest answer is a meter that moves
 * when you talk. `AnalyserNode` does the whole job, so no library is involved.
 *
 * The level arrives through a callback rather than React state. It changes
 * sixty times a second, and re-rendering a component that often to move a bar
 * is how a settings page starts dropping frames.
 */

/** The AudioContext constructor, prefixed on older Safari; undefined without Web Audio. */
export function audioContextClass(): typeof AudioContext | undefined {
  return typeof AudioContext !== 'undefined'
    ? AudioContext
    : (globalThis as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
}

export interface LevelMeter {
  stop(): void;
}

/**
 * How long of nothing at all before the stream is called dead.
 *
 * Long enough that a device still starting up is not accused of being broken.
 */
const DEAD_AIR_MS = 1500;

/** Above this the signal is speech rather than the noise floor of a room. */
const SILENCE_FLOOR = 0.004;

/**
 * Perceptual scaling. Loudness is logarithmic, so a linear bar spends most of
 * its travel in a range normal speech never reaches, and looks broken.
 */
const CURVE = 0.45;

/** Falls slowly, rises instantly: a bar that flickers is unreadable. */
const DECAY = 0.82;

/**
 * Watch a microphone.
 *
 * `onLevel` fires every frame with 0..1. `onDeadAir` fires only when the answer
 * to "is anything at all arriving?" changes.
 *
 * Dead air is worth separating from quiet. A real microphone in a real room
 * always has a noise floor, so samples that are *exactly* the zero point, held
 * for over a second, do not mean a quiet room — they mean the operating system
 * is handing the browser nothing, usually because it has not been granted
 * microphone access. `MediaStreamTrack.muted` is supposed to say so and does
 * not fire dependably, so the audio itself is the more honest witness.
 */
export function meterStream(
  stream: MediaStream,
  onLevel: (level: number) => void,
  onDeadAir?: (dead: boolean) => void,
): LevelMeter | null {
  const Context = audioContextClass();
  if (!Context || stream.getAudioTracks().length === 0) return null;

  const context = new Context();
  const analyser = context.createAnalyser();
  analyser.fftSize = 1024;
  analyser.smoothingTimeConstant = 0;

  const source = context.createMediaStreamSource(stream);
  source.connect(analyser);
  // Deliberately not connected to the destination: this is measurement, and
  // routing a microphone to the speakers is how you get feedback howl.

  const samples = new Uint8Array(analyser.fftSize);
  let frame: number | null = null;
  let smoothed = 0;
  let stopped = false;
  let lastSignalAt = performance.now();
  let reportedDead = false;

  // Browsers start a context suspended until a gesture has been seen. Opening
  // the picker is that gesture, but the promise still has to be waited on.
  void context.resume().catch(() => undefined);

  const tick = (): void => {
    if (stopped) return;
    analyser.getByteTimeDomainData(samples);

    // Root mean square around the 128 mid-point of unsigned 8-bit audio, plus
    // the largest excursion, which is what tells silence from dead air.
    let sum = 0;
    let peak = 0;
    for (const sample of samples) {
      const offset = sample - 128;
      if (offset !== 0) peak = Math.max(peak, offset < 0 ? -offset : offset);
      const centred = offset / 128;
      sum += centred * centred;
    }
    const rms = Math.sqrt(sum / samples.length);

    const now = performance.now();
    if (peak > 0) lastSignalAt = now;
    const dead = now - lastSignalAt > DEAD_AIR_MS;
    if (dead !== reportedDead) {
      reportedDead = dead;
      onDeadAir?.(dead);
    }

    const level = rms < SILENCE_FLOOR ? 0 : Math.min(1, Math.pow(rms, CURVE) * 1.6);
    smoothed = level > smoothed ? level : smoothed * DECAY;

    onLevel(smoothed);
    frame = requestAnimationFrame(tick);
  };
  frame = requestAnimationFrame(tick);

  return {
    stop(): void {
      stopped = true;
      if (frame !== null) cancelAnimationFrame(frame);
      source.disconnect();
      analyser.disconnect();
      void context.close().catch(() => undefined);
    },
  };
}
