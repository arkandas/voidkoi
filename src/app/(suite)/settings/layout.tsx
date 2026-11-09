import type { ReactNode } from 'react';

import { suiteMetadata } from '@/lib/page-title';

import { SettingsFrame } from './settings-frame';

export const generateMetadata = () => suiteMetadata('settings');

export default function SettingsLayout({ children }: { children: ReactNode }) {
  return <SettingsFrame>{children}</SettingsFrame>;
}
