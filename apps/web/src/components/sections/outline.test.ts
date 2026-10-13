import { keyBetween } from '@lamp/domain';
import { describe, expect, it } from 'vitest';
import {
  afterPlacement,
  dropAt,
  endPlacement,
  indentPlacement,
  moveDownTarget,
  moveUpTarget,
  outdentPlacement,
  outline,
  type OutlineItem,
  type Placement,
  replyPlacement,
  type Target,
  targetPlacement,
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

/** Moves `id` to `target` and returns the new shape. */
function move(items: OutlineItem[], id: string, target: Target | null) {
  if (!target) throw new Error('no target');
  const placement = targetPlacement(outline(items), id, target);
  if (!placement) throw new Error('already there');
  return place(items, id, placement);
}

describe('moving sections', () => {
  it('moves a section up and down past its siblings, with its replies', () => {
    const rows = outline(LESSON);
    expect(move(LESSON, 'B', moveUpTarget(rows, 'B'))).toEqual(['B', 'A', '  A1', '  A2', 'C']);
    expect(move(LESSON, 'A', moveDownTarget(rows, 'A'))).toEqual(['B', 'A', '  A1', '  A2', 'C']);
    expect(move(LESSON, 'C', moveUpTarget(rows, 'C'))).toEqual(['A', '  A1', '  A2', 'C', 'B']);
    expect(move(LESSON, 'A1', moveDownTarget(rows, 'A1'))).toEqual(['A', '  A2', '  A1', 'B', 'C']);
  });

  it('keeps a reply under its section, and stops at the ends', () => {
    const rows = outline(LESSON);
    expect(moveUpTarget(rows, 'A')).toBeNull();
    expect(moveDownTarget(rows, 'C')).toBeNull();
    expect(moveUpTarget(rows, 'A1')).toBeNull();
    expect(moveDownTarget(rows, 'A2')).toBeNull();
  });

  it('writes nothing for a move to where the section already is', () => {
    const rows = outline(LESSON);
    expect(targetPlacement(rows, 'B', { parent: null, after: 'A' })).toBeNull();
    expect(targetPlacement(rows, 'A', { parent: null, after: null })).toBeNull();
    expect(targetPlacement(rows, 'A2', { parent: 'A', after: 'A1' })).toBeNull();
  });

  it('moves between two siblings that share a key', () => {
    const items = [item('x', a0), item('y', a0), item('z', a1)];
    expect(move(items, 'z', { parent: null, after: null })).toEqual(['z', 'x', 'y']);
  });
});

describe('dropping a dragged section', () => {
  const rows = outline(LESSON);
  // Rows left while each is dragged, gaps numbered from 0 before the first.
  const drop = (id: string, gap: number, reply = false) => {
    const target = dropAt(rows, id, gap, reply);
    return target && { level: target.level, shape: move(LESSON, id, target) };
  };

  it('lands at the top level between sections, after a section’s replies', () => {
    // Left while dragging C: A, A1, A2, B.
    expect(drop('C', 0)).toEqual({ level: 0, shape: ['C', 'A', '  A1', '  A2', 'B'] });
    expect(drop('C', 3)).toEqual({ level: 0, shape: ['A', '  A1', '  A2', 'C', 'B'] });
    // Left while dragging A (with its replies): B, C.
    expect(drop('A', 2)).toEqual({ level: 0, shape: ['B', 'C', 'A', '  A1', '  A2'] });
  });

  it('becomes a reply on the right half, after the row above', () => {
    expect(drop('C', 1, true)).toEqual({ level: 1, shape: ['A', '  C', '  A1', '  A2', 'B'] });
    expect(drop('C', 3, true)).toEqual({ level: 1, shape: ['A', '  A1', '  A2', '  C', 'B'] });
    expect(drop('C', 4, true)).toEqual({ level: 1, shape: ['A', '  A1', '  A2', 'B', '  C'] });
    // A reply dragged out to the left becomes a section.
    expect(drop('A1', 3)).toEqual({ level: 0, shape: ['A', '  A2', 'B', 'A1', 'C'] });
  });

  it('is a reply between two replies, and never a third level or a reply at the top', () => {
    expect(drop('C', 2)).toEqual({ level: 1, shape: ['A', '  A1', '  C', '  A2', 'B'] });
    expect(dropAt(rows, 'C', 0, true)).toMatchObject({ level: 0 });
    // A has replies, so it stays a section, and can’t go between two replies.
    expect(dropAt(rows, 'A', 1, true)).toMatchObject({ level: 0 });
    const withReplies = outline([...LESSON, item('C1', a0, 'C')]);
    expect(dropAt(withReplies, 'A', 2, true)).toBeNull();
  });
});
