/**
 * The parts of notifications that are decisions rather than browser calls,
 * kept apart so they can be tested without a browser.
 */

/**
 * Whether this device can get notifications from here, and if not, why not.
 *
 * - `insecure`: notifications need HTTPS (or localhost), full stop.
 * - `needs-install`: an iPhone or iPad only lets an app it has on the Home
 *   Screen ask; Safari in a tab cannot.
 * - `unsupported`: the browser has no way to do it.
 */
export type PushSupport = 'supported' | 'insecure' | 'needs-install' | 'unsupported';

export interface PushEnvironment {
  secure: boolean;
  serviceWorker: boolean;
  pushManager: boolean;
  notification: boolean;
  /** iPhone, iPad, or an iPad that says it is a Mac. */
  ios: boolean;
  /** Launched from the Home Screen rather than from a browser tab. */
  standalone: boolean;
}

export function pushSupport(environment: PushEnvironment): PushSupport {
  if (!environment.secure) return 'insecure';
  // Checked before the APIs: in a Safari tab they are simply missing, and
  // "unsupported" would send somebody away who is one step from working.
  if (environment.ios && !environment.standalone) return 'needs-install';
  if (!environment.serviceWorker || !environment.pushManager || !environment.notification) {
    return 'unsupported';
  }
  return 'supported';
}

export function detectPushEnvironment(): PushEnvironment {
  const nav = navigator as Navigator & { standalone?: boolean };
  return {
    secure: window.isSecureContext,
    serviceWorker: 'serviceWorker' in navigator,
    pushManager: 'PushManager' in window,
    notification: 'Notification' in window,
    ios:
      /iPad|iPhone|iPod/.test(nav.userAgent) ||
      (nav.platform === 'MacIntel' && nav.maxTouchPoints > 1),
    standalone: window.matchMedia('(display-mode: standalone)').matches || nav.standalone === true,
  };
}

/**
 * Where a tapped notification takes a page that is already open: the path of
 * the URL the service worker names, with its query, when it is on this site.
 * Null for anywhere else.
 */
export function notificationPath(url: string, origin: string): string | null {
  let target: URL;
  try {
    target = new URL(url, origin);
  } catch {
    return null;
  }
  return target.origin === origin ? `${target.pathname}${target.search}${target.hash}` : null;
}

/** base64url, as the server sends its key, to the bytes `subscribe` wants. */
export function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
  const binary = atob(base64);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

/**
 * Whether an existing subscription was made with this server's key. After
 * the key changes, the old subscription can never be delivered to again and
 * has to be replaced.
 */
export function sameKey(subscriptionKey: ArrayBuffer | null | undefined, serverKey: Uint8Array): boolean {
  if (!subscriptionKey) return false;
  const existing = new Uint8Array(subscriptionKey);
  return existing.length === serverKey.length && existing.every((byte, index) => byte === serverKey[index]);
}
