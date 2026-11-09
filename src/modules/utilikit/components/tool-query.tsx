'use client';

import { createContext, useContext, useState, type ReactNode } from 'react';

const ToolQueryContext = createContext<[string, (query: string) => void] | null>(null);

/** One search over the tools for all of Utilikit: the sidebar's list and the home page's cards both follow it. */
export function ToolQueryProvider({ children }: { children: ReactNode }) {
  const state = useState('');
  return <ToolQueryContext.Provider value={state}>{children}</ToolQueryContext.Provider>;
}

export function useToolQuery(): [string, (query: string) => void] {
  const context = useContext(ToolQueryContext);
  if (!context) throw new Error('useToolQuery must be used inside Utilikit');
  return context;
}
