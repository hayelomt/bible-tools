import type { BookText } from '@lamp/bible-data';
import { type BookCode, DEFAULT_TRANSLATION, type SectionBody, type VerseRef } from '@lamp/domain';
import { action } from './action.ts';
import { snapshotText, whenBook } from './bible.ts';
import { db as appDb, type LampDb } from './db.ts';

/**
 * Chips inserted before their book was downloaded hold no text (wireframes/verses.md); this gives
 * them their snapshot once the book is here (M2-11). A chip that has its text keeps it.
 */

interface Node {
  type: string;
  attrs?: unknown;
  content?: Node[];
}

function eachVerse(nodes: readonly Node[], visit: (ref: VerseRef) => void) {
  for (const node of nodes) {
    if (node.type === 'verse') visit(node.attrs as VerseRef);
    else if (node.content) eachVerse(node.content, visit);
  }
}

function waiting(ref: VerseRef): boolean {
  return !ref.snapshotText && ref.translation === DEFAULT_TRANSLATION;
}

/** The books of the body's chips that are waiting for their text. */
export function booksWaiting(body: SectionBody): Set<BookCode> {
  const codes = new Set<BookCode>();
  eachVerse(body.content, (ref) => {
    if (waiting(ref)) codes.add(ref.book);
  });
  return codes;
}

/** The body with its waiting chips filled from the books given, or null when none of them is. */
export function withSnapshots(
  body: SectionBody,
  books: ReadonlyMap<BookCode, BookText>,
): SectionBody | null {
  const copy = structuredClone(body);
  let changed = false;
  eachVerse(copy.content, (ref) => {
    const book = books.get(ref.book);
    if (!book || !waiting(ref)) return;
    const text = snapshotText(book, ref);
    if (!text) return;
    ref.snapshotText = text;
    changed = true;
  });
  return changed ? copy : null;
}

/**
 * Fills every stored section's waiting chips from the books on this device. Each section is
 * updated on its own, from the row as it is then, so it never overwrites a newer change.
 */
export async function fillStoredSnapshots(db: LampDb = appDb): Promise<void> {
  const sections = await db.section.filter((s) => s.deletedAt === null).toArray();
  const wanted = new Set(sections.flatMap((s) => [...booksWaiting(s.body)]));
  if (wanted.size === 0) return;
  const books = new Map<BookCode, BookText>();
  for (const code of wanted) {
    const text = await whenBook(code);
    if (text) books.set(code, text);
  }
  if (books.size === 0) return;
  for (const { id, body } of sections) {
    if (![...booksWaiting(body)].some((code) => books.has(code))) continue;
    await action(db, async (w) => {
      const row = await w.db.section.get(id);
      if (!row || row.deletedAt !== null) return;
      const filled = withSnapshots(row.body, books);
      if (filled) await w.update('section', id, { body: filled });
    });
  }
}

let timer: ReturnType<typeof setTimeout> | undefined;

/** Runs `fillStoredSnapshots` once things settle (books arrive in bursts while downloading). */
export function fillStoredSnapshotsSoon(delayMs = 1000) {
  clearTimeout(timer);
  timer = setTimeout(() => {
    fillStoredSnapshots().catch((error: unknown) => {
      console.error('Filling verse snapshots failed', error);
    });
  }, delayMs);
}
