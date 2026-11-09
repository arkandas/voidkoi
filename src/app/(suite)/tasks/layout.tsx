import '@/modules/tasks/tasks.css';

import { requireAppPage } from '@/lib/app-access';
import { appMetadata } from '@/lib/page-title';
import { TasksShell } from '@/modules/tasks/components/tasks-shell';

export const generateMetadata = () => appMetadata('tasks');

export default async function TasksLayout({ children }: { children: React.ReactNode }) {
  await requireAppPage('tasks');
  return (
    <div data-app="tasks" className="flex min-w-0 flex-1">
      <TasksShell>{children}</TasksShell>
    </div>
  );
}
