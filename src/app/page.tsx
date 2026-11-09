import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { LAST_APP_COOKIE } from '@/components/shell/suite-shell';
import { requireSuitePage } from '@/lib/app-access';
import { appInfo, enabledApps, isAppId, uses } from '@/modules/registry';

/** Home: the app open last, or the first one the account uses. */
export default async function Home() {
  const user = await requireSuitePage();
  const last = (await cookies()).get(LAST_APP_COOKIE)?.value;
  if (isAppId(last) && uses(user.apps, last)) redirect(appInfo(last).href);
  const first = enabledApps(user.apps)[0];
  redirect(first ? first.href : '/settings');
}
