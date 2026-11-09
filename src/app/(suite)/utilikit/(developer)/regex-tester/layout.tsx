import { toolMetadata } from '@/modules/utilikit/lib/tool-metadata';

export const generateMetadata = () => toolMetadata('regex-tester');

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
