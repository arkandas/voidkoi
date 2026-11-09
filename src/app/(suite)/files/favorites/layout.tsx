import type { ReactNode } from 'react';

import { filesSection } from '@/modules/files/lib/page-title';

export const generateMetadata = () => filesSection('favorites');

export default function FavoritesLayout({ children }: { children: ReactNode }) {
  return children;
}
