import { toolMetadata } from '@/modules/utilikit/lib/tool-metadata';

export const generateMetadata = () => toolMetadata('og-parser');

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
