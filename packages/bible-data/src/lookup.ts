import type { Passage } from '@lamp/domain';
import type { BookText } from './usfm.ts';

export interface VerseText {
  chapter: number;
  verse: number;
  /** Empty for a verse the translation leaves out (WEB Acts 8:37); see `BookText.n`. */
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

/** The passage as one string, for a chip's snapshot: verse texts joined by spaces, empty ones skipped. */
export function passageText(book: BookText, p: Passage): string {
  return passageVerses(book, p)
    .map((v) => v.text)
    .filter(Boolean)
    .join(' ');
}
