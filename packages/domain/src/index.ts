// Public API of @lamp/domain.
export {
  BOOK_CODES,
  BOOKS,
  type Book,
  type BookCode,
  bookByIndex,
  bookKey,
  chapterCount,
  getBook,
  isBookCode,
  verseCount,
} from './books.ts';
export { SEED_TAGS } from './seed-tags.ts';
export {
  DEFAULT_TRANSLATION,
  checkPassage,
  formatPassage,
  type OrdinalRange,
  type Passage,
  type PassageError,
  passageRange,
  passagesOverlap,
  rangesOverlap,
  TRANSLATIONS,
  type TranslationId,
  type VerseRef,
  verseOrdinal,
} from './verse-ref.ts';
