import { toolMetadata } from '@/modules/utilikit/lib/tool-metadata';

export const generateMetadata = () => toolMetadata('cron-builder');

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
