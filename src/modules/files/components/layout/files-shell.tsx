'use client';

import { Suspense, type ReactNode } from 'react';

import { AppPanel } from '@/components/layout/app-nav';
import { FilesStatusProvider } from '@/modules/files/components/files-status';
import { AudioPlayerProvider, MiniPlayer } from '@/modules/files/components/media/audio-player';
import { MoveProvider } from '@/modules/files/components/move-target';
import { AppDropOverlay } from '@/modules/files/components/upload/drop-overlay';
import { SharedIn } from '@/modules/files/components/upload/shared-in';
import { AppUploadPanel } from '@/modules/files/components/upload/upload-panel';
import { UploadProvider } from '@/modules/files/components/upload/upload-provider';

import { Sidebar } from './sidebar';
import { TabBar } from './tab-bar';

/** Files inside the suite: its places and storage, the open page, uploads and the music that plays on. */
export function FilesShell({ children }: { children: ReactNode }) {
  return (
    <FilesStatusProvider>
      <UploadProvider>
        <MoveProvider>
          <AudioPlayerProvider>
            <div data-app="files" className="flex min-w-0 flex-1">
              <Sidebar />
              <AppPanel
                below={
                  <>
                    <MiniPlayer className="border-t border-line bg-surface" />
                    <TabBar />
                  </>
                }
              >
                {children}
              </AppPanel>
              <AppUploadPanel />
              <AppDropOverlay />
              <Suspense fallback={null}>
                <SharedIn />
              </Suspense>
            </div>
          </AudioPlayerProvider>
        </MoveProvider>
      </UploadProvider>
    </FilesStatusProvider>
  );
}
