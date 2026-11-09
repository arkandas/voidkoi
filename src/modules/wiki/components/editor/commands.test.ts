import { EditorSelection, EditorState } from '@codemirror/state';
import { describe, expect, it } from 'vitest';
import { codeBlock, cycleHeading, insertBlock, insertImage, link, pageLink, table, toggleLinePrefix, toggleWrap } from './commands';

function state(doc: string, from: number, to = from) {
  return EditorState.create({ doc, selection: EditorSelection.single(from, to) });
}

const text = (transaction: { state: EditorState }) => transaction.state.doc.toString();
const selected = (transaction: { state: EditorState }) => {
  const { from, to } = transaction.state.selection.main;
  return transaction.state.sliceDoc(from, to);
};

describe('toggleWrap', () => {
  it('wraps the selection, and the word under the cursor', () => {
    expect(text(toggleWrap(state('make it bold', 8, 12), '**'))).toBe('make it **bold**');
    expect(text(toggleWrap(state('make it bold', 10), '**'))).toBe('make it **bold**');
  });

  it('takes the marks off again', () => {
    const once = toggleWrap(state('make it bold', 8, 12), '**');
    expect(text(toggleWrap(once.state, '**'))).toBe('make it bold');
  });
});

describe('toggleLinePrefix', () => {
  it('starts every selected line with the marker, numbering a numbered list', () => {
    expect(text(toggleLinePrefix(state('one\ntwo', 0, 7), '- '))).toBe('- one\n- two');
    expect(text(toggleLinePrefix(state('one\ntwo', 0, 7), '1. '))).toBe('1. one\n2. two');
  });

  it('swaps one kind of list for another, and takes the marker off when all have it', () => {
    expect(text(toggleLinePrefix(state('- one\n- two', 0, 11), '1. '))).toBe('1. one\n2. two');
    expect(text(toggleLinePrefix(state('- one\n- two', 0, 11), '- '))).toBe('one\ntwo');
  });
});

describe('cycleHeading', () => {
  it('goes through ##, ### and back to text', () => {
    const first = cycleHeading(state('Title', 0));
    expect(text(first)).toBe('## Title');
    const second = cycleHeading(first.state);
    expect(text(second)).toBe('### Title');
    expect(text(cycleHeading(second.state))).toBe('Title');
  });
});

describe('blocks', () => {
  it('puts a block on lines of its own', () => {
    expect(text(insertBlock(state('before', 6), '---'))).toBe('before\n\n---\n');
  });

  it('wraps selected lines in a code block', () => {
    expect(text(codeBlock(state('a\nb', 0, 3)))).toBe('```\na\nb\n```');
  });

  it('builds a table in the reader’s words', () => {
    expect(table('Col', 'Cell')).toBe('| Col | Col |\n| --- | --- |\n| Cell | Cell |');
  });

  it('puts a picture on a line of its own', () => {
    expect(text(insertImage(state('text', 4), '![a](/x)', null))).toBe('text\n\n![a](/x)\n');
  });
});

describe('links', () => {
  it('turns a selected word into a link with the address to type', () => {
    const result = link(state('see docs', 4, 8), 'text');
    expect(text(result)).toBe('see [docs](url)');
    expect(selected(result)).toBe('url');
  });

  it('links to a page of the wiki by its title', () => {
    expect(text(pageLink(state('', 0), 'Network', 'homelab/network'))).toBe('[Network](/wiki/homelab/network)');
  });
});
