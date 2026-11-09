import type { DragEvent } from 'react';

/** The drag type for moving items inside the app, so a drop from the desktop is never mistaken for it. */
export const DRAG_TYPE = 'application/x-files-items';

export function draggedIds(event: DragEvent): number[] | null {
  try {
    const ids = JSON.parse(event.dataTransfer.getData(DRAG_TYPE));
    return Array.isArray(ids) && ids.every(id => Number.isInteger(id)) ? ids : null;
  } catch {
    return null;
  }
}

export function carriesItems(event: DragEvent): boolean {
  return Array.from(event.dataTransfer.types).includes(DRAG_TYPE);
}
