import { BOOKS, type Passage } from '@lamp/domain';
import { beforeAll, describe, expect, it } from 'vitest';
import type { BookText } from './book-text.ts';
import { buildTranslation } from './build.ts';
import { SOURCES } from './sources.ts';
import { VerseTextIndex, words } from './verse-match.ts';

/** Both translations, as the device holds them once downloaded. */
let index: VerseTextIndex;

beforeAll(() => {
  index = new VerseTextIndex();
  for (const id of ['BSB', 'KJV']) {
    const { manifest, files } = buildTranslation(SOURCES.find((s) => s.id === id)!);
    for (const book of BOOKS) {
      const text = JSON.parse(files.get(manifest.books[book.code]!.file)!) as BookText;
      index.add(id, book.code, text);
    }
  }
}, 30_000);

const proverbs = (chapter: number, verse: number): Passage => ({
  book: 'PRO',
  chapter,
  verseStart: verse,
});

/** Each match as "John 10:11 BSB". */
const found = (text: string, hints?: Passage[]) =>
  index.match(text, hints).map((m) => `${m.passage.display} ${m.translation}`);

// Copies as each site gives them (2026-10-18): the app's share text, a page's selection with its
// verse numbers, headings and footnote letters, and a quote inside a paragraph.
const PASTES: Array<[source: string, text: string, expected: string[]]> = [
  [
    'YouVersion app, one verse (BSB)',
    '“I am the good shepherd. The good shepherd lays down His life for the sheep.”\nJohn 10:11 BSB\n\nhttps://bible.com/bible/3034/jhn.10.11.BSB',
    ['John 10:11 BSB'],
  ],
  [
    'YouVersion app, two verses (KJV)',
    'And we know that all things work together for good to them that love God, to them who are the called according to his purpose. For whom he did foreknow, he also did predestinate to be conformed to the image of his Son, that he might be the firstborn among many brethren.\nRomans 8:28-29 KJV\n\nhttps://bible.com/bible/1/rom.8.28-29.KJV',
    ['Romans 8:28–29 KJV'],
  ],
  [
    'YouVersion web, with verse numbers (KJV)',
    "1 The LORD is my shepherd; I shall not want. 2 He maketh me to lie down in green pastures: he leadeth me beside the still waters. 3 He restoreth my soul: he leadeth me in the paths of righteousness for his name's sake.",
    ['Psalm 23:1–3 KJV'],
  ],
  [
    'Bible Hub, a verse per line with numbers (KJV)',
    '4Yea, though I walk through the valley of the shadow of death, I will fear no evil: for thou art with me; thy rod and thy staff they comfort me.\n5Thou preparest a table before me in the presence of mine enemies: thou anointest my head with oil; my cup runneth over.\n6Surely goodness and mercy shall follow me all the days of my life: and I will dwell in the house of the LORD for ever.',
    ['Psalm 23:4–6 KJV'],
  ],
  [
    'Bible Hub, a heading and footnote letters (BSB)',
    '28And we know that God works all things together for the goodd of those who love Him,e who are called according to His purpose. 29For those God foreknew, He also predestined to be conformed to the image of His Son, so that He would be the firstborn among many brothers. 30And those He predestined, He also called; those He called, He also justified; those He justified, He also glorified.\nMore Than Conquerors\n31What then shall we say in response to these things? If God is for us, who can be against us? 32He who did not spare His own Son but gave Him up for us all, how will He not also, along with Him, freely give us all things?',
    ['Romans 8:28–32 BSB'],
  ],
  [
    'Bible Hub, across a chapter and its heading (BSB)',
    '24What a wretched man I am! Who will rescue me from this body of death? 25Thanks be to God, through Jesus Christ our Lord! So then, with my mind I serve the law of God, but with my flesh I serve the law of sin.\nRomans 8\nLife in the Spirit\n1Therefore, there is now no condemnation for those who are in Christ Jesus. 2For in Christ Jesus the law of the Spirit of life set you free from the law of sin and death.',
    ['Romans 7:24–8:2 BSB'],
  ],
  [
    'A web page, a quote inside a paragraph (BSB)',
    'Paul ends the thought with a chain: “And those He predestined, He also called; those He called, He also justified; those He justified, He also glorified.” Notice that every link is in the past tense.',
    ['Romans 8:30 BSB'],
  ],
  [
    'A web page, quotes from two places (BSB, KJV)',
    'Jesus says, "I am the good shepherd. The good shepherd lays down His life for the sheep." The psalmist had said it long before: "The LORD is my shepherd; I shall not want."',
    ['John 10:11 BSB', 'Psalm 23:1 KJV'],
  ],
  [
    'A short verse inside a range (BSB)',
    '34 "Where have you put him?" He asked. "Come and see, Lord," they answered. 35 Jesus wept. 36 Then the Jews said, "See how He loved him!"',
    ['John 11:34–36 BSB'],
  ],
  [
    'A range across a verse the BSB leaves out (BSB)',
    '36 As they traveled along the road and came to some water, the eunuch said, "Look, here is water! What is there to prevent me from being baptized?" 38 And he gave orders to stop the chariot. Then both Philip and the eunuch went down into the water, and Philip baptized him.',
    ['Acts 8:36–38 BSB'],
  ],
  [
    'Line breaks and spacing from a PDF (BSB)',
    'And we know that God works all things\ntogether for the good of those who love\nHim, who are called according to His\npurpose.',
    ['Romans 8:28 BSB'],
  ],
];

// Other translations' text (NIV, ESV, NKJV, NLT, NASB) for verses that are in the index.
const OTHER_TRANSLATIONS: Array<[source: string, text: string]> = [
  [
    'NIV John 3:16',
    'For God so loved the world that he gave his one and only Son, that whoever believes in him shall not perish but have eternal life.',
  ],
  [
    'ESV Romans 8:28',
    'And we know that for those who love God all things work together for good, for those who are called according to his purpose.',
  ],
  ['NKJV John 10:11', 'I am the good shepherd. The good shepherd gives His life for the sheep.'],
  ['NLT Psalm 23:1', 'The LORD is my shepherd; I have all that I need.'],
  [
    'NASB Romans 8:1',
    'Therefore there is now no condemnation at all for those who are in Christ Jesus.',
  ],
  ['NIV Philippians 4:13', 'I can do all this through him who gives me strength.'],
];

describe('VerseTextIndex', () => {
  it.each(PASTES)('finds %s', (_, text, expected) => {
    expect(found(text)).toEqual(expected);
  });

  it.each(OTHER_TRANSLATIONS)('finds nothing in %s', (_, text) => {
    expect(found(text)).toEqual([]);
  });

  it('gives the span of the verses as pasted', () => {
    const text =
      'Read this: “I am the good shepherd. The good shepherd lays down His life for the sheep.”';
    const [match] = index.match(text);
    expect(match).toMatchObject({
      text: 'I am the good shepherd. The good shepherd lays down His life for the sheep',
      translation: 'BSB',
      passage: { book: 'JHN', chapter: 10, verseStart: 11, display: 'John 10:11' },
      edits: 0,
    });
    expect(text.slice(match!.from, match!.to)).toBe(match!.text);
  });

  it('allows a word in twenty to differ, as when an edition changes a word', () => {
    // Romans 8:32 (26 words) with "Son" for "own Son".
    const changed =
      'He who did not spare His Son but gave Him up for us all, how will He not also, along with Him, freely give us all things?';
    expect(index.match(changed)).toMatchObject([{ passage: { display: 'Romans 8:32' }, edits: 1 }]);
    // Two changes are too many.
    expect(found(changed.replace('freely', 'kindly'))).toEqual([]);
  });

  it('finds a short verse only next to another', () => {
    expect(found('Jesus wept.')).toEqual([]);
    expect(found('Rejoice always.')).toEqual([]);
    expect(found('When I read it, I am the good shepherd, and the rest of it.')).toEqual([]);
  });

  it('leaves out a verse found in two places, unless the text names one', () => {
    const text = 'There is a way that seems right to a man, but its end is the way of death.';
    expect(found(text)).toEqual([]);
    expect(found(text, [proverbs(16, 25)])).toEqual(['Proverbs 16:25 BSB']);
    expect(found(text, [proverbs(14, 12)])).toEqual(['Proverbs 14:12 BSB']);
  });

  it('finds nothing in text without verses', () => {
    expect(found('')).toEqual([]);
    expect(found('Look up "hesed" before Sunday. The good shepherd knows His sheep.')).toEqual([]);
    expect(found('Romans 8:28')).toEqual([]);
  });

  it('only uses the books added', () => {
    const small = new VerseTextIndex();
    const { manifest, files } = buildTranslation(SOURCES.find((s) => s.id === 'BSB')!);
    small.add('BSB', 'JHN', JSON.parse(files.get(manifest.books.JHN!.file)!) as BookText);
    expect(small.has('BSB', 'JHN')).toBe(true);
    expect(small.has('BSB', 'ROM')).toBe(false);
    expect(small.match(PASTES[0]![1]).map((m) => m.passage.display)).toEqual(['John 10:11']);
    expect(small.match(PASTES[4]![1])).toEqual([]);
  });
});

describe('words', () => {
  it('compares lower case, without accents, punctuation, quotes or numbers', () => {
    expect(words('28And “God’s” Cæsar—naïve 3:16').map((w) => w.word)).toEqual([
      'and',
      'gods',
      'caesar',
      'naive',
    ]);
  });

  it('keeps where each word is', () => {
    expect(words('“God’s” love')).toEqual([
      { word: 'gods', from: 1, to: 6 },
      { word: 'love', from: 8, to: 12 },
    ]);
  });
});
