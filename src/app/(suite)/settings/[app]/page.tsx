'use client';

import { notFound, useParams } from 'next/navigation';

import { useMe } from '@/components/me';
import { appInfo, isAppId, uses } from '@/modules/registry';
import { SETTINGS_PAGES } from '@/modules/settings-pages';

/** An app's page in Settings, in the app's own colour. */
export default function AppSettingsPage() {
  const { app } = useParams<{ app: string }>();
  const me = useMe();
  if (!isAppId(app) || !appInfo(app).settings || !uses(me.apps, app)) notFound();
  const Page = SETTINGS_PAGES[app];
  if (!Page) notFound();
  return (
    <div data-app={app} className="space-y-4">
      <Page />
    </div>
  );
}
