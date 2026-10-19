import type { Passage, TranslationId } from '@lamp/domain';
import type { BookText } from './book-text.ts';

export interface VerseText {
  chapter: number;
  verse: number;
  /** Empty for a verse the translation leaves out (BSB Acts 8:37); see `BookText.n`. */
  text: string;
}

/**
 * The verses of a passage, in order: one verse, a range, a whole chapter or chapters, or a range
 * across chapters. Verses past the end of the book's text are left out, so a reference from
 * another versification returns what exists rather than failing.
 */
export function passageVerses(book: BookText, p: Passage): VerseText[] {
  const lastChapter = p.chapterEnd ?? p.chapter;
  const verses: VerseText[] = [];
  for (let chapter = p.chapter; chapter <= lastChapter; chapter++) {
    const texts = book.c[chapter - 1] ?? [];
    const first = chapter === p.chapter ? (p.verseStart ?? 1) : 1;
    const last =
      p.verseStart === undefined || chapter < lastChapter
        ? texts.length
        : (p.verseEnd ?? p.verseStart);
    for (let verse = first; verse <= Math.min(last, texts.length); verse++) {
      verses.push({ chapter, verse, text: texts[verse - 1]! });
    }
  }
  return verses;
}

/** The passage as one string: verse texts joined by spaces, empty ones skipped. */
export function passageText(book: BookText, p: Passage): string {
  return passageVerses(book, p)
    .map((v) => v.text)
    .filter(Boolean)
    .join(' ');
}

/**
 * A passage's text as a chip quotes it (F3): its verse texts. The BSB leaves 16 verses empty (Acts
 * 8:37 and others) with a note; on its own, such a verse quotes that note, marked (decided
 * 2026-10-13), so a chip never shows nothing. In a range they're skipped.
 */
export function quoteText(book: BookText, passage: Passage, translation: TranslationId): string {
  const text = passageText(book, passage);
  if (text) return text;
  const notes = passageVerses(book, passage)
    .map((v) => book.n?.[`${v.chapter}:${v.verse}`])
    .filter(Boolean);
  return notes.length > 0 ? `[Not in ${translation}: ${[...new Set(notes)].join(' ')}]` : '';
}
