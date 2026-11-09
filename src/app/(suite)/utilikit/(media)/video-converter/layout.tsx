import { toolMetadata } from '@/modules/utilikit/lib/tool-metadata';

export const generateMetadata = () => toolMetadata('video-converter');

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
