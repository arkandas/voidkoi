import { SuiteShell } from '@/components/shell/suite-shell';
import { requireSuitePage } from '@/lib/app-access';

export default async function SuiteLayout({ children }: { children: React.ReactNode }) {
  await requireSuitePage();
  return <SuiteShell>{children}</SuiteShell>;
}
