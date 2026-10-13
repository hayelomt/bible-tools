import {
  type Book,
  type BookCode,
  BOOKS,
  bookByIndex,
  bookKey,
  chapterCount,
  formatPassage,
  getBook,
  passageSlug,
} from '@lamp/domain';

/** A chapter the reader shows (F8). */
export interface Chapter {
  book: BookCode;
  chapter: number;
}

/** The chapter after this one, into the next book after a book's last; null after Revelation 22. */
export function nextChapter({ book, chapter }: Chapter): Chapter | null {
  if (chapter < chapterCount(book)) return { book, chapter: chapter + 1 };
  const after = bookByIndex(getBook(book).index + 1);
  return after ? { book: after.code, chapter: 1 } : null;
}

/** The chapter before this one, back into the last chapter of the book before; null at Genesis 1. */
export function previousChapter({ book, chapter }: Chapter): Chapter | null {
  if (chapter > 1) return { book, chapter: chapter - 1 };
  const before = bookByIndex(getBook(book).index - 1);
  return before ? { book: before.code, chapter: chapterCount(before.code) } : null;
}

/** "John 10", "Psalm 23", and "Obadiah" for a book of one chapter. */
export const chapterName = (c: Chapter): string => formatPassage(c);

/** The reader's address for the chapter: `JHN.10`. */
export const chapterSlug = (c: Chapter): string => passageSlug(c);

/**
 * The books the picker's filter keeps (wireframes/reader.md "Book and chapter picker"): those whose
 * name or a usual abbreviation starts with what's typed, so "1 jo" leaves 1 John. All for nothing.
 */
export function matchBooks(filter: string): readonly Book[] {
  const key = bookKey(filter);
  if (!key) return BOOKS;
  return BOOKS.filter(
    (book) => bookKey(book.name).startsWith(key) || book.aliases.some((a) => a.startsWith(key)),
  );
}
