import { requireAppPage } from '@/lib/app-access';
import { appMetadata } from '@/lib/page-title';
import { TalkShell } from '@/modules/talk/components/layout/talk-shell';

export const generateMetadata = () => appMetadata('talk');

export default async function TalkLayout({ children }: { children: React.ReactNode }) {
  await requireAppPage('talk');
  return (
    <div data-app="talk" className="flex min-w-0 flex-1">
      <TalkShell>{children}</TalkShell>
    </div>
  );
}
