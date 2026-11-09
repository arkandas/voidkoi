'use client';

import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';

import { ApiError } from '@/lib/error-codes';
import { useApiError } from '@/lib/use-api-error';

import { api } from '../api';
import type { PushSubscriptionRequest } from '../protocol';
import { base64UrlToBytes, detectPushEnvironment, pushSupport, sameKey } from '../push';
import { serviceWorkerRegistration } from '../service-worker';

/**
 * Notifications on this device.
 *
 * `on` means both halves agree: the browser holds a subscription and the
 * server has it for the person signed in. A browser subscription the server
 * does not know — somebody else's, say — reads as `off`.
 */
export type PushStatus =
  | 'loading'
  | 'insecure'
  | 'needs-install'
  | 'unsupported'
  | 'denied'
  | 'off'
  | 'on';

export interface PushController {
  status: PushStatus;
  busy: boolean;
  enable(): Promise<void>;
  disable(): Promise<void>;
  /** Ask the server to send this device a notification right now. */
  test(): Promise<void>;
}

/**
 * Chrome in a private window never settles a subscribe call — on purpose, so
 * that sites cannot tell a private window apart — and a browser that cannot
 * reach its push service can take a long time to give up. Without a limit
 * the button would say "Turning on…" for ever.
 */
const SUBSCRIBE_TIMEOUT_MS = 45_000;

class TimedOut extends Error {}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => setTimeout(() => reject(new TimedOut()), ms)),
  ]);
}

async function currentSubscription(): Promise<PushSubscription | null> {
  const registration = await serviceWorkerRegistration();
  return (await registration?.pushManager.getSubscription()) ?? null;
}

export function usePush(options: { onError(message: string): void; onTested(): void }): PushController {
  const { onError, onTested } = options;
  const t = useTranslations('talk.settings.notifications.errors');
  const apiError = useApiError();
  const [status, setStatus] = useState<PushStatus>('loading');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const support = pushSupport(detectPushEnvironment());
      if (support !== 'supported') {
        if (!cancelled) setStatus(support);
        return;
      }
      if (Notification.permission === 'denied') {
        if (!cancelled) setStatus('denied');
        return;
      }
      try {
        const [subscription, { endpoints }] = await Promise.all([currentSubscription(), api.pushSubscriptions()]);
        if (!cancelled) setStatus(subscription && endpoints.includes(subscription.endpoint) ? 'on' : 'off');
      } catch {
        if (!cancelled) setStatus('off');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const enable = useCallback(async () => {
    setBusy(true);
    try {
      // First, before anything else is awaited: Safari only asks while it is
      // still handling the tap.
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setStatus(permission === 'denied' ? 'denied' : 'off');
        return;
      }

      const registration = await serviceWorkerRegistration();
      if (!registration) {
        setStatus('unsupported');
        return;
      }
      const key = base64UrlToBytes((await api.pushKey()).publicKey);

      // A subscription made for a different key can never be delivered to.
      let subscription = await registration.pushManager.getSubscription();
      if (subscription && !sameKey(subscription.options.applicationServerKey, key)) {
        await subscription.unsubscribe();
        subscription = null;
      }
      subscription ??= await withTimeout(
        registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key }),
        SUBSCRIBE_TIMEOUT_MS,
      );

      await api.addPushSubscription(subscription.toJSON() as PushSubscriptionRequest);
      setStatus('on');
    } catch (error) {
      onError(error instanceof ApiError ? apiError(error, 'saveFailed') : error instanceof TimedOut ? t('timedOut') : t('enableFailed'));
    } finally {
      setBusy(false);
    }
  }, [onError, t, apiError]);

  const disable = useCallback(async () => {
    setBusy(true);
    try {
      const subscription = await currentSubscription();
      if (subscription) {
        await api.removePushSubscription(subscription.endpoint).catch(() => undefined);
        await subscription.unsubscribe();
      }
      setStatus('off');
    } catch {
      onError(t('disableFailed'));
    } finally {
      setBusy(false);
    }
  }, [onError, t]);

  const test = useCallback(async () => {
    setBusy(true);
    try {
      const subscription = await currentSubscription();
      if (!subscription) {
        setStatus('off');
        return;
      }
      await api.testPush(subscription.endpoint);
      onTested();
    } catch (error) {
      onError(error instanceof ApiError ? apiError(error, 'saveFailed') : t('testFailed'));
    } finally {
      setBusy(false);
    }
  }, [onError, onTested, t, apiError]);

  return { status, busy, enable, disable, test };
}
