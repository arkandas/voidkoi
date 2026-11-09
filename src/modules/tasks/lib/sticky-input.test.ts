import { describe, expect, it } from 'vitest';
import { readStickyChanges } from './sticky-input';

describe('readStickyChanges', () => {
  it('maps the fields that were sent to their columns', () => {
    expect(readStickyChanges({ x: 12.5, y: 40, z: 3 })).toEqual({ position_x: 12.5, position_y: 40, z_index: 3 });
    expect(readStickyChanges({ content: 'Milk', color: 'lime' })).toEqual({ content: 'Milk', color: 'lime' });
    expect(readStickyChanges({})).toEqual({});
  });

  it('rounds sizes and layers to whole numbers', () => {
    expect(readStickyChanges({ width: 200.4, height: 199.6, z: 1.2 })).toEqual({ width: 200, height: 200, z_index: 1 });
  });

  it('turns down values that are not valid', () => {
    expect(readStickyChanges({ color: 'gold' })).toBeNull();
    expect(readStickyChanges({ x: 'left' })).toBeNull();
    expect(readStickyChanges({ z: Number.POSITIVE_INFINITY })).toBeNull();
    expect(readStickyChanges({ content: 'x'.repeat(2001) })).toBeNull();
  });
});
