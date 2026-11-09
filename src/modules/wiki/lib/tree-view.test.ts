import { describe, expect, it } from 'vitest';
import type { TreeNodeDto } from '@/modules/wiki/lib/api-types';
import { ancestorIds, dropTarget, folderChoices, nest, nodeAt, pathUnder } from '@/modules/wiki/lib/tree-view';

function row(id: number, kind: 'page' | 'folder', parentId: number | null, title: string, path: string): TreeNodeDto {
  return { id, kind, parentId, title, path, locked: false, draft: false, unpublished: false, visibility: 'inherit', effective: 'private' };
}

// a/ (1) holding b (2) and c/ (3) holding d (4); then e (5) at the top.
const nodes = [
  row(1, 'folder', null, 'A', 'a'),
  row(2, 'page', 1, 'B', 'a/b'),
  row(3, 'folder', 1, 'C', 'a/c'),
  row(4, 'page', 3, 'D', 'a/c/d'),
  row(5, 'page', null, 'E', 'e'),
];

describe('nest', () => {
  it('puts each node inside its folder, with its depth', () => {
    const roots = nest(nodes);
    expect(roots.map(item => item.id)).toEqual([1, 5]);
    expect(roots[0]!.children.map(item => item.id)).toEqual([2, 3]);
    expect(roots[0]!.children[1]!.children[0]!.depth).toBe(2);
  });
});

describe('ancestorIds and nodeAt', () => {
  it('finds the folders above a node and the node at an address', () => {
    expect(ancestorIds(nodes, 4)).toEqual([1, 3]);
    expect(nodeAt(nodes, '/a/c/d')?.id).toBe(4);
    expect(nodeAt(nodes, '/a/c/d/')?.id).toBe(4);
    expect(nodeAt(nodes, '/nope')).toBeNull();
  });
});

describe('pathUnder', () => {
  it('reads an address under the wiki base, and nothing outside it', () => {
    expect(pathUnder('/wiki/a/c/d/', '/wiki')).toBe('a/c/d');
    expect(pathUnder('/wiki', '/wiki')).toBe('');
    expect(pathUnder('/w/a', '/w')).toBe('a');
    expect(pathUnder('/wikis/a', '/wiki')).toBeNull();
    expect(pathUnder('/w/a', '/wiki')).toBeNull();
  });
});

describe('dropTarget', () => {
  it('drops before or after a node, among its siblings without the dragged one', () => {
    expect(dropTarget(nodes, 5, 2, 'before')).toEqual({ parentId: 1, position: 0 });
    expect(dropTarget(nodes, 5, 2, 'after')).toEqual({ parentId: 1, position: 1 });
    expect(dropTarget(nodes, 2, 3, 'after')).toEqual({ parentId: 1, position: 1 });
  });

  it('drops into a folder at its end', () => {
    expect(dropTarget(nodes, 5, 3, 'inside')).toEqual({ parentId: 3, position: 1 });
  });

  it('never puts a folder inside itself', () => {
    expect(dropTarget(nodes, 1, 3, 'inside')).toBeNull();
    expect(dropTarget(nodes, 1, 4, 'before')).toBeNull();
    expect(dropTarget(nodes, 1, 1, 'inside')).toBeNull();
  });

  it('refuses inside a page', () => {
    expect(dropTarget(nodes, 5, 2, 'inside')).toBeNull();
  });
});

describe('folderChoices', () => {
  it('names each folder with the folders above it', () => {
    expect(folderChoices(nodes)).toEqual([
      { id: 1, label: 'A', depth: 0 },
      { id: 3, label: 'A / C', depth: 1 },
    ]);
  });
});
