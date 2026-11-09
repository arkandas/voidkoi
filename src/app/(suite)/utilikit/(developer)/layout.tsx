import { requireAppPage } from '@/lib/app-access';

/** The developer tools, for accounts that use them. */
export default async function Layout({ children }: { children: React.ReactNode }) {
  await requireAppPage('utilikit', 'developer');
  return children;
}
