import type { ReactNode } from 'react';

import { filesSection } from '@/modules/files/lib/page-title';

export const generateMetadata = () => filesSection('trash');

export default function TrashLayout({ children }: { children: ReactNode }) {
  return children;
}
