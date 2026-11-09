'use client';

import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

import { CallModal } from '@/modules/talk/components/calls/call-modal';
import { CallPill } from '@/modules/talk/components/calls/call-pill';
import { CallProvider } from '@/modules/talk/lib/hooks/use-call';
import { RealtimeProvider } from '@/modules/talk/lib/hooks/use-realtime';
import { TalkDataProvider, useTalkData } from '@/modules/talk/lib/hooks/use-talk-data';
import { useServiceWorker } from '@/modules/talk/lib/service-worker';

/** Notifications, their taps, and the number on the Home Screen icon. */
function ServiceWorker(): null {
  useServiceWorker(useTalkData().totalUnread);
  return null;
}

/**
 * Talk around the whole suite, for an account that uses it: its socket, its
 * conversations and its calls. A call rings in any app and goes on while you
 * move between them; outside Talk its minimised pill floats over the app.
 */
export function TalkEverywhere({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const inTalk = pathname === '/talk' || pathname.startsWith('/talk/');
  return (
    <RealtimeProvider>
      <TalkDataProvider>
        <CallProvider>
          <ServiceWorker />
          <div className="relative flex min-w-0 flex-1 flex-col">
            {inTalk ? null : (
              <div data-app="talk" className="contents">
                <CallPill />
              </div>
            )}
            <div className="flex min-h-0 min-w-0 flex-1">{children}</div>
          </div>
          <div data-app="talk" className="contents">
            <CallModal />
          </div>
        </CallProvider>
      </TalkDataProvider>
    </RealtimeProvider>
  );
}
