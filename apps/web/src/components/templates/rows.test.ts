import { describe, expect, it } from 'vitest';
import {
  canIndent,
  canMove,
  indent,
  move,
  outdent,
  problemWith,
  remove,
  rowsOf,
  structureOf,
  type TemplateRow,
} from './rows.ts';

const NOTES = [
  { title: 'Main point' },
  { title: 'Points', children: [{ title: 'One' }, { title: 'Two' }] },
  { title: 'Response' },
];

/** The rows as "title" for a section and "  title" for a child. */
const shown = (rows: readonly TemplateRow[]) =>
  rows.map((r) => `${r.level === 1 ? '  ' : ''}${r.title}`);

describe('rowsOf and structureOf', () => {
  it('turn a structure into rows and back', () => {
    const rows = rowsOf(NOTES);
    expect(shown(rows)).toEqual(['Main point', 'Points', '  One', '  Two', 'Response']);
    expect(structureOf(rows)).toEqual(NOTES);
  });

  it('leave out blank names; a child with no section above it is a section', () => {
    const rows: TemplateRow[] = [
      { id: '1', title: 'Orphan', level: 1 },
      { id: '2', title: '  ', level: 0 },
      { id: '3', title: ' Kept ', level: 1 },
    ];
    expect(structureOf(rows)).toEqual([{ title: 'Orphan', children: [{ title: 'Kept' }] }]);
    expect(problemWith([{ id: '1', title: ' ', level: 0 }])).toBe(
      'A template needs at least one section.',
    );
    expect(problemWith(rows)).toBeNull();
    const many = Array.from({ length: 31 }, (_, i) => ({
      id: `${i}`,
      title: `S${i}`,
      level: 0 as const,
    }));
    expect(problemWith(many)).toBe('A template has at most 30 sections.');
  });
});

describe('indent and outdent', () => {
  it('nest a row under the section above, one level deep', () => {
    const rows = rowsOf(NOTES);
    expect(canIndent(rows, 0)).toBe(false);
    // Points has children, so it can't become one.
    expect(canIndent(rows, 1)).toBe(false);
    expect(canIndent(rows, 2)).toBe(false);
    expect(shown(indent(rows, 4))).toEqual([
      'Main point',
      'Points',
      '  One',
      '  Two',
      '  Response',
    ]);
    expect(shown(outdent(rows, 2))).toEqual(['Main point', 'Points', 'One', '  Two', 'Response']);
  });
});

describe('move', () => {
  it('moves a section with its children, and a child within its section', () => {
    const rows = rowsOf(NOTES);
    expect(shown(move(rows, 1, -1))).toEqual([
      'Points',
      '  One',
      '  Two',
      'Main point',
      'Response',
    ]);
    expect(shown(move(rows, 1, 1))).toEqual(['Main point', 'Response', 'Points', '  One', '  Two']);
    expect(shown(move(rows, 2, 1))).toEqual(['Main point', 'Points', '  Two', '  One', 'Response']);
    expect(canMove(rows, 0, -1)).toBe(false);
    expect(canMove(rows, 4, 1)).toBe(false);
    expect(canMove(rows, 2, -1)).toBe(false);
    expect(canMove(rows, 3, 1)).toBe(false);
  });
});

describe('remove', () => {
  it('keeps a removed section’s children, under the section above', () => {
    const rows = rowsOf(NOTES);
    expect(shown(remove(rows, 1))).toEqual(['Main point', '  One', '  Two', 'Response']);
    const first = rowsOf([{ title: 'Points', children: [{ title: 'One' }] }]);
    expect(shown(remove(first, 0))).toEqual(['One']);
  });
});
