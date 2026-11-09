'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

import { cn } from '@/lib/cn';

export interface Section {
  href: string;
  label: string;
  icon: ReactNode;
}

/** A page's own sections: down the side on a wide screen, across the top on a phone. */
export function SectionNav({ label, sections }: { label: string; sections: Section[] }) {
  const pathname = usePathname();
  return (
    <nav aria-label={label} className="scrollbar-hidden -mx-3 overflow-x-auto px-3 sm:-mx-4 sm:px-4 lg:mx-0 lg:w-52 lg:shrink-0 lg:overflow-visible lg:px-0">
      <ul className="flex gap-1.5 lg:flex-col lg:gap-1">
        {sections.map(section => {
          const current = pathname === section.href;
          return (
            <li key={section.href} className="shrink-0">
              <Link
                href={section.href}
                aria-current={current ? 'page' : undefined}
                className={cn(
                  'flex h-10 items-center gap-2.5 rounded-lg px-3 text-[15px] whitespace-nowrap transition-colors',
                  'focus:outline-hidden focus-visible:ring-4 focus-visible:ring-accent/25',
                  current
                    ? 'bg-card font-semibold text-ink shadow-xs ring-1 ring-line'
                    : 'font-medium text-ink-muted hover:bg-card/60 hover:text-ink',
                )}
              >
                {section.icon}
                {section.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
