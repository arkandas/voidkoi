/**
 * The shape of a conversation, drawn on a canvas.
 *
 * The curve is the voice's spectrum, low notes on the left and high on the
 * right, smoothed into one continuous crest. It fills the width from the first
 * frame and morphs as somebody speaks, where a scrolling history spends the
 * opening seconds of a call looking like a flat line.
 *
 * Two voices share one band — the person you called swells above the centre,
 * you below it — which answers "who is talking" at a glance, and gives an audio
 * call something to look at besides a timer.
 *
 * Nothing here touches React. It runs at the display's refresh rate, and a
 * component re-rendering that often would spend longer reconciling than
 * drawing.
 */
import { audioContextClass } from './audio-level';

/** Points along the crest. Enough to read as a curve, few enough to stay smooth. */
const POINTS = 64;

/**
 * Eases both ends of the crest back down to the centre line.
 *
 * Without it the curve meets the left and right edges at whatever height it
 * happens to be, and the shape reads as a box with a wobbly lid rather than
 * as a wave.
 */
const EDGE_TAPER = Array.from({ length: POINTS }, (_, index) =>
  Math.pow(Math.sin((Math.PI * (index + 0.5)) / POINTS), 0.8),
);

/**
 * The slice of the spectrum worth drawing.
 *
 * Speech lives between roughly 80Hz and 5kHz. Spanning the analyser's whole
 * range instead would spend most of the width on frequencies no voice reaches,
 * leaving the crest bunched against the left edge.
 */
const MIN_HZ = 80;
const MAX_HZ = 5000;

/** Rises at once, falls gently: a slow fall reads as weight rather than noise. */
const FALL = 0.85;

/** Never flat. A dead band looks like a broken feature rather than a quiet room. */
const IDLE = 0.05;

/**
 * Clear space either side of the centre line.
 *
 * Without it the two crests meet and read as one lens, and when both people
 * talk at once you cannot tell whose half is whose.
 */
const SPLIT = 3;

/**
 * How hard the band is driven, and how gently it gives up near the top.
 *
 * A plain multiply-and-clamp pins every loud moment to the ceiling, and a
 * shouted word then looks exactly like a spoken one — the whole band becomes a
 * slab. Approaching the limit asymptotically keeps the loud end expressive.
 */
const GAIN = 1.9;
const KNEE = 1.15;

export interface VisualiserVoice {
  stream: MediaStream;
  /** Which way this voice swells from the centre line. */
  direction: 'up' | 'down';
  /** A CSS custom property name, resolved against the canvas so themes apply. */
  colourVar: string;
}

export interface Visualiser {
  stop(): void;
}

interface Lane {
  analyser: AnalyserNode;
  source: MediaStreamAudioSourceNode;
  bins: Uint8Array<ArrayBuffer>;
  /** Smoothed height at each point along the crest. */
  points: Float32Array;
  direction: 'up' | 'down';
  colourVar: string;
  colour: string;
  fill: CanvasGradient | null;
}

/**
 * Start drawing. Returns null when this browser has no Web Audio at all.
 *
 * A remote WebRTC stream only feeds Web Audio in Chrome when that same stream
 * is also attached to a media element somewhere — a long-standing quirk. The
 * call provider already plays the peer through its own hidden `<audio>`, so
 * that holds here; without it the peer's half would sit flat and silent, with
 * no error to explain why.
 */
export function createVisualiser(
  canvas: HTMLCanvasElement,
  voices: readonly VisualiserVoice[],
): Visualiser | null {
  const Context = audioContextClass();
  const ctx = canvas.getContext('2d');
  if (!Context || !ctx) return null;

  const audio = new Context();
  void audio.resume().catch(() => undefined);

  const lanes: Lane[] = [];
  for (const voice of voices) {
    if (voice.stream.getAudioTracks().length === 0) continue;

    const analyser = audio.createAnalyser();
    analyser.fftSize = 2048;
    // The analyser's own smoothing removes the frame-to-frame jitter; the
    // fall-off below then shapes the motion rather than fighting noise.
    analyser.smoothingTimeConstant = 0.55;
    const source = audio.createMediaStreamSource(voice.stream);
    source.connect(analyser);
    // Never connected to the destination: this only measures. Routing a
    // microphone to the speakers is how you get a feedback howl.

    lanes.push({
      analyser,
      source,
      bins: new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount)),
      points: new Float32Array(POINTS),
      direction: voice.direction,
      colourVar: voice.colourVar,
      colour: '#6d28d9',
      fill: null,
    });
  }

  let width = 0;
  let height = 0;
  let dpr = 1;
  /** Bin index at each point along the crest, spaced the way hearing is. */
  let edges: number[] = [];

  /**
   * Mix a resolved colour towards transparent.
   *
   * `color-mix` keeps this in whatever colour space the palette is written in,
   * rather than forcing a conversion to rgb here. Canvas rejects a colour it
   * cannot parse by throwing, so the plain colour stands in if it does.
   */
  const fade = (colour: string, percent: number): string =>
    `color-mix(in oklab, ${colour} ${percent}%, transparent)`;

  const measure = (): void => {
    const rect = canvas.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = Math.max(1, Math.round(rect.width * dpr));
    height = Math.max(1, Math.round(rect.height * dpr));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }

    const nyquist = audio.sampleRate / 2;
    const binCount = lanes[0]?.bins.length ?? 1024;
    edges = Array.from({ length: POINTS + 1 }, (_, index) => {
      const hz = MIN_HZ * Math.pow(MAX_HZ / MIN_HZ, index / POINTS);
      return Math.min(binCount - 1, Math.max(0, Math.round((hz / nyquist) * binCount)));
    });

    const middle = height / 2;
    const styles = getComputedStyle(canvas);

    for (const lane of lanes) {
      const resolved = styles.getPropertyValue(lane.colourVar).trim();
      lane.colour = resolved === '' ? '#6d28d9' : resolved;

      // Brightest along the centre line, fading out towards the crest, so the
      // body glows rather than sitting there as a flat slab of colour.
      const base = middle + (lane.direction === 'up' ? -SPLIT : SPLIT) * dpr;
      const gradient =
        lane.direction === 'up'
          ? ctx.createLinearGradient(0, base, 0, 0)
          : ctx.createLinearGradient(0, base, 0, height);
      try {
        gradient.addColorStop(0, fade(lane.colour, 92));
        gradient.addColorStop(0.55, fade(lane.colour, 55));
        gradient.addColorStop(1, fade(lane.colour, 8));
      } catch {
        gradient.addColorStop(0, lane.colour);
        gradient.addColorStop(1, lane.colour);
      }
      lane.fill = gradient;
    }
  };
  measure();

  const resizeObserver = new ResizeObserver(measure);
  resizeObserver.observe(canvas);

  // A theme change swaps every custom property under the canvas, so the
  // colours and gradients have to be read again.
  const themeObserver = new MutationObserver(measure);
  themeObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['class', 'data-theme', 'style'],
  });

  let frame: number | null = null;
  let stopped = false;
  let phase = 0;

  /**
   * Trace the crest of one lane as a smooth curve.
   *
   * The control points sit on the smoothed points and the curve passes through
   * their midpoints, which rounds the corners off without the overshoot a
   * spline would add — a waveform that dips below its own trough looks wrong.
   */
  const crest = (lane: Lane, middle: number, reach: number): void => {
    const step = width / (POINTS - 1);
    const sign = lane.direction === 'up' ? -1 : 1;
    const base = middle + sign * SPLIT * dpr;
    const at = (index: number): number => {
      const amplitude = Math.max(
        IDLE * (1 + 0.45 * Math.sin(phase + index * 0.3)),
        lane.points[index] ?? 0,
      );
      return base + sign * amplitude * reach;
    };

    ctx.beginPath();
    ctx.moveTo(0, base);
    ctx.lineTo(0, at(0));
    for (let index = 0; index < POINTS - 1; index += 1) {
      const x = index * step;
      const nextX = (index + 1) * step;
      ctx.quadraticCurveTo(x, at(index), (x + nextX) / 2, (at(index) + at(index + 1)) / 2);
    }
    ctx.lineTo(width, at(POINTS - 1));
    ctx.lineTo(width, base);
  };

  const draw = (): void => {
    if (stopped) return;
    frame = requestAnimationFrame(draw);

    ctx.clearRect(0, 0, width, height);
    const middle = height / 2;
    const reach = middle - (SPLIT + 2) * dpr;
    phase += 0.045;

    for (const lane of lanes) {
      lane.analyser.getByteFrequencyData(lane.bins);

      for (let index = 0; index < POINTS; index += 1) {
        const start = edges[index] ?? 0;
        const end = Math.max(start + 1, edges[index + 1] ?? start + 1);

        // The band's average, not its loudest bin. Taking the maximum sounds
        // more responsive but fills every band to the brim, and the crest
        // flattens into a slab with no contour left to read.
        let total = 0;
        for (let bin = start; bin < end; bin += 1) total += lane.bins[bin] ?? 0;
        const peak = total / (end - start);

        // Tilt the top end up. A voice carries far less energy at 4kHz than at
        // 200Hz, so without this the right-hand side never lifts off the line.
        const tilt = 1 + (index / POINTS) * 0.9;
        const driven = (peak / 255) * tilt * GAIN;
        const target = (1 - Math.exp(-driven * KNEE)) * EDGE_TAPER[index]!;

        const previous = lane.points[index] ?? 0;
        lane.points[index] = target > previous ? target : previous * FALL;
      }

      crest(lane, middle, reach);
      ctx.closePath();
      ctx.fillStyle = lane.fill ?? lane.colour;
      ctx.fill();

      // A bright edge along the crest, which is what stops the shape reading
      // as a smudge once the fill has faded out.
      crest(lane, middle, reach);
      ctx.strokeStyle = lane.colour;
      ctx.lineWidth = 1.5 * dpr;
      ctx.lineJoin = 'round';
      ctx.stroke();
    }
  };
  frame = requestAnimationFrame(draw);

  return {
    stop(): void {
      stopped = true;
      if (frame !== null) cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      themeObserver.disconnect();
      for (const lane of lanes) {
        lane.source.disconnect();
        lane.analyser.disconnect();
      }
      void audio.close().catch(() => undefined);
    },
  };
}
