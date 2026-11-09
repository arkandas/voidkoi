/**
 * Talk's sounds, synthesised with the Web Audio API. No audio files, so nothing
 * is fetched from anywhere at runtime.
 *
 * The chime is built like a struck metal bar: a fundamental plus the bar's own
 * inharmonic overtones (2.76 and 5.40 times the note), each fading at its own
 * rate, so it rings rather than beeps. A short echo gives it a room to ring
 * in, and a compressor and limiter at the end make it full and loud without
 * ever clipping.
 *
 * Browsers will not start an AudioContext without a user gesture, and a call
 * can arrive long after the last click. So the context is created on the first
 * gesture after load and kept for the life of the page: by the time a call
 * comes in it is already warm and can ring without a second gesture.
 */

export type Tone = 'ringback' | 'ringtone';

export type RingtoneStyle = 'chime' | 'marimba' | 'classic';
export type MessageStyle = 'chime' | 'pop' | 'off';

export const RINGTONE_STYLES: readonly RingtoneStyle[] = ['chime', 'marimba', 'classic'];
export const MESSAGE_STYLES: readonly MessageStyle[] = ['chime', 'pop', 'off'];

/* ------------------------------------------------------------------ */
/* Instruments                                                          */
/* ------------------------------------------------------------------ */

/** One overtone: its pitch as a multiple of the note, its level, and how long it rings. */
interface Partial {
  ratio: number;
  level: number;
  /** Fraction of the note's length it takes to die away. */
  decay: number;
}

type Instrument = 'chime' | 'marimba' | 'pop' | 'tone';

const PARTIALS: Record<Exclude<Instrument, 'tone'>, Partial[]> = {
  // A metal bar: the overtones are not whole multiples, which is what makes it a chime.
  chime: [
    { ratio: 1, level: 1, decay: 1 },
    { ratio: 2.76, level: 0.42, decay: 0.45 },
    { ratio: 5.4, level: 0.2, decay: 0.22 },
    { ratio: 8.93, level: 0.08, decay: 0.12 },
  ],
  // A wooden bar: tuned to the fourth harmonic, and quicker to stop.
  marimba: [
    { ratio: 1, level: 1, decay: 1 },
    { ratio: 4, level: 0.3, decay: 0.3 },
    { ratio: 10, level: 0.06, decay: 0.1 },
  ],
  pop: [
    { ratio: 1, level: 1, decay: 1 },
    { ratio: 2, level: 0.35, decay: 0.5 },
  ],
};

interface Note {
  /** Seconds from the start of the phrase. */
  at: number;
  frequency: number;
  /** Seconds until it has died away. */
  length: number;
  /** 0–1. */
  velocity?: number;
}

/* ------------------------------------------------------------------ */
/* The sounds                                                           */
/* ------------------------------------------------------------------ */

interface Phrase {
  instrument: Instrument;
  notes: Note[];
  /** For a ringtone: seconds from one start of the phrase to the next. */
  period?: number;
}

const RINGTONES: Record<RingtoneStyle, Phrase> = {
  // G5 D6 B5 G6: a rising, open figure that is Talk's own.
  chime: {
    instrument: 'chime',
    period: 2.4,
    notes: [
      { at: 0, frequency: 784, length: 1.4 },
      { at: 0.16, frequency: 1175, length: 1.4 },
      { at: 0.32, frequency: 988, length: 1.4 },
      { at: 0.48, frequency: 1568, length: 1.8 },
    ],
  },
  marimba: {
    instrument: 'marimba',
    period: 2,
    notes: [
      { at: 0, frequency: 659, length: 0.5 },
      { at: 0.12, frequency: 831, length: 0.5 },
      { at: 0.24, frequency: 988, length: 0.5 },
      { at: 0.36, frequency: 1319, length: 0.7 },
      { at: 0.6, frequency: 988, length: 0.5 },
      { at: 0.72, frequency: 1319, length: 0.8 },
    ],
  },
  classic: {
    instrument: 'tone',
    period: 2.4,
    notes: [
      { at: 0, frequency: 660, length: 0.9 },
      { at: 0, frequency: 880, length: 0.9, velocity: 0.6 },
    ],
  },
};

/** What the caller hears while it rings: the tone every phone makes, 440 + 480 Hz. */
const RINGBACK: Phrase = {
  instrument: 'tone',
  period: 4,
  notes: [
    { at: 0, frequency: 440, length: 1.4, velocity: 0.6 },
    { at: 0, frequency: 480, length: 1.4, velocity: 0.6 },
  ],
};

const RECEIVED: Record<Exclude<MessageStyle, 'off'>, Phrase> = {
  // C6 then G6, a fifth up.
  chime: {
    instrument: 'chime',
    notes: [
      { at: 0, frequency: 1047, length: 0.9 },
      { at: 0.09, frequency: 1568, length: 1.1 },
    ],
  },
  pop: {
    instrument: 'pop',
    notes: [{ at: 0, frequency: 1200, length: 0.18 }],
  },
};

const SENT: Record<Exclude<MessageStyle, 'off'>, Phrase> = {
  chime: {
    instrument: 'chime',
    notes: [{ at: 0, frequency: 1319, length: 0.45, velocity: 0.55 }],
  },
  pop: {
    instrument: 'pop',
    notes: [{ at: 0, frequency: 900, length: 0.12, velocity: 0.7 }],
  },
};

const ENDED: Phrase = {
  instrument: 'chime',
  notes: [
    { at: 0, frequency: 784, length: 0.6, velocity: 0.7 },
    { at: 0.14, frequency: 587, length: 0.9, velocity: 0.7 },
  ],
};

/* ------------------------------------------------------------------ */
/* Choices, kept in this browser                                        */
/* ------------------------------------------------------------------ */

const RINGTONE_KEY = 'talk.ringtone';
const MESSAGE_KEY = 'talk.messageSound';

function read<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  try {
    const value = window.localStorage.getItem(key);
    // An older switch stored 'on'; anything unknown means the default.
    return (allowed as readonly string[]).includes(value ?? '') ? (value as T) : fallback;
  } catch {
    return fallback;
  }
}

const listeners = new Set<() => void>();

export function subscribeSoundChoices(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function ringtoneStyle(): RingtoneStyle {
  return read(RINGTONE_KEY, RINGTONE_STYLES, 'chime');
}

export function messageStyle(): MessageStyle {
  return read(MESSAGE_KEY, MESSAGE_STYLES, 'chime');
}

function write(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Private mode or storage off: the default stays.
  }
  for (const listener of listeners) listener();
}

export function setRingtoneStyle(style: RingtoneStyle): void {
  write(RINGTONE_KEY, style);
}

export function setMessageStyle(style: MessageStyle): void {
  write(MESSAGE_KEY, style);
}

/* ------------------------------------------------------------------ */
/* Engine                                                               */
/* ------------------------------------------------------------------ */

type AudioContextCtor = typeof AudioContext;

function audioContextCtor(): AudioContextCtor | null {
  if (typeof window === 'undefined') return null;
  const scope = window as Window & { webkitAudioContext?: AudioContextCtor };
  return window.AudioContext ?? scope.webkitAudioContext ?? null;
}

let context: AudioContext | null = null;
/** Where every note goes: through the echo, the compressor and the limiter. */
let bus: AudioNode | null = null;
let currentTone: Tone | null = null;
let scheduler: ReturnType<typeof setInterval> | null = null;
let nextPhraseAt = 0;
let installed = false;

/**
 * note → bus ─┬──────────────────────────→ compressor → makeup → limiter → trim → speakers
 *             └→ delay ⟲ (filtered feedback) ┘
 */
function buildBus(ctx: AudioContext): AudioNode {
  const input = ctx.createGain();

  const compressor = ctx.createDynamicsCompressor();
  compressor.threshold.value = -28;
  compressor.knee.value = 10;
  compressor.ratio.value = 6;
  compressor.attack.value = 0.003;
  compressor.release.value = 0.2;

  const makeup = ctx.createGain();
  makeup.gain.value = 3.2;

  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -3;
  limiter.knee.value = 0;
  limiter.ratio.value = 20;
  limiter.attack.value = 0.001;
  limiter.release.value = 0.1;

  // The limiter lets the first millisecond of a sharp strike through; this
  // keeps even that under full scale.
  const trim = ctx.createGain();
  trim.gain.value = 0.9;

  // A short, darkened echo: the chime rings in a room instead of stopping dead.
  const delay = ctx.createDelay(1);
  delay.delayTime.value = 0.11;
  const feedback = ctx.createGain();
  feedback.gain.value = 0.28;
  const damp = ctx.createBiquadFilter();
  damp.type = 'lowpass';
  damp.frequency.value = 3500;
  const wet = ctx.createGain();
  wet.gain.value = 0.35;

  input.connect(compressor);
  input.connect(delay);
  delay.connect(damp).connect(feedback).connect(delay);
  damp.connect(wet).connect(compressor);
  compressor.connect(makeup).connect(limiter).connect(trim).connect(ctx.destination);
  return input;
}

/**
 * Create (or resume) the AudioContext. Safe to call repeatedly; returns null
 * where Web Audio is unavailable, and the app simply stays silent.
 */
function ensureAudioContext(): AudioContext | null {
  const Ctor = audioContextCtor();
  if (!Ctor) return null;
  if (!context) {
    try {
      context = new Ctor();
      bus = buildBus(context);
    } catch {
      context = null;
      bus = null;
      return null;
    }
  }
  if (context.state === 'suspended') {
    void context.resume().catch(() => undefined);
  }
  return context;
}

/**
 * Arm the context on the first user gesture after load. Call once, from a
 * top-level effect; the listeners remove themselves.
 */
export function installAudioUnlock(): () => void {
  if (installed || typeof window === 'undefined') return () => undefined;
  installed = true;

  const unlock = (): void => {
    ensureAudioContext();
  };
  const events: Array<keyof WindowEventMap> = ['pointerdown', 'keydown', 'touchstart'];
  for (const event of events) {
    window.addEventListener(event, unlock, { once: true, passive: true });
  }
  return () => {
    for (const event of events) window.removeEventListener(event, unlock);
    installed = false;
  };
}

/** A few milliseconds of rise: a note that starts at full level clicks. */
const ATTACK = 0.004;
/** The loudest a single note is sent into the bus; the compressor does the rest. */
const NOTE_LEVEL = 0.5;

function playNote(ctx: AudioContext, out: AudioNode, instrument: Instrument, note: Note, startAt: number): void {
  const velocity = note.velocity ?? 1;
  const from = startAt + note.at;

  if (instrument === 'tone') {
    // A plain held tone, for the classic ring and the ringback.
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    const to = from + note.length;
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(note.frequency, from);
    gain.gain.setValueAtTime(0, from);
    gain.gain.linearRampToValueAtTime(NOTE_LEVEL * velocity, from + 0.02);
    gain.gain.setValueAtTime(NOTE_LEVEL * velocity, to - 0.02);
    gain.gain.linearRampToValueAtTime(0, to);
    oscillator.connect(gain).connect(out);
    oscillator.start(from);
    oscillator.stop(to + 0.05);
    return;
  }

  for (const partial of PARTIALS[instrument]) {
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    const to = from + note.length * partial.decay;
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(note.frequency * partial.ratio, from);
    if (instrument === 'pop') {
      // A drop in pitch is what makes a pop a pop.
      oscillator.frequency.exponentialRampToValueAtTime(note.frequency * partial.ratio * 0.6, to);
    }
    gain.gain.setValueAtTime(0, from);
    gain.gain.linearRampToValueAtTime(NOTE_LEVEL * velocity * partial.level, from + ATTACK);
    gain.gain.exponentialRampToValueAtTime(0.0001, to);
    oscillator.connect(gain).connect(out);
    oscillator.start(from);
    oscillator.stop(to + 0.05);
  }
}

function playPhrase(phrase: Phrase, at?: number): void {
  const ctx = ensureAudioContext();
  if (!ctx || !bus) return;
  const start = at ?? ctx.currentTime + 0.02;
  for (const note of phrase.notes) playNote(ctx, bus, phrase.instrument, note, start);
}

/**
 * Start ringing, replacing whatever was ringing before. Phrases are scheduled a
 * little ahead of time so the rhythm does not drift with timer jitter.
 */
export function startTone(tone: Tone): void {
  const ctx = ensureAudioContext();
  if (!ctx) return;
  if (currentTone === tone) return;

  stopTone();
  const fresh = ensureAudioContext();
  if (!fresh) return;
  currentTone = tone;

  const phrase = tone === 'ringback' ? RINGBACK : RINGTONES[ringtoneStyle()];
  const period = phrase.period ?? 2;
  nextPhraseAt = fresh.currentTime + 0.05;
  playPhrase(phrase, nextPhraseAt);
  nextPhraseAt += period;

  scheduler = setInterval(() => {
    if (!context || currentTone !== tone) return;
    // Keep roughly one period queued ahead of the clock.
    while (nextPhraseAt < context.currentTime + period) {
      playPhrase(phrase, nextPhraseAt);
      nextPhraseAt += period;
    }
  }, 250);
}

/**
 * Stop ringing immediately.
 *
 * Notes already scheduled cannot be un-scheduled, so the context is closed and
 * dropped; the next `ensureAudioContext` builds a fresh one. That is the only
 * way to guarantee a ringtone stops the instant a call is answered.
 */
export function stopTone(): void {
  if (scheduler !== null) {
    clearInterval(scheduler);
    scheduler = null;
  }
  if (currentTone !== null && context) {
    const dying = context;
    context = null;
    bus = null;
    void dying.close().catch(() => undefined);
  }
  currentTone = null;
}

/** Played once when a call ends. */
export function playEndTone(): void {
  stopTone();
  playPhrase(ENDED);
}

/** A new message arrived. Never over a ringing call. */
export function playMessageTone(style: MessageStyle = messageStyle()): void {
  if (currentTone !== null || style === 'off') return;
  playPhrase(RECEIVED[style]);
}

/** Your own message went out. */
export function playSentTone(style: MessageStyle = messageStyle()): void {
  if (currentTone !== null || style === 'off') return;
  playPhrase(SENT[style]);
}

/** One ring of a ringtone, to hear it in Settings. */
export function previewRingtone(style: RingtoneStyle): void {
  if (currentTone !== null) return;
  playPhrase(RINGTONES[style]);
}
