import {
  type ChipTranslation,
  type Passage,
  type TranslationId,
  type VerseReader,
  type VerseRef,
} from '@lamp/domain';
import type { BookText } from '@lamp/bible-data';
import { type BookState, bookState, quoteText, useBooks, whenBook } from './bible.ts';
import { activeTranslation, useActiveTranslation } from './translation.ts';

/**
 * How a reference reads now (decision 97). The app's own text isn't stored: it's read from the
 * book of the translation picked in Settings, so a change there changes every chip. Text from
 * outside (`shared`, `pasted`) is the chip's own.
 */
export interface Reading {
  translation: ChipTranslation;
  /** Null while the app's book is on its way or can't be fetched, or when none came from outside. */
  text: string | null;
  /** The book that numbers its verses; null for text from outside. */
  book: BookState | null;
}

/** A chip's node holds its unset fields as null; a passage leaves them out. */
function cleaned(ref: Passage): Passage {
  return Object.fromEntries(Object.entries(ref).filter(([, v]) => v !== null)) as Passage;
}

/** How `ref` reads in `active` now; starts fetching its book if it isn't here. */
export function readRef(ref: VerseRef, active: TranslationId = activeTranslation()): Reading {
  if (ref.translation) {
    return { translation: ref.translation, text: ref.snapshotText || null, book: null };
  }
  const book = bookState(active, ref.book);
  const text = book.status === 'ready' ? quoteText(book.text, cleaned(ref), active) : '';
  return { translation: active, text: text || null, book };
}

/** `readRef`, re-rendering when the translation changes or the book arrives. */
export function useReading(ref: VerseRef): Reading {
  const active = useActiveTranslation();
  useBooks(ref.translation ? [] : [{ translation: active, book: ref.book }]);
  return readRef(ref, active);
}

/** `useReading` for a list that can change length (a lesson's main passages). */
export function useReadings(refs: readonly VerseRef[]): Reading[] {
  const active = useActiveTranslation();
  useBooks(
    refs.flatMap((ref) => (ref.translation ? [] : [{ translation: active, book: ref.book }])),
  );
  return refs.map((ref) => readRef(ref, active));
}

/**
 * A reader of `refs` for an export, once their books are fetched (or can't be: a missing book's
 * passages read as no text).
 */
export async function verseReader(
  refs: readonly VerseRef[],
  translation: TranslationId = activeTranslation(),
): Promise<VerseReader> {
  const codes = new Set(refs.filter((ref) => !ref.translation).map((ref) => ref.book));
  const books = new Map<string, BookText | null>(
    await Promise.all(
      [...codes].map(async (code) => [code, await whenBook(translation, code)] as const),
    ),
  );
  return readerOf(translation, (code) => books.get(code) ?? null);
}

/** A reader of the books already here, for a screen that re-renders as they arrive. */
export function currentReader(translation: TranslationId = activeTranslation()): VerseReader {
  return readerOf(translation, (code) => {
    const book = bookState(translation, code);
    return book.status === 'ready' ? book.text : null;
  });
}

function readerOf(
  translation: TranslationId,
  bookOf: (code: Passage['book']) => BookText | null,
): VerseReader {
  return {
    translation,
    text: (passage) => {
      const book = bookOf(passage.book);
      return book ? quoteText(book, cleaned(passage), translation) : '';
    },
  };
}
