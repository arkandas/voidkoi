import { requireAppPage } from '@/lib/app-access';

/** The text tools, for accounts that use them. */
export default async function Layout({ children }: { children: React.ReactNode }) {
  await requireAppPage('utilikit', 'text');
  return children;
}
