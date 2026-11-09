// The suite's service worker. It caches nothing: every request goes to the
// network untouched, except files shared from another app.
//
// Files: takes files shared from another app (the share sheet on Android) and
// keeps them for the page, which uploads them.
//
// Talk: shows the notifications the server sends while Talk is closed, and
// opens the right place when one is tapped. The payload is PushPayload in
// src/modules/talk/lib/protocol.ts.

const DB = 'files-share-target';
const STORE = 'pending';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));

/* Files: the share target ------------------------------------------------ */

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'POST' || url.origin !== self.location.origin || url.pathname !== '/share-target') return;
  event.respondWith(receive(event.request));
});

async function receive(request) {
  try {
    const form = await request.formData();
    const files = form.getAll('files').filter(value => value instanceof File && value.size >= 0 && value.name);
    await keep(files);
    return Response.redirect('/files?shared=1', 303);
  } catch {
    return Response.redirect('/files?shared=failed', 303);
  }
}

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, { autoIncrement: true });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function keep(files) {
  const db = await openDb();
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      for (const file of files) tx.objectStore(STORE).add(file);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

/* Talk: notifications ----------------------------------------------------- */

self.addEventListener('push', event => {
  let payload = null;
  try {
    payload = event.data ? event.data.json() : null;
  } catch {
    // Unreadable. Still show something, below.
  }
  event.waitUntil(show(payload));
});

async function show(payload) {
  // Every push has to show a notification: Safari takes the permission away
  // from a site whose pushes arrive and show nothing.
  if (!payload || typeof payload.title !== 'string') {
    await self.registration.showNotification('Talk', {
      body: 'Something new is waiting for you.',
      tag: 'talk',
      icon: '/icon-192.png',
      data: { url: '/talk' },
    });
    return;
  }

  // The number on the Home Screen icon, where the platform has one.
  if (typeof payload.badge === 'number' && 'setAppBadge' in self.navigator) {
    try {
      if (payload.badge > 0) await self.navigator.setAppBadge(payload.badge);
      else await self.navigator.clearAppBadge();
    } catch {
      // Not allowed here; the notification matters more.
    }
  }

  const call = payload.kind === 'call';
  await self.registration.showNotification(payload.title, {
    body: payload.body,
    tag: payload.tag,
    // Buzz again when a newer message takes the place of an older one.
    renotify: true,
    icon: '/icon-192.png',
    timestamp: payload.timestamp,
    // A ringing call stays up until it is dealt with.
    requireInteraction: call,
    vibrate: call ? [500, 250, 500, 250, 500] : [120, 60, 120],
    data: { url: payload.url, kind: payload.kind },
  });
}

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const target = new URL(event.notification.data?.url ?? '/talk', self.location.origin).href;
  event.waitUntil(open(target));
});

async function open(url) {
  const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  // A window with Talk open moves without reloading, which would drop a call going on.
  const talk = windows.find(client => new URL(client.url).pathname.startsWith('/talk'));
  if (talk) {
    talk.postMessage({ type: 'open', url });
    try {
      await talk.focus();
    } catch {
      // Some platforms refuse; the message still moves it.
    }
    return;
  }
  // Any other window of the suite goes there.
  const suite = windows.find(client => new URL(client.url).origin === self.location.origin);
  if (suite && 'navigate' in suite) {
    try {
      await (await suite.navigate(url))?.focus();
      return;
    } catch {
      // Not allowed for this window; a new one below.
    }
  }
  await self.clients.openWindow(url);
}

self.addEventListener('pushsubscriptionchange', event => {
  // The browser replaced this device's subscription, which Firefox does now
  // and then. Hand the new one to the server on the session already here.
  event.waitUntil(
    (async () => {
      const subscription =
        event.newSubscription ?? (event.oldSubscription ? await self.registration.pushManager.subscribe(event.oldSubscription.options) : null);
      if (!subscription) return;
      await fetch('/api/talk/push/subscriptions', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(subscription.toJSON()),
      });
    })(),
  );
});
