import type { ReactNode } from 'react';

import { filesSection } from '@/modules/files/lib/page-title';

export const generateMetadata = () => filesSection('shared');

export default function SharedLayout({ children }: { children: ReactNode }) {
  return children;
}
