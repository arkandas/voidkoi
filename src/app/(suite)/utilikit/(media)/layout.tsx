import { requireAppPage } from '@/lib/app-access';

/** The media tools, for accounts that use them. */
export default async function Layout({ children }: { children: React.ReactNode }) {
  await requireAppPage('utilikit', 'media');
  return children;
}
