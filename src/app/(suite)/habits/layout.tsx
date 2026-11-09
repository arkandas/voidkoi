import '@/modules/habits/habits.css';

import { requireAppPage } from '@/lib/app-access';
import { appMetadata } from '@/lib/page-title';
import { HabitsShell } from '@/modules/habits/components/habits-shell';

export const generateMetadata = () => appMetadata('habits');

export default async function HabitsLayout({ children }: { children: React.ReactNode }) {
  await requireAppPage('habits');
  return (
    <div data-app="habits" className="flex min-w-0 flex-1">
      <HabitsShell>{children}</HabitsShell>
    </div>
  );
}
