/**
 * Where the server is willing to send notifications.
 *
 * A subscription names a URL, and the server will POST to it. Taking any URL a
 * client hands over would let a signed-in user aim the server at the inside of
 * the network it runs in. So only the push services browsers actually use are
 * accepted, over HTTPS on the default port.
 */
const PUSH_SERVICES = [
  // Chrome, Edge on Android, and most other Chromium browsers.
  '.googleapis.com',
  // Safari, on iPhone, iPad and the Mac.
  '.push.apple.com',
  // Firefox.
  '.push.services.mozilla.com',
  // Edge on Windows.
  '.notify.windows.com',
];

const MAX_ENDPOINT_LENGTH = 2048;

export function isAllowedPushEndpoint(value: string): boolean {
  if (value.length > MAX_ENDPOINT_LENGTH) return false;

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }

  if (url.protocol !== 'https:' || url.port !== '' || url.username !== '' || url.password !== '') {
    return false;
  }
  const host = url.hostname.toLowerCase();
  return PUSH_SERVICES.some((suffix) => host.endsWith(suffix));
}
