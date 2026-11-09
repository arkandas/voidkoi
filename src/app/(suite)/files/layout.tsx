import { requireAppPage } from '@/lib/app-access';
import { appMetadata } from '@/lib/page-title';
import { FilesShell } from '@/modules/files/components/layout/files-shell';

export const generateMetadata = () => appMetadata('files');

export default async function FilesLayout({ children }: { children: React.ReactNode }) {
  await requireAppPage('files');
  return <FilesShell>{children}</FilesShell>;
}
