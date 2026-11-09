'use client';

import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { useMe } from '@/components/me';
import { uses } from '@/modules/registry';
import { CATEGORIES, filterTools, TOOLS, type Category, type Tool } from '@/modules/utilikit/lib/tools';

export interface NamedTool extends Tool {
  name: string;
  description: string;
}

/** The categories this account uses. */
export function useCategories(): Category[] {
  const { apps } = useMe();
  return useMemo(() => CATEGORIES.filter(category => uses(apps, 'utilikit', category)), [apps]);
}

/** The tools that match `query`, by category, leaving out the categories the account doesn't use. */
export function useToolGroups(query: string) {
  const t = useTranslations('utilikit.tools');
  const tApp = useTranslations('utilikit.app');
  const categories = useCategories();

  return useMemo(() => {
    const named: NamedTool[] = TOOLS.filter(tool => categories.includes(tool.category)).map(tool => ({
      ...tool,
      name: t(`${tool.id}.name`),
      description: t(`${tool.id}.description`),
    }));
    const matches = filterTools(named, query);

    return categories
      .map(category => ({
        category,
        label: tApp(category),
        tools: matches.filter(tool => tool.category === category),
      }))
      .filter(group => group.tools.length > 0);
  }, [query, t, tApp, categories]);
}
