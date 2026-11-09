import { describe, expect, it } from 'vitest';
import { firstPartHref, partsUsed } from './routes';

describe('parts of Tasks', () => {
  it('are the ones the account picked, in header order', () => {
    expect(partsUsed(['tasks', '-tasks.todo'])).toEqual(['boards', 'stickies']);
    expect(partsUsed(['tasks'])).toEqual(['boards', 'todo', 'stickies']);
    expect(partsUsed(['notes'])).toEqual([]);
  });

  it('open at the first one the account uses', () => {
    expect(firstPartHref(['tasks'])).toBe('/tasks/boards');
    expect(firstPartHref(['tasks', '-tasks.boards'])).toBe('/tasks/todo');
    expect(firstPartHref(['tasks', '-tasks.boards', '-tasks.todo'])).toBe('/tasks/sticky-notes');
    expect(firstPartHref(['notes'])).toBeNull();
  });
});
