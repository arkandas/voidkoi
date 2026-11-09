'use client';

import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, type DragEvent, type ReactNode, type RefObject } from 'react';

import { carriesItems, draggedIds } from './item-drag';

/** The open folder's view: which folder it shows, and how it moves items so its list and toasts stay right. */
interface Mover {
  folderId: number | null;
  move(ids: number[], parentId: number | null, name: string): void;
}

const MoverContext = createContext<RefObject<Mover | null> | null>(null);

/** Lets places outside the folder view, like My files in the sidebar, take items dragged from it. */
export function MoveProvider({ children }: { children: ReactNode }) {
  const mover = useRef<Mover | null>(null);
  return <MoverContext.Provider value={mover}>{children}</MoverContext.Provider>;
}

/** The folder view lends its move while it is open. Null when its items can't be moved. */
export function useLendMove(mover: Mover | null): void {
  const slotRef = useContext(MoverContext);
  const latest = useRef(mover);
  useLayoutEffect(() => {
    latest.current = mover;
  });
  useEffect(() => {
    if (!slotRef) return;
    const lent: Mover = {
      get folderId() {
        return latest.current?.folderId ?? null;
      },
      move: (...args) => latest.current?.move(...args),
    };
    slotRef.current = lent;
    return () => {
      if (slotRef.current === lent) slotRef.current = null;
    };
  }, [slotRef]);
}

/** A place that takes items dragged from the folder view into the folder `parentId`: its handlers, and whether items are over it. */
export function useItemDrop(parentId: number | null, name: string) {
  const slotRef = useContext(MoverContext);
  const [over, setOver] = useState(false);
  const takes = (event: DragEvent): boolean =>
    carriesItems(event) && latestMover(slotRef) !== null && latestMover(slotRef)!.folderId !== parentId;

  return {
    over,
    handlers: {
      onDragOver: (event: DragEvent) => {
        if (!takes(event)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
        setOver(true);
      },
      onDragLeave: () => setOver(false),
      onDrop: (event: DragEvent) => {
        setOver(false);
        if (!takes(event)) return;
        event.preventDefault();
        const ids = draggedIds(event);
        if (ids) latestMover(slotRef)!.move(ids, parentId, name);
      },
    },
  };
}

function latestMover(slotRef: RefObject<Mover | null> | null): Mover | null {
  return slotRef?.current ?? null;
}
