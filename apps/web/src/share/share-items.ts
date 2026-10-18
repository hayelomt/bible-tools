import { isAppTranslation, type TranslationId, type VerseRef } from '@lamp/domain';
import { snapshotText, whenBook } from '@/data/bible.ts';
import type { NewInboxItem } from '@/data/actions/inbox.ts';
import type { FoundVerse, ShareReading } from './read-share.ts';

/** How long adding waits for a book that isn't here yet; the chip gets its text later. */
const BOOK_WAIT_MS = 2000;

/** The chip with its text from the book, when it's here or arrives within 2 s; as it was if not. */
export async function withBookText(ref: VerseRef, translation: TranslationId): Promise<VerseRef> {
  const book = await Promise.race([
    whenBook(translation, ref.book),
    new Promise<null>((resolve) => setTimeout(resolve, BOOK_WAIT_MS, null)),
  ]);
  const text = book ? snapshotText(book, ref, translation) : '';
  return text ? { ...ref, snapshotText: text } : ref;
}

/**
 * The inbox items for what a share or a paste holds (M9-06, M9-09): an item for each verse
 * chosen, the first with the rest of the text as its note, each chip from the book with its text;
 * with no verse, the note alone.
 */
export async function shareItems(
  { note, sourceUrl }: ShareReading,
  chosen: readonly FoundVerse[],
  origin: NewInboxItem['origin'],
): Promise<NewInboxItem[]> {
  if (chosen.length === 0) return [{ origin, ref: null, text: note, sourceUrl }];
  const refs = await Promise.all(
    chosen.map(({ ref, fromBook }) =>
      fromBook && isAppTranslation(ref.translation) ? withBookText(ref, ref.translation) : ref,
    ),
  );
  return refs.map((ref, i) => ({ origin, ref, text: i === 0 ? note : null, sourceUrl }));
}
