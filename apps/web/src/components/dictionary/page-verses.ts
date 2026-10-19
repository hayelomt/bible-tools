import { createGlossary, type Glossary, type PageVerse, passageVerses } from '@lamp/bible-data';
import type { BookCode, VerseRef } from '@lamp/domain';
import { whenBook } from '@/data/bible.ts';

let glossary: Promise<Glossary> | undefined;

/** The KJV glossary, fetched the first time the dictionary opens (its own chunk). */
export function loadGlossary(): Promise<Glossary> {
  glossary ??= import('@lamp/bible-data/kjv-glossary').then((m) => createGlossary(m.KJV_GLOSSARY));
  return glossary;
}

/** A chapter's KJV verses, or none when its book can't be had. */
export async function chapterVerses(book: BookCode, chapter: number): Promise<PageVerse[]> {
  const text = await whenBook('KJV', book);
  return (text?.c[chapter - 1] ?? []).map((t, i) => ({ book, chapter, verse: i + 1, text: t }));
}

/**
 * The verses of the passages a lesson cites, from the KJV's books, in order and each once: those
 * of the app's own text, which read in the KJV when it's the translation picked (decision 97). A
 * passage whose book can't be had has none.
 */
export async function passagesVerses(refs: readonly VerseRef[]): Promise<PageVerse[]> {
  const kjv = refs.filter((ref) => !ref.translation);
  const texts = await Promise.all(kjv.map((ref) => whenBook('KJV', ref.book)));
  const seen = new Set<string>();
  const verses: PageVerse[] = [];
  kjv.forEach((ref, i) => {
    const text = texts[i];
    const found = text ? passageVerses(text, ref).map((v) => ({ book: ref.book, ...v })) : [];
    for (const verse of found) {
      const key = `${verse.book}.${verse.chapter}.${verse.verse}`;
      if (!verse.text || seen.has(key)) continue;
      seen.add(key);
      verses.push(verse);
    }
  });
  return verses;
}
