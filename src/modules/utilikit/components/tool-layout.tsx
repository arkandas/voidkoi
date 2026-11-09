'use client';

import { LayoutGrid, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { usePathname } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';

import { PageHeader, PageLayout } from '@/components/layout/page-layout';
import { IconButton } from '@/components/ui';
import { cn } from '@/lib/cn';
import { ToolList } from '@/modules/utilikit/components/tool-list';
import { findTool } from '@/modules/utilikit/lib/tools';

/** On a phone, where there is no sidebar: the tool list, sliding in from the side. */
function ToolDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useTranslations('utilikit.nav');

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  return (
    <div className={cn('fixed inset-0 z-40 lg:hidden', !open && 'pointer-events-none')}>
      <div
        aria-hidden="true"
        onClick={onClose}
        className={cn('absolute inset-0 bg-scrim transition-opacity duration-300', open ? 'opacity-100' : 'opacity-0')}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t('tools')}
        className={cn(
          'absolute inset-y-0 left-0 flex w-[84%] max-w-80 flex-col bg-surface shadow-2xl transition-[transform,visibility] duration-300 ease-out',
          open ? 'visible translate-x-0' : 'invisible -translate-x-full',
        )}
      >
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-line pr-2 pl-4">
          <span className="text-base font-bold tracking-tight text-ink">{t('tools')}</span>
          <IconButton label={t('closeMenu')} icon={<X size={18} />} onClick={onClose} />
        </div>
        <div className="flex min-h-0 flex-1 flex-col px-3 pt-3 pb-safe">
          {open ? <ToolList onNavigate={onClose} /> : null}
        </div>
      </div>
    </div>
  );
}

/** A tool's page: its name and colour in the header, and the tool under it. */
export function ToolLayout({ children }: { children: ReactNode }) {
  const t = useTranslations('utilikit');
  const tool = findTool(usePathname());
  const [drawer, setDrawer] = useState(false);
  const Icon = tool?.icon;

  return (
    <PageLayout
      className="p-4 pb-16 sm:p-6 sm:pb-16"
      header={
        <PageHeader
          title={tool ? t(`tools.${tool.id}.name`) : t('app.name')}
          icon={
            tool && Icon ? (
              <span className={cn('tool-icon flex', tool.color)}>
                <Icon size={20} />
              </span>
            ) : undefined
          }
          action={
            <>
              <IconButton label={t('nav.openMenu')} icon={<LayoutGrid size={20} />} onClick={() => setDrawer(true)} className="lg:hidden" />
              <ToolDrawer open={drawer} onClose={() => setDrawer(false)} />
            </>
          }
        />
      }
    >
      <div className="@container mx-auto w-full max-w-6xl">{children}</div>
    </PageLayout>
  );
}
