import { toolMetadata } from '@/modules/utilikit/lib/tool-metadata';

export const generateMetadata = () => toolMetadata('password-generator');

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
