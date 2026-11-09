import type { TreeNodeDto } from '@/modules/wiki/lib/api-types';

/** The flat tree the server sends, as folders with what is in them. Kept free of React so it can be tested. */

export interface TreeItem extends TreeNodeDto {
  children: TreeItem[];
  depth: number;
}

export function nest(nodes: TreeNodeDto[]): TreeItem[] {
  const items = new Map<number, TreeItem>();
  for (const node of nodes) items.set(node.id, { ...node, children: [], depth: 0 });
  const roots: TreeItem[] = [];
  // The server sends them in reading order, folders before what they hold.
  for (const node of nodes) {
    const item = items.get(node.id)!;
    const parent = node.parentId === null ? null : items.get(node.parentId);
    if (parent) {
      item.depth = parent.depth + 1;
      parent.children.push(item);
    } else roots.push(item);
  }
  return roots;
}

/** The folders above a node, from the top, by their ids. */
export function ancestorIds(nodes: TreeNodeDto[], id: number): number[] {
  const byId = new Map(nodes.map(node => [node.id, node]));
  const ids: number[] = [];
  for (let at = byId.get(id)?.parentId ?? null; at !== null; at = byId.get(at)?.parentId ?? null) {
    if (ids.includes(at)) break;
    ids.unshift(at);
  }
  return ids;
}

/** An address without the wiki's base and the slashes at either end: `/wiki/a/b` is `a/b`. Null outside it. */
export function pathUnder(pathname: string, base: string): string | null {
  if (pathname !== base && !pathname.startsWith(`${base}/`)) return null;
  let rest = pathname.slice(base.length);
  try {
    rest = decodeURIComponent(rest);
  } catch {}
  return rest.replace(/^\/+|\/+$/g, '');
}

/** The node whose address is `pathname`, if any. */
export function nodeAt(nodes: TreeNodeDto[], pathname: string): TreeNodeDto | null {
  const path = decodeURIComponent(pathname).replace(/^\/+|\/+$/g, '');
  return nodes.find(node => node.path === path) ?? null;
}

/** Whether `inner` is `outer` or anywhere inside it. */
export function isInside(nodes: TreeNodeDto[], inner: number, outer: number): boolean {
  return inner === outer || ancestorIds(nodes, inner).includes(outer);
}

/** Every folder, each with its full title path ("Homelab / Network"), for picking where something goes. */
export function folderChoices(nodes: TreeNodeDto[]): Array<{ id: number; label: string; depth: number }> {
  const byId = new Map(nodes.map(node => [node.id, node]));
  return nodes
    .filter(node => node.kind === 'folder')
    .map(node => {
      const titles = [...ancestorIds(nodes, node.id).map(id => byId.get(id)?.title ?? ''), node.title];
      return { id: node.id, label: titles.join(' / '), depth: titles.length - 1 };
    });
}

export type DropPlace = 'before' | 'after' | 'inside';

/**
 * Where a dragged node lands: its new folder and its place among what is
 * there, leaving itself out of the count.
 */
export function dropTarget(
  nodes: TreeNodeDto[],
  dragged: number,
  over: number,
  place: DropPlace,
): { parentId: number | null; position: number } | null {
  const target = nodes.find(node => node.id === over);
  if (!target || dragged === over) return null;
  if (place === 'inside') {
    if (target.kind !== 'folder' || isInside(nodes, over, dragged)) return null;
    const count = nodes.filter(node => node.parentId === over && node.id !== dragged).length;
    return { parentId: over, position: count };
  }
  if (target.parentId !== null && isInside(nodes, target.parentId, dragged)) return null;
  const siblings = nodes.filter(node => node.parentId === target.parentId && node.id !== dragged);
  const at = siblings.findIndex(node => node.id === over);
  return { parentId: target.parentId, position: place === 'before' ? at : at + 1 };
}
