import { readFileSync } from 'node:fs';
import { BOOKS } from '@lamp/domain';
import { describe, expect, it } from 'vitest';
import { createGlossary, type PageVerse } from './glossary.ts';
import { KJV_GLOSSARY } from './kjv-glossary.ts';
import { readSource, type SourceBook } from './source.ts';
import { SOURCES } from './sources.ts';

// The glossary against the KJV text the app ships, so a typo in a form or a verse in `only` fails.
const KJV = SOURCES.find((s) => s.id === 'KJV')!;
const books = readSource(KJV.id, JSON.parse(readFileSync(KJV.file, 'utf8')) as SourceBook[]);
const verses: PageVerse[] = BOOKS.flatMap((book) =>
  books
    .get(book.code)!
    .c.flatMap((texts, c) =>
      texts.map((text, v) => ({ book: book.code, chapter: c + 1, verse: v + 1, text })),
    ),
);
const byRef = new Map(verses.map((v) => [`${v.book}.${v.chapter}.${v.verse}`, v]));
const glossary = createGlossary(KJV_GLOSSARY);
const page = (ref: string) => glossary.find([byRef.get(ref)!]).hits.map((h) => h.entry.term);
const wordIn = (form: string, text: string) =>
  new RegExp(String.raw`\b${form.replaceAll(' ', String.raw`\s+`)}\b`, 'i').test(text);

describe('the KJV glossary', () => {
  it.each(KJV_GLOSSARY.entries.flatMap((e) => [e.term, ...(e.forms ?? [])]))(
    '%s occurs in the KJV',
    (form) => {
      expect(verses.some((v) => wordIn(form, v.text))).toBe(true);
    },
  );

  it.each(KJV_GLOSSARY.entries.filter((e) => e.only).map((e) => [e.term, e] as const))(
    'every verse %s is scoped to contains it',
    (_, entry) => {
      const forms = [entry.term, ...(entry.forms ?? [])];
      expect(
        entry.only!.filter((ref) => !forms.some((f) => wordIn(f, byRef.get(ref)?.text ?? ''))),
      ).toEqual([]);
    },
  );

  it('gives each term and form to one entry', () => {
    const all = KJV_GLOSSARY.entries.flatMap((e) => [e.term, ...(e.forms ?? [])]);
    expect(all.map((f) => f.toLowerCase())).toEqual([...new Set(all.map((f) => f.toLowerCase()))]);
  });

  it('has a kind and a meaning for every entry', () => {
    const kinds = new Set(['obsolete', 'shifted', 'phrase']);
    const bad = KJV_GLOSSARY.entries.filter((e) => !kinds.has(e.kind) || !e.meaning);
    expect(bad.map((e) => e.term)).toEqual([]);
  });

  it('finds the old sense of a scoped word only where it applies', () => {
    expect(page('2TH.2.7')).toContain('let');
    expect(page('GEN.1.26')).not.toContain('let');
    expect(page('2TI.4.1')).toContain('quick');
    expect(page('ISA.11.3')).not.toContain('quick');
  });

  it('finds the grammar notes in a chapter of John', () => {
    const john3 = verses.filter((v) => v.book === 'JHN' && v.chapter === 3);
    expect(glossary.find(john3).rules.map((r) => r.id)).toEqual(['eth', 'est', 'thou-ye']);
  });
});
