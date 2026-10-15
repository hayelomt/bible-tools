import { describe, expect, it } from 'vitest';
import { createGlossary, type GlossaryData, type PageVerse } from './glossary.ts';

const DATA: GlossaryData = {
  source: 'test',
  rules: [
    {
      id: 'eth',
      trigger: String.raw`\b(?!teeth\b)[a-z]{2,}eth\b`,
      title: '-eth',
      meaning: 'he goes',
    },
    { id: 'thou', trigger: String.raw`\b[Tt]hou\b`, title: 'thou', meaning: 'you' },
  ],
  entries: [
    { term: 'room', kind: 'shifted', meaning: 'a seat at a meal', only: ['LUK.14.8'] },
    { term: 'in the room of', kind: 'phrase', meaning: 'instead of' },
    { term: 'let', kind: 'shifted', meaning: 'to hinder', only: ['2TH.2.7'] },
    { term: 'wist', kind: 'obsolete', meaning: 'knew' },
    { term: 'God forbid', kind: 'phrase', meaning: 'certainly not' },
    { term: 'fetch a compass', forms: ['fetched a compass'], kind: 'phrase', meaning: 'go around' },
    {
      term: 'quicken',
      forms: ['quickened'],
      kind: 'shifted',
      meaning: 'to make alive',
      note: 'give life',
    },
  ],
};

const glossary = createGlossary(DATA);
const verse = (ref: string, text: string): PageVerse => {
  const [book, chapter, v] = ref.split('.');
  return { book: book as PageVerse['book'], chapter: Number(chapter), verse: Number(v), text };
};
const terms = (verses: PageVerse[]) => glossary.find(verses).hits.map((h) => h.entry.term);

describe('find', () => {
  it('finds a word in any case, and only as a whole word', () => {
    expect(terms([verse('JHN.5.13', 'And he that was healed Wist not who it was')])).toEqual([
      'wist',
    ]);
    expect(terms([verse('GEN.1.1', 'a wistful look')])).toEqual([]);
  });

  it('finds a form as its entry', () => {
    expect(terms([verse('EPH.2.1', 'And you hath he quickened')])).toEqual(['quicken']);
  });

  it('prefers the longer phrase to a word inside it', () => {
    expect(terms([verse('1KI.2.35', 'he put in the room of Joab')])).toEqual(['in the room of']);
  });

  it('matches a phrase across line breaks and doubled spaces', () => {
    expect(terms([verse('ACT.28.13', 'we fetched  a\ncompass')])).toEqual(['fetch a compass']);
  });

  it('keeps a scoped word to its verses', () => {
    const v = verse('2TH.2.7', 'only he who now letteth will let, until he be taken');
    expect(terms([v])).toEqual(['let']);
    expect(terms([verse('GEN.1.26', 'Let us make man')])).toEqual([]);
    expect(terms([verse('LUK.14.9', 'Give this man room')])).toEqual([]);
  });

  it('collects each entry once, with its verses in page order and a count', () => {
    const a = verse('ROM.6.2', 'God forbid. God forbid.');
    const b = verse('ROM.6.15', 'they wist not');
    const c = verse('ROM.7.7', 'God forbid');
    const { hits } = glossary.find([a, b, c]);
    expect(hits.map((h) => [h.entry.term, h.verses.map((v) => v.verse), h.count])).toEqual([
      ['God forbid', [2, 7], 3],
      ['wist', [15], 1],
    ]);
  });

  it('applies a rule once when its trigger matches, case-sensitively', () => {
    const page = [verse('JHN.3.8', 'The wind bloweth'), verse('JHN.3.9', 'thou hearest')];
    expect(glossary.find(page).rules.map((r) => r.id)).toEqual(['eth', 'thou']);
    expect(glossary.find([verse('LUK.1.5', 'Elisabeth of Nazareth')]).rules).toEqual([]);
    expect(glossary.find([verse('JOB.4.10', 'the teeth of the lions')]).rules).toEqual([]);
  });
});

const search = (q: string) => glossary.search(q).map((e) => e.term);

describe('search', () => {
  it('returns every entry by term for an empty query', () => {
    expect(search('  ')).toEqual(
      DATA.entries.map((e) => e.term).toSorted((a, b) => a.localeCompare(b)),
    );
  });

  it('ranks an exact term, then a prefix, then a term containing the query', () => {
    expect(search('room')).toEqual(['room', 'in the room of']);
    expect(search('quick')).toEqual(['quicken']);
  });

  it('finds a form', () => {
    expect(search('Fetched a Compass')).toEqual(['fetch a compass']);
  });

  it('finds a phrase from part of it', () => {
    expect(search('god forb')).toEqual(['God forbid']);
  });

  it('finds an entry by a word at the start of a word in its meaning or note', () => {
    expect(search('hinder')).toEqual(['let']);
    expect(search('life')).toEqual(['quicken']);
    expect(search('inder')).toEqual([]);
  });

  it('treats the query as text, not a pattern', () => {
    expect(search('(')).toEqual([]);
  });
});
