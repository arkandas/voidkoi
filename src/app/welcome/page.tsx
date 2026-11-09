import { redirect } from 'next/navigation';

import { currentUser } from '@/lib/session';
import { allAppKeys } from '@/modules/registry';

import { Welcome } from './welcome';

/** The first sign-in: choosing apps. Every app starts selected. */
export default async function WelcomePage() {
  const user = await currentUser();
  if (!user) redirect('/login');
  if (user.apps_chosen_at) redirect('/');
  return <Welcome initial={allAppKeys()} />;
}
