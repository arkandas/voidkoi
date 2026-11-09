'use client';

import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';

import { AppIcon } from '@/components/brand/mark';
import { AppAside, AppBrand, AppPanel } from '@/components/layout/app-nav';
import { ToolList } from '@/modules/utilikit/components/tool-list';
import { ToolQueryProvider } from '@/modules/utilikit/components/tool-query';
import { HOME } from '@/modules/utilikit/lib/tools';

/** Utilikit inside the suite: in a tool, the tool list down the side on a wide screen. The home has none. */
export function UtilikitShell({ children }: { children: ReactNode }) {
  const t = useTranslations('utilikit.app');
  const home = usePathname() === HOME;

  return (
    <ToolQueryProvider>
      {home ? null : (
        <AppAside>
          <AppBrand href={HOME} mark={<AppIcon app="utilikit" size={28} className="rounded-lg" />} name={t('name')} />
          <div className="flex min-h-0 flex-1 flex-col">
            <ToolList />
          </div>
        </AppAside>
      )}
      <AppPanel>{children}</AppPanel>
    </ToolQueryProvider>
  );
}
