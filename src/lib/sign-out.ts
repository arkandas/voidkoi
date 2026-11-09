import { signOut } from 'next-auth/react';
import { forgetThisDevice } from '@/modules/talk/lib/service-worker';

/**
 * Signs out of the suite and, under OIDC, out of the provider too, so the
 * next sign-in asks who you are.
 */
export async function signOutFully(): Promise<void> {
  // This browser stops getting the account's notifications.
  await forgetThisDevice();
  let destination = '/login?signedOut=1';
  try {
    const response = await fetch('/api/logout', { method: 'POST' });
    if (response.ok) destination = ((await response.json()) as { url?: string }).url ?? destination;
  } catch {
    // Signing out of Files still happens below.
  }
  await signOut({ redirect: false }).catch(() => {});
  window.location.href = destination;
}
