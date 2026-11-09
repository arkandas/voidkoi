import type { ReactNode } from 'react';

import { filesSection } from '@/modules/files/lib/page-title';

export const generateMetadata = () => filesSection('sharedWithMe');

export default function SharedWithMeLayout({ children }: { children: ReactNode }) {
  return children;
}
