import { requireAppPage } from '@/lib/app-access';

/** The web tools, for accounts that use them. */
export default async function Layout({ children }: { children: React.ReactNode }) {
  await requireAppPage('utilikit', 'web');
  return children;
}
