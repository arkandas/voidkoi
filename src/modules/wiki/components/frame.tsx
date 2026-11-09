import type { ReactNode } from 'react';

/** A page in the panel: its header across the top, and under it a column that scrolls by itself. */
export function WikiPage({ header, children }: { header: ReactNode; children: ReactNode }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {header}
      <div id="page-scroll" className="themed-scroll flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain">
        {children}
      </div>
    </div>
  );
}

/** What a page shows, at a width for reading, and beside it on a wide screen what it holds. Centred when nothing is beside it. */
export function Column({ aside, children }: { aside?: ReactNode; children: ReactNode }) {
  if (!aside) {
    return (
      <div className="w-full px-5 pt-6 pb-28 sm:px-8 sm:pt-8 lg:px-12">
        <div className="mx-auto max-w-[50rem]">{children}</div>
      </div>
    );
  }
  return (
    <div className="mx-auto flex w-full max-w-[78rem] gap-12 px-5 pt-6 pb-28 sm:px-8 sm:pt-8 lg:px-12">
      <div className="min-w-0 flex-1">
        {/* Centred too until the sections fit beside it. */}
        <div className="mx-auto max-w-[50rem] xl:mx-0">{children}</div>
      </div>
      <aside className="hidden w-56 shrink-0 xl:block">{aside}</aside>
    </div>
  );
}
