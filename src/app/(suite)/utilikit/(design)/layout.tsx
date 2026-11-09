import { requireAppPage } from '@/lib/app-access';

/** The design tools, for accounts that use them. */
export default async function Layout({ children }: { children: React.ReactNode }) {
  await requireAppPage('utilikit', 'design');
  return children;
}
