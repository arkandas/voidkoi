/**
 * A converted video fed to the browser piece by piece, through Media Source.
 * Safari plays a video from an address only when it can ask for any part of
 * it, which a stream being converted can't offer; fed this way it plays.
 */

type SourceClass = typeof MediaSource;

/** Seconds kept loaded ahead of what plays. Past that the reading waits, and so does the server. */
const AHEAD = 60;
/** Seconds kept behind what plays when the browser runs out of room. */
const BEHIND = 10;

function sourceClass(): SourceClass | null {
  if (typeof window === 'undefined') return null;
  const scope = window as unknown as { ManagedMediaSource?: SourceClass; MediaSource?: SourceClass };
  return scope.ManagedMediaSource ?? scope.MediaSource ?? null;
}

/** Whether this browser can be fed a stream of this type. */
export function canFeed(type: string | null | undefined): boolean {
  const Source = sourceClass();
  return !!type && !!Source && Source.isTypeSupported(type);
}

/** Safari, and apps built on it, need feeding from the start. */
export function feedsFirst(): boolean {
  return typeof navigator !== 'undefined' && /apple/i.test(navigator.vendor) && sourceClass() !== null;
}

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/** One change to the buffer, finished. */
function change(buffer: SourceBuffer, run: () => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const done = () => {
      buffer.removeEventListener('error', failed);
      resolve();
    };
    const failed = () => {
      buffer.removeEventListener('updateend', done);
      reject(new Error('The browser refused the stream.'));
    };
    buffer.addEventListener('updateend', done, { once: true });
    buffer.addEventListener('error', failed, { once: true });
    try {
      run();
    } catch (error) {
      buffer.removeEventListener('updateend', done);
      buffer.removeEventListener('error', failed);
      reject(error);
    }
  });
}

/**
 * Plays the stream at `url` in `video`. Resolves when it has all arrived;
 * rejects when it can't be played, unless `signal` stopped it.
 */
export function feed(video: HTMLVideoElement, url: string, type: string, signal: AbortSignal): Promise<void> {
  const Source = sourceClass();
  if (!Source) return Promise.reject(new Error('No Media Source here.'));
  const media = new Source();
  const address = URL.createObjectURL(media);
  // Managed Media Source plays only with this off, as AirPlay can't be fed.
  video.disableRemotePlayback = true;
  video.src = address;
  signal.addEventListener('abort', () => URL.revokeObjectURL(address), { once: true });

  return new Promise<void>((resolve, reject) => {
    media.addEventListener(
      'sourceopen',
      () => {
        URL.revokeObjectURL(address);
        fill(media, video, url, type, signal).then(resolve, reject);
      },
      { once: true },
    );
  });
}

async function fill(media: MediaSource, video: HTMLVideoElement, url: string, type: string, signal: AbortSignal): Promise<void> {
  const buffer = media.addSourceBuffer(type);
  const response = await fetch(url, { signal });
  if (!response.ok || !response.body) throw new Error(`The stream answered ${response.status}.`);
  const reader = response.body.getReader();
  const ahead = () => {
    const ranges = video.buffered;
    return ranges.length ? ranges.end(ranges.length - 1) - video.currentTime : 0;
  };

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      while (ahead() > AHEAD && !signal.aborted) await wait(1000);
      if (signal.aborted) return;
      for (;;) {
        try {
          await change(buffer, () => buffer.appendBuffer(value));
          break;
        } catch (error) {
          if (!(error instanceof DOMException && error.name === 'QuotaExceededError')) throw error;
          // Out of room: let go of what has been watched, or wait for some to be.
          const keep = video.currentTime - BEHIND;
          if (keep > 0 && video.buffered.length > 0 && video.buffered.start(0) < keep) {
            await change(buffer, () => buffer.remove(0, keep));
          } else {
            await wait(1000);
          }
          if (signal.aborted) return;
        }
      }
    }
    if (media.readyState === 'open' && !buffer.updating) media.endOfStream();
  } finally {
    void reader.cancel().catch(() => {});
  }
}
