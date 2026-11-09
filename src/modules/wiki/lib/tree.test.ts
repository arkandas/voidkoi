import { describe, expect, it } from 'vitest';
import { access, buildIndex, listed, neighbours, treeFor, type Lock, type NodeRecord, type Reader } from '@/modules/wiki/lib/tree';

let next = 1;
function node(partial: Partial<NodeRecord> & Pick<NodeRecord, 'kind' | 'title'>): NodeRecord {
  const id = partial.id ?? next++;
  return {
    id,
    parent_id: null,
    position: id,
    slug: partial.title.toLowerCase().replace(/\s+/g, '-'),
    visibility: 'INHERIT',
    password_hash: null,
    published_revision_id: partial.kind === 'PAGE' ? id * 100 : null,
    draft_updated_at: null,
    updated_at: new Date(0),
    ...partial,
  };
}

const PRIVATE_WIKI: Lock = { visibility: 'private', lockId: 0, hash: null };
const PUBLIC_WIKI: Lock = { visibility: 'public', lockId: 0, hash: null };

const visitor = (unlocked: number[] = []): Reader => ({ editor: false, signedIn: false, unlocked: lock => unlocked.includes(lock.lockId) });
const readerAccount: Reader = { editor: false, signedIn: true, unlocked: () => false };
const editor: Reader = { editor: true, signedIn: true, unlocked: () => false };

/*
 *  guides/ (inherit → private wiki)
 *    install (inherit)
 *    public-page (PUBLIC)
 *  lab/ (PUBLIC)
 *    network (inherit → public)
 *    secret (PRIVATE)
 *    vault/ (PASSWORD)
 *      keys (inherit → vault's password)
 *      draft (never published)
 */
function sample(root = PRIVATE_WIKI) {
  next = 1;
  const guides = node({ id: 1, kind: 'FOLDER', title: 'Guides' });
  const install = node({ id: 2, kind: 'PAGE', title: 'Install', parent_id: 1 });
  const open = node({ id: 3, kind: 'PAGE', title: 'Public page', parent_id: 1, visibility: 'PUBLIC' });
  const lab = node({ id: 4, kind: 'FOLDER', title: 'Lab', visibility: 'PUBLIC' });
  const network = node({ id: 5, kind: 'PAGE', title: 'Network', parent_id: 4 });
  const secret = node({ id: 6, kind: 'PAGE', title: 'Secret', parent_id: 4, visibility: 'PRIVATE' });
  const vault = node({ id: 7, kind: 'FOLDER', title: 'Vault', parent_id: 4, visibility: 'PASSWORD', password_hash: 'hash' });
  const keys = node({ id: 8, kind: 'PAGE', title: 'Keys', parent_id: 7 });
  const draft = node({ id: 9, kind: 'PAGE', title: 'Draft', parent_id: 7, published_revision_id: null });
  return buildIndex([guides, install, open, lab, network, secret, vault, keys, draft], root);
}

describe('buildIndex', () => {
  it('gives every node its address from the folders above it', () => {
    const index = sample();
    expect(index.byId.get(8)!.path).toBe('lab/vault/keys');
    expect(index.byPath.get('guides/install')!.node.id).toBe(2);
  });

  it('orders siblings by position, folders before what they hold', () => {
    const index = sample();
    expect(index.order.map(entry => entry.node.id)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it('follows Inherit up to the nearest setting, or the wiki’s', () => {
    const index = sample();
    expect(index.byId.get(2)!.lock).toMatchObject({ visibility: 'private', lockId: 0 });
    expect(index.byId.get(5)!.lock).toMatchObject({ visibility: 'public', lockId: 4 });
    expect(index.byId.get(8)!.lock).toMatchObject({ visibility: 'password', lockId: 7 });
  });

  it('treats Password without a password as Private', () => {
    const index = buildIndex([node({ id: 1, kind: 'PAGE', title: 'Odd', visibility: 'PASSWORD' })], PUBLIC_WIKI);
    expect(index.byId.get(1)!.lock.visibility).toBe('private');
  });

  it('leaves out what sits in a folder that isn’t there', () => {
    const index = buildIndex([node({ id: 1, kind: 'PAGE', title: 'Orphan', parent_id: 99 })], PUBLIC_WIKI);
    expect(index.byId.has(1)).toBe(false);
  });
});

describe('access', () => {
  const index = sample();
  const at = (id: number) => index.byId.get(id)!;

  it('lets visitors read public pages only', () => {
    expect(access(at(5), visitor())).toBe('ok');
    expect(access(at(3), visitor())).toBe('ok');
    expect(access(at(2), visitor())).toBe('signIn');
    expect(access(at(6), visitor())).toBe('signIn');
  });

  it('asks visitors for a folder’s password, and opens with it', () => {
    expect(access(at(8), visitor())).toBe('password');
    expect(access(at(8), visitor([7]))).toBe('ok');
  });

  it('lets signed-in readers read every published page, without passwords', () => {
    for (const id of [2, 3, 5, 6, 8]) expect(access(at(id), readerAccount)).toBe('ok');
  });

  it('hides pages never published from everyone but editors', () => {
    expect(access(at(9), readerAccount)).toBe('hidden');
    expect(access(at(9), visitor([7]))).toBe('hidden');
    expect(access(at(9), editor)).toBe('ok');
  });
});

describe('listed', () => {
  const index = sample();
  const at = (id: number) => index.byId.get(id)!;

  it('shows visitors locked pages, and folders that hold something they see', () => {
    expect(listed(at(8), visitor())).toBe(true);
    expect(listed(at(7), visitor())).toBe(true);
    expect(listed(at(1), visitor())).toBe(true);
    expect(listed(at(2), visitor())).toBe(false);
    expect(listed(at(6), visitor())).toBe(false);
  });

  it('hides a folder with nothing the reader may see', () => {
    const empty = buildIndex([node({ id: 1, kind: 'FOLDER', title: 'Empty' })], PUBLIC_WIKI);
    expect(listed(empty.byId.get(1)!, visitor())).toBe(false);
    expect(listed(empty.byId.get(1)!, editor)).toBe(true);
  });
});

describe('treeFor', () => {
  it('marks locked pages for visitors and gives editors the settings', () => {
    const index = sample();
    const forVisitor = treeFor(index, visitor());
    expect(forVisitor.map(row => row.id)).toEqual([1, 3, 4, 5, 7, 8]);
    expect(forVisitor.find(row => row.id === 8)!.locked).toBe(true);
    expect(forVisitor.every(row => row.visibility === 'inherit')).toBe(true);

    const forEditor = treeFor(index, editor);
    expect(forEditor).toHaveLength(9);
    expect(forEditor.find(row => row.id === 9)!.unpublished).toBe(true);
    expect(forEditor.find(row => row.id === 6)!.visibility).toBe('private');
  });
});

describe('neighbours', () => {
  it('skips what the reader can’t open', () => {
    const index = sample();
    const { previous, next } = neighbours(index, index.byId.get(5)!, visitor());
    expect(previous?.node.id).toBe(3);
    // Secret is private and Keys is locked: nothing after Network for a visitor.
    expect(next).toBeNull();
    expect(neighbours(index, index.byId.get(5)!, visitor([7])).next?.node.id).toBe(8);
  });
});
