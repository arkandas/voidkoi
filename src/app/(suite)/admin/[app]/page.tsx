'use client';

import { notFound, useParams } from 'next/navigation';

import { ADMIN_PAGES } from '@/modules/admin-pages';
import { appInfo, isAppId } from '@/modules/registry';

/** An app's page in Admin, in the app's own colour. */
export default function AppAdminPage() {
  const { app } = useParams<{ app: string }>();
  if (!isAppId(app) || !appInfo(app).admin) notFound();
  const Page = ADMIN_PAGES[app];
  if (!Page) notFound();
  return (
    <div data-app={app} className="space-y-4">
      <Page />
    </div>
  );
}
