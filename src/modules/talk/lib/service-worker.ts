'use client';

/**
 * The service worker, from the page's side: register it, follow a tapped
 * notification to where it points, and keep the tray and the number on the
 * Home Screen icon in step with what Talk shows. The worker is the suite's
 * one, public/sw.js, which Files' share target uses too.
 */
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

import { notificationPath } from './push';

const SERVICE_WORKER_URL = '/sw.js';

type BadgingNavigator = Navigator & {
  setAppBadge?(count: number): Promise<void>;
  clearAppBadge?(): Promise<void>;
};

function available(): boolean {
  return typeof navigator !== 'undefined' && 'serviceWorker' in navigator && window.isSecureContext;
}

/** The registration, made if this page hasn't made one yet, once its worker is active. Null where there can be none. */
export async function serviceWorkerRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (!available()) return null;
  await navigator.serviceWorker.register(SERVICE_WORKER_URL, { scope: '/' });
  return navigator.serviceWorker.ready;
}

/**
 * For signing out: the server forgets this device and the browser drops its
 * subscription, so the next person here doesn't get this account's
 * notifications. Never throws: signing out must not fail because of it.
 */
export async function forgetThisDevice(): Promise<void> {
  if (!available()) return;
  try {
    const registration = await navigator.serviceWorker.getRegistration();
    const subscription = await registration?.pushManager?.getSubscription();
    if (!subscription) return;
    await fetch('/api/talk/push/subscriptions', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint: subscription.endpoint }),
    }).catch(() => undefined);
    await subscription.unsubscribe();
  } catch {
    // Signing out goes on regardless.
  }
}

/** Everything Talk needs from the service worker while it is open. */
export function useServiceWorker(unread: number): void {
  const router = useRouter();

  useEffect(() => {
    if (!available()) return;
    void navigator.serviceWorker.register(SERVICE_WORKER_URL, { scope: '/' }).catch(() => undefined);

    // A tapped notification, with the page already open: move, don't reload.
    const onMessage = (event: MessageEvent): void => {
      const data = event.data as { type?: unknown; url?: unknown } | null;
      if (data?.type !== 'open' || typeof data.url !== 'string') return;
      const path = notificationPath(data.url, window.location.origin);
      if (path !== null) router.push(path);
    };
    navigator.serviceWorker.addEventListener('message', onMessage);

    // With Talk on screen, what the notifications said is in front of the person already.
    const clearTray = (): void => {
      if (document.visibilityState !== 'visible') return;
      void navigator.serviceWorker
        .getRegistration()
        .then(async registration => {
          for (const notification of (await registration?.getNotifications()) ?? []) notification.close();
        })
        .catch(() => undefined);
    };
    clearTray();
    document.addEventListener('visibilitychange', clearTray);

    return () => {
      navigator.serviceWorker.removeEventListener('message', onMessage);
      document.removeEventListener('visibilitychange', clearTray);
    };
  }, [router]);

  // The number on the Home Screen icon is the unread count, where there is one.
  useEffect(() => {
    const badging = navigator as BadgingNavigator;
    if (!badging.setAppBadge) return;
    const update = unread > 0 ? badging.setAppBadge(unread) : badging.clearAppBadge?.();
    void update?.catch(() => undefined);
  }, [unread]);
}
