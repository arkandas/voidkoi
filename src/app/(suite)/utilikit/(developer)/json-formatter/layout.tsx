import { toolMetadata } from '@/modules/utilikit/lib/tool-metadata';

export const generateMetadata = () => toolMetadata('json-formatter');

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
