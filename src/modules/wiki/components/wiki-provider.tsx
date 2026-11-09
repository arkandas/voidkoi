'use client';

import { useRouter } from 'next/navigation';
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

import type { TreeNodeDto } from '@/modules/wiki/lib/api-types';

export type DialogRequest =
  | { kind: 'create'; nodeKind: 'page' | 'folder'; parentId: number | null }
  | { kind: 'share'; id: number }
  | { kind: 'settings'; id: number }
  | { kind: 'delete'; id: number };

interface WikiState {
  /** Signed out: the wiki without the suite around it. */
  visitor: boolean;
  name: string;
  canEdit: boolean;
  tree: TreeNodeDto[];
  homePageId: number | null;
  dialog: DialogRequest | null;
  searchOpen: boolean;
  /** On a phone, where the tree is a drawer: whether it is out. */
  treeOpen: boolean;
  /** Ask the server again: the tree, the page, what this reader may see. */
  refresh(): void;
  openSearch(): void;
  closeSearch(): void;
  showTree(): void;
  hideTree(): void;
  open(dialog: DialogRequest): void;
  closeDialog(): void;
  /** Show the tree as it will be once a change the server is making lands. */
  setTree(tree: TreeNodeDto[]): void;
}

const WikiContext = createContext<WikiState | null>(null);

/** The tree this reader sees, what they may do, and the dialogs any part of the wiki can open. */
export function WikiProvider({
  visitor,
  name,
  canEdit,
  tree: serverTree,
  homePageId,
  children,
}: {
  visitor: boolean;
  name: string;
  canEdit: boolean;
  tree: TreeNodeDto[];
  homePageId: number | null;
  children: ReactNode;
}) {
  const router = useRouter();
  const [dialog, setDialog] = useState<DialogRequest | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [treeOpen, setTreeOpen] = useState(false);
  // A move shows at once; the server's tree takes over when it arrives.
  const [optimistic, setOptimistic] = useState<{ base: TreeNodeDto[]; tree: TreeNodeDto[] } | null>(null);
  const tree = optimistic && optimistic.base === serverTree ? optimistic.tree : serverTree;

  const refresh = useCallback(() => router.refresh(), [router]);
  const setTree = useCallback((next: TreeNodeDto[]) => setOptimistic({ base: serverTree, tree: next }), [serverTree]);

  const value = useMemo<WikiState>(
    () => ({
      visitor,
      name,
      canEdit,
      tree,
      homePageId,
      dialog,
      searchOpen,
      treeOpen,
      refresh,
      openSearch: () => {
        setTreeOpen(false);
        setSearchOpen(true);
      },
      closeSearch: () => setSearchOpen(false),
      showTree: () => setTreeOpen(true),
      hideTree: () => setTreeOpen(false),
      open: request => {
        setTreeOpen(false);
        setDialog(request);
      },
      closeDialog: () => setDialog(null),
      setTree,
    }),
    [visitor, name, canEdit, tree, homePageId, dialog, searchOpen, treeOpen, refresh, setTree],
  );

  return <WikiContext.Provider value={value}>{children}</WikiContext.Provider>;
}

export function useWiki(): WikiState {
  const context = useContext(WikiContext);
  if (!context) throw new Error('useWiki must be used inside a WikiProvider');
  return context;
}
