import { keyBetween } from '@lamp/domain';
import { describe, expect, it } from 'vitest';
import {
  afterPlacement,
  endPlacement,
  indentPlacement,
  outdentPlacement,
  outline,
  type OutlineItem,
  type Placement,
  replyPlacement,
} from './outline.ts';

const a0 = keyBetween(null, null);
const a1 = keyBetween(a0, null);
const a2 = keyBetween(a1, null);

const item = (id: string, orderKey: string, parentId: string | null = null): OutlineItem => ({
  id,
  parentId,
  orderKey,
});

/** The outline as "id" for sections and "  id" for replies. */
const shape = (items: OutlineItem[]) =>
  outline(items).map((r) => `${'  '.repeat(r.level)}${r.item.id}`);

/** Places `id` (new or moved) and returns the new shape. */
function place(items: OutlineItem[], id: string, placement: Placement | null) {
  if (!placement) throw new Error('not placeable');
  return shape([...items.filter((i) => i.id !== id), { id, ...placement }]);
}

// A, with replies A1 and A2; B; C.
const LESSON = [
  item('C', a2),
  item('A2', a1, 'A'),
  item('A', a0),
  item('B', a1),
  item('A1', a0, 'A'),
];

describe('outline', () => {
  it('shows each section followed by its replies, in key order', () => {
    expect(shape(LESSON)).toEqual(['A', '  A1', '  A2', 'B', 'C']);
    expect(outline(LESSON).map((r) => r.replies)).toEqual([2, 0, 0, 0, 0]);
  });

  it('breaks a tie between equal keys by id', () => {
    expect(shape([item('y', a0), item('x', a0)])).toEqual(['x', 'y']);
  });

  it('shows a reply with a missing parent, or a reply to a reply, at the top level', () => {
    expect(
      shape([item('A', a0), item('R', a1, 'gone'), item('RR', a0, 'A1'), item('A1', a0, 'A')]),
    ).toEqual(['A', '  A1', 'RR', 'R']);
  });
});

describe('placing sections', () => {
  const rows = outline(LESSON);

  it('adds a section at the end, and after a section or a reply at its level', () => {
    expect(place(LESSON, 'N', endPlacement(rows))).toEqual(['A', '  A1', '  A2', 'B', 'C', 'N']);
    expect(place(LESSON, 'N', afterPlacement(rows, 'A'))).toEqual([
      'A',
      '  A1',
      '  A2',
      'N',
      'B',
      'C',
    ]);
    expect(place(LESSON, 'N', afterPlacement(rows, 'A1'))).toEqual([
      'A',
      '  A1',
      '  N',
      '  A2',
      'B',
      'C',
    ]);
    expect(place([], 'N', endPlacement([]))).toEqual(['N']);
  });

  it('adds a reply after the last reply, or after the reply it was asked from', () => {
    expect(place(LESSON, 'N', replyPlacement(rows, 'A'))).toEqual([
      'A',
      '  A1',
      '  A2',
      '  N',
      'B',
      'C',
    ]);
    expect(place(LESSON, 'N', replyPlacement(rows, 'B'))).toEqual([
      'A',
      '  A1',
      '  A2',
      'B',
      '  N',
      'C',
    ]);
    expect(place(LESSON, 'N', replyPlacement(rows, 'A1'))).toEqual([
      'A',
      '  A1',
      '  N',
      '  A2',
      'B',
      'C',
    ]);
  });

  it('places after a section that shares its key with the next one', () => {
    const tied = [item('x', a0), item('y', a0), item('z', a1)];
    expect(place(tied, 'N', afterPlacement(outline(tied), 'x'))).toEqual(['x', 'y', 'N', 'z']);
  });

  it('makes a section a reply to the one above, where it already is on screen', () => {
    expect(place(LESSON, 'B', indentPlacement(rows, 'B'))).toEqual([
      'A',
      '  A1',
      '  A2',
      '  B',
      'C',
    ]);
    expect(place(LESSON, 'C', indentPlacement(rows, 'C'))).toEqual([
      'A',
      '  A1',
      '  A2',
      'B',
      '  C',
    ]);
  });

  it('never makes a third level, and needs a section above', () => {
    expect(indentPlacement(rows, 'A1')).toBeNull(); // a reply
    expect(indentPlacement(rows, 'A')).toBeNull(); // first, and has replies
    const withReplies = [item('A', a0), item('B', a1), item('B1', a0, 'B')];
    expect(indentPlacement(outline(withReplies), 'B')).toBeNull();
  });

  it('moves a reply out to just after its section', () => {
    expect(place(LESSON, 'A1', outdentPlacement(rows, 'A1'))).toEqual([
      'A',
      '  A2',
      'A1',
      'B',
      'C',
    ]);
    expect(outdentPlacement(rows, 'B')).toBeNull();
  });
});
