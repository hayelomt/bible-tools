import type { BookText } from '@lamp/bible-data';
import type { BookCode, SectionBody, TranslationId, VerseRef } from '@lamp/domain';
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

/** A translation's book, as `booksWaiting` names it and `withSnapshots` looks it up: "BSB:ROM". */
export type BookKey = `${TranslationId}:${BookCode}`;

function bookKey(ref: VerseRef): BookKey {
  return `${ref.translation}:${ref.book}`;
}

/** The books, in the chips' own translations, of the body's chips that are waiting for their text. */
export function booksWaiting(body: SectionBody): Set<BookKey> {
  const keys = new Set<BookKey>();
  eachVerse(body.content, (ref) => {
    if (!ref.snapshotText) keys.add(bookKey(ref));
  });
  return keys;
}

/** The body with its waiting chips filled from the books given, or null when none of them is. */
export function withSnapshots(
  body: SectionBody,
  books: ReadonlyMap<BookKey, BookText>,
): SectionBody | null {
  const copy = structuredClone(body);
  let changed = false;
  eachVerse(copy.content, (ref) => {
    const book = books.get(bookKey(ref));
    if (!book || ref.snapshotText) return;
    const text = snapshotText(book, ref, ref.translation);
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
  const books = new Map<BookKey, BookText>();
  for (const key of wanted) {
    const [translation, code] = key.split(':') as [TranslationId, BookCode];
    const text = await whenBook(translation, code);
    if (text) books.set(key, text);
  }
  if (books.size === 0) return;
  for (const { id, body } of sections) {
    if (![...booksWaiting(body)].some((key) => books.has(key))) continue;
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
