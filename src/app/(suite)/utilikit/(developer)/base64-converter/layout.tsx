import { toolMetadata } from '@/modules/utilikit/lib/tool-metadata';

export const generateMetadata = () => toolMetadata('base64-converter');

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
