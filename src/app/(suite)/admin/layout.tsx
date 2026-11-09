import type { ReactNode } from 'react';

import { suiteMetadata } from '@/lib/page-title';

import { AdminFrame } from './admin-frame';

export const generateMetadata = () => suiteMetadata('admin');

export default function AdminLayout({ children }: { children: ReactNode }) {
  return <AdminFrame>{children}</AdminFrame>;
}
