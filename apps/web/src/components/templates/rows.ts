import { MAX_SECTIONS, newId, type TemplateSection } from '@lamp/domain';

/**
 * The template editor's list (wireframes/thinking.md "Settings → Templates"): section names in
 * order, each a section (level 0) or a child of the section above it (level 1), one level deep as
 * the lesson editor nests.
 */
export interface TemplateRow {
  /** For React and focus only; never stored. */
  id: string;
  title: string;
  level: 0 | 1;
}

export function rowsOf(structure: readonly TemplateSection[]): TemplateRow[] {
  return structure.flatMap(({ title, children = [] }) => [
    { id: newId(), title, level: 0 as const },
    ...children.map((child) => ({ id: newId(), title: child.title, level: 1 as const })),
  ]);
}

export const blankRow = (level: 0 | 1 = 0): TemplateRow => ({ id: newId(), title: '', level });

/** Why a list can't be saved as it is, or null. Blank names are left out, not refused. */
export function problemWith(rows: readonly TemplateRow[]): string | null {
  const structure = structureOf(rows);
  if (structure.length === 0) return 'A template needs at least one section.';
  if (structure.length > MAX_SECTIONS) return `A template has at most ${MAX_SECTIONS} sections.`;
  if (structure.some((s) => (s.children?.length ?? 0) > MAX_SECTIONS)) {
    return `A section has at most ${MAX_SECTIONS} children.`;
  }
  return null;
}

/** The rows as a template's structure: blank names left out, a child with no section above it one. */
export function structureOf(rows: readonly TemplateRow[]): TemplateSection[] {
  const structure: { title: string; children: { title: string }[] }[] = [];
  for (const row of rows) {
    const title = row.title.trim();
    if (!title) continue;
    const parent = structure.at(-1);
    if (row.level === 1 && parent) parent.children.push({ title });
    else structure.push({ title, children: [] });
  }
  return structure.map(({ title, children }) =>
    children.length > 0 ? { title, children } : { title },
  );
}

/** Whether a row can become a child (Tab): one with a row above it and no children of its own. */
export function canIndent(rows: readonly TemplateRow[], index: number): boolean {
  const row = rows[index];
  return !!row && row.level === 0 && index > 0 && rows[index + 1]?.level !== 1;
}

export function indent(rows: readonly TemplateRow[], index: number): TemplateRow[] {
  if (!canIndent(rows, index)) return [...rows];
  return rows.map((row, i) => (i === index ? { ...row, level: 1 } : row));
}

/** A child becomes a section (Shift+Tab); the children after it become its own. */
export function outdent(rows: readonly TemplateRow[], index: number): TemplateRow[] {
  if (rows[index]?.level !== 1) return [...rows];
  return rows.map((row, i) => (i === index ? { ...row, level: 0 } : row));
}

/** The rows a move carries: a section with its children, or a child alone. */
function blockAt(rows: readonly TemplateRow[], index: number): [number, number] {
  let end = index + 1;
  if (rows[index]?.level === 0) while (rows[end]?.level === 1) end++;
  return [index, end];
}

/** Where the block before or after `index`'s starts, among blocks of the same kind; -1 for none. */
function neighbour(rows: readonly TemplateRow[], index: number, step: -1 | 1): number {
  const level = rows[index]?.level;
  if (level === 1) {
    const at = index + step;
    return rows[at]?.level === 1 ? at : -1;
  }
  if (step === 1) {
    const [, end] = blockAt(rows, index);
    return end < rows.length ? end : -1;
  }
  for (let i = index - 1; i >= 0; i--) if (rows[i]!.level === 0) return i;
  return -1;
}

export const canMove = (rows: readonly TemplateRow[], index: number, step: -1 | 1) =>
  neighbour(rows, index, step) >= 0;

/** Moves a section with its children past the next or previous section; a child within its section. */
export function move(rows: readonly TemplateRow[], index: number, step: -1 | 1): TemplateRow[] {
  const other = neighbour(rows, index, step);
  if (other < 0) return [...rows];
  const [first, second] = step === 1 ? [index, other] : [other, index];
  const [a0, a1] = blockAt(rows, first);
  const [b0, b1] = blockAt(rows, second);
  return [
    ...rows.slice(0, a0),
    ...rows.slice(b0, b1),
    ...rows.slice(a1, b0),
    ...rows.slice(a0, a1),
    ...rows.slice(b1),
  ];
}

/** Removes a row; a section's children stay, under the section above (or become sections). */
export function remove(rows: readonly TemplateRow[], index: number): TemplateRow[] {
  const left = rows.filter((_, i) => i !== index);
  if (rows[index]?.level === 0 && index === 0 && left[0]?.level === 1) {
    left[0] = { ...left[0], level: 0 };
  }
  return left;
}
