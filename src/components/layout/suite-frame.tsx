'use client';

import type { LucideIcon } from 'lucide-react';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

import { AppPanel, AppSidebar } from './app-nav';
import { IconTile, PageHeader, PageLayout } from './page-layout';
import { SectionNav, type Section } from './section-nav';

export interface SuiteSection extends Section {
  /** The section's mark in the page header, 40px. */
  mark: ReactNode;
}

/**
 * A page of the suite's own, like Settings, framed as the apps are: its
 * sections beside the panel on a wide screen and across the top of the page
 * elsewhere, and the open section's title over it.
 */
export function SuiteFrame({
  Icon,
  title,
  navLabel,
  sections,
  children,
}: {
  Icon: LucideIcon;
  title: string;
  navLabel: string;
  sections: SuiteSection[];
  children: ReactNode;
}) {
  const pathname = usePathname();
  const current = sections.find(section => section.href === pathname);

  return (
    <>
      <AppSidebar
        label={navLabel}
        items={sections.map(section => ({ href: section.href, label: section.label, icon: section.icon }))}
        isCurrent={(path, href) => path === href}
        home={sections[0]?.href ?? pathname}
        mark={
          <IconTile size={28}>
            <Icon size={17} />
          </IconTile>
        }
        name={title}
      />
      <AppPanel>
        <PageLayout header={<PageHeader mark={current?.mark} icon={current ? undefined : <Icon size={18} />} title={current?.label ?? title} />}>
          {sections.length > 1 ? (
            <div className="mb-4 lg:hidden">
              <SectionNav label={navLabel} sections={sections} />
            </div>
          ) : null}
          <div className="min-w-0 max-w-3xl space-y-4">{children}</div>
        </PageLayout>
      </AppPanel>
    </>
  );
}
