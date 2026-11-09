import '@/modules/utilikit/utilikit.css';

import { requireAppPage } from '@/lib/app-access';
import { appMetadata } from '@/lib/page-title';
import { UtilikitShell } from '@/modules/utilikit/components/utilikit-shell';

export const generateMetadata = () => appMetadata('utilikit');

export default async function UtilikitLayout({ children }: { children: React.ReactNode }) {
  await requireAppPage('utilikit');
  return (
    <div data-app="utilikit" className="flex min-w-0 flex-1">
      <UtilikitShell>{children}</UtilikitShell>
    </div>
  );
}
