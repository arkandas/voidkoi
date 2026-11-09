import { redirect } from 'next/navigation';

import { requireAppPage } from '@/lib/app-access';
import { firstPartHref } from '@/modules/tasks/lib/routes';

/** Tasks opens at the first of its parts the account uses: boards, the to-do list or sticky notes. */
export default async function TasksPage() {
  const user = await requireAppPage('tasks');
  // Settings, where the parts are chosen, for an account that has left them all out.
  redirect(firstPartHref(user.apps) ?? '/settings');
}
