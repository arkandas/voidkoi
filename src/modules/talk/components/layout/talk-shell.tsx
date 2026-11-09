'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

import { AppPanel } from '@/components/layout/app-nav';
import { CallPill } from '@/modules/talk/components/calls/call-pill';

import { Sidebar } from './sidebar';
import { TabBar } from './tab-bar';

const HideTabBarContext = createContext<(hidden: boolean) => void>(() => undefined);

/** Hide the phone's tab bar while `hidden` holds: an open conversation wants the whole screen, and has its own way back. */
export function useHideTabBar(hidden: boolean): void {
  const setHidden = useContext(HideTabBarContext);
  useEffect(() => {
    setHidden(hidden);
    return () => setHidden(false);
  }, [hidden, setHidden]);
}

/**
 * The frame around each page of Talk: its places beside the panel on a wide
 * screen and under it on a phone. Its socket, data and calls are the suite's,
 * from TalkEverywhere, so a call goes on in other apps too.
 */
export function TalkShell({ children }: { children: ReactNode }) {
  const [tabBarHidden, setTabBarHidden] = useState(false);
  return (
    <HideTabBarContext.Provider value={setTabBarHidden}>
      <Sidebar />
      <AppPanel above={<CallPill />} below={tabBarHidden ? null : <TabBar />}>
        {children}
      </AppPanel>
    </HideTabBarContext.Provider>
  );
}
