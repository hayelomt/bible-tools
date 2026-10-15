import { VERSE_COUNTS } from './verse-counts.ts';

/** The 66 canonical books as USFM ids, in canonical order (TECH-DESIGN §4.1). */
export const BOOK_CODES = [
  'GEN', 'EXO', 'LEV', 'NUM', 'DEU', 'JOS', 'JDG', 'RUT', '1SA', '2SA', '1KI', '2KI', '1CH',
  '2CH', 'EZR', 'NEH', 'EST', 'JOB', 'PSA', 'PRO', 'ECC', 'SNG', 'ISA', 'JER', 'LAM', 'EZK',
  'DAN', 'HOS', 'JOL', 'AMO', 'OBA', 'JON', 'MIC', 'NAM', 'HAB', 'ZEP', 'HAG', 'ZEC', 'MAL',
  'MAT', 'MRK', 'LUK', 'JHN', 'ACT', 'ROM', '1CO', '2CO', 'GAL', 'EPH', 'PHP', 'COL', '1TH',
  '2TH', '1TI', '2TI', 'TIT', 'PHM', 'HEB', 'JAS', '1PE', '2PE', '1JN', '2JN', '3JN', 'JUD',
  'REV',
] as const; // prettier-ignore

export type BookCode = (typeof BOOK_CODES)[number];

export interface Book {
  code: BookCode;
  /** 1 (Genesis) to 66 (Revelation); the high part of a verse ordinal. */
  index: number;
  testament: 'OT' | 'NT';
  /** Display name: "1 John", "Song of Solomon". */
  name: string;
  /** Name used before a chapter in a reference, when it differs: "Psalm 23", not "Psalms 23". */
  refName: string;
  /** 1, 2 or 3 for numbered books (1 Samuel … 3 John). */
  number?: 1 | 2 | 3;
  /** Every accepted spelling, normalised by `bookKey`: "1john", "1jn", "1jo", … */
  aliases: readonly string[];
  /** Verses per chapter (index 0 = chapter 1), in the numbering the translations share (KJV). */
  verses: readonly number[];
}

interface BookSpec {
  name: string;
  refName?: string;
  /** Spellings without the book number, which `bookKey` adds for numbered books. */
  aliases: string[];
}

// Aliases are written as `bookKey` leaves them: lower case, no spaces or full stops. The USFM code
// is added automatically, except JUD: "Jud" is as often Judges, so it stays ambiguous.
const SPECS: Record<BookCode, BookSpec> = {
  GEN: { name: 'Genesis', aliases: ['genesis', 'gen', 'ge', 'gn'] },
  EXO: { name: 'Exodus', aliases: ['exodus', 'exod', 'ex'] },
  LEV: { name: 'Leviticus', aliases: ['leviticus', 'lev', 'le', 'lv'] },
  NUM: { name: 'Numbers', aliases: ['numbers', 'num', 'nu', 'nm', 'nb'] },
  DEU: { name: 'Deuteronomy', aliases: ['deuteronomy', 'deut', 'de', 'dt'] },
  JOS: { name: 'Joshua', aliases: ['joshua', 'josh', 'jsh'] },
  JDG: { name: 'Judges', aliases: ['judges', 'judg', 'jg', 'jdgs'] },
  RUT: { name: 'Ruth', aliases: ['ruth', 'rth', 'ru'] },
  '1SA': { name: '1 Samuel', aliases: ['samuel', 'sam', 'sa', 'sm'] },
  '2SA': { name: '2 Samuel', aliases: ['samuel', 'sam', 'sa', 'sm'] },
  '1KI': { name: '1 Kings', aliases: ['kings', 'kgs', 'kin', 'ki', 'kngs'] },
  '2KI': { name: '2 Kings', aliases: ['kings', 'kgs', 'kin', 'ki', 'kngs'] },
  '1CH': { name: '1 Chronicles', aliases: ['chronicles', 'chron', 'chr', 'ch'] },
  '2CH': { name: '2 Chronicles', aliases: ['chronicles', 'chron', 'chr', 'ch'] },
  EZR: { name: 'Ezra', aliases: ['ezra'] },
  NEH: { name: 'Nehemiah', aliases: ['nehemiah', 'neh', 'ne'] },
  EST: { name: 'Esther', aliases: ['esther', 'esth', 'es'] },
  JOB: { name: 'Job', aliases: ['job', 'jb'] },
  PSA: {
    name: 'Psalms',
    refName: 'Psalm',
    aliases: ['psalms', 'psalm', 'ps', 'psm', 'pss', 'pslm'],
  },
  PRO: { name: 'Proverbs', aliases: ['proverbs', 'prov', 'pr', 'prv'] },
  ECC: {
    name: 'Ecclesiastes',
    aliases: ['ecclesiastes', 'eccles', 'eccl', 'ec', 'qoheleth', 'qoh'],
  },
  SNG: {
    name: 'Song of Solomon',
    aliases: ['songofsolomon', 'songofsongs', 'songs', 'song', 'sos', 'canticles', 'cant'],
  },
  ISA: { name: 'Isaiah', aliases: ['isaiah', 'is'] },
  JER: { name: 'Jeremiah', aliases: ['jeremiah', 'jer', 'je', 'jr'] },
  LAM: { name: 'Lamentations', aliases: ['lamentations', 'lam', 'la'] },
  EZK: { name: 'Ezekiel', aliases: ['ezekiel', 'ezek', 'eze'] },
  DAN: { name: 'Daniel', aliases: ['daniel', 'dan', 'da', 'dn'] },
  HOS: { name: 'Hosea', aliases: ['hosea', 'hos', 'ho'] },
  JOL: { name: 'Joel', aliases: ['joel', 'jl'] },
  AMO: { name: 'Amos', aliases: ['amos', 'am'] },
  OBA: { name: 'Obadiah', aliases: ['obadiah', 'obad', 'ob'] },
  JON: { name: 'Jonah', aliases: ['jonah', 'jnh'] },
  MIC: { name: 'Micah', aliases: ['micah', 'mc'] },
  NAM: { name: 'Nahum', aliases: ['nahum', 'nah', 'na'] },
  HAB: { name: 'Habakkuk', aliases: ['habakkuk', 'hab', 'hb'] },
  ZEP: { name: 'Zephaniah', aliases: ['zephaniah', 'zeph', 'zp'] },
  HAG: { name: 'Haggai', aliases: ['haggai', 'hag', 'hg'] },
  ZEC: { name: 'Zechariah', aliases: ['zechariah', 'zech', 'zc'] },
  MAL: { name: 'Malachi', aliases: ['malachi', 'mal', 'ml'] },
  MAT: { name: 'Matthew', aliases: ['matthew', 'matt', 'mt'] },
  MRK: { name: 'Mark', aliases: ['mark', 'mk', 'mr'] },
  LUK: { name: 'Luke', aliases: ['luke', 'lk'] },
  JHN: { name: 'John', aliases: ['john', 'jn', 'joh'] },
  ACT: { name: 'Acts', aliases: ['acts', 'ac'] },
  ROM: { name: 'Romans', aliases: ['romans', 'rom', 'ro', 'rm'] },
  '1CO': { name: '1 Corinthians', aliases: ['corinthians', 'cor', 'co'] },
  '2CO': { name: '2 Corinthians', aliases: ['corinthians', 'cor', 'co'] },
  GAL: { name: 'Galatians', aliases: ['galatians', 'gal', 'ga'] },
  EPH: { name: 'Ephesians', aliases: ['ephesians', 'ephes', 'eph'] },
  PHP: { name: 'Philippians', aliases: ['philippians', 'phil', 'pp'] },
  COL: { name: 'Colossians', aliases: ['colossians', 'col'] },
  '1TH': { name: '1 Thessalonians', aliases: ['thessalonians', 'thess', 'thes', 'th'] },
  '2TH': { name: '2 Thessalonians', aliases: ['thessalonians', 'thess', 'thes', 'th'] },
  '1TI': { name: '1 Timothy', aliases: ['timothy', 'tim', 'ti', 'tm'] },
  '2TI': { name: '2 Timothy', aliases: ['timothy', 'tim', 'ti', 'tm'] },
  TIT: { name: 'Titus', aliases: ['titus'] },
  PHM: { name: 'Philemon', aliases: ['philemon', 'philem', 'phlm', 'pm'] },
  HEB: { name: 'Hebrews', aliases: ['hebrews', 'heb'] },
  JAS: { name: 'James', aliases: ['james', 'jas', 'jm'] },
  '1PE': { name: '1 Peter', aliases: ['peter', 'pet', 'pe', 'pt'] },
  '2PE': { name: '2 Peter', aliases: ['peter', 'pet', 'pe', 'pt'] },
  '1JN': { name: '1 John', aliases: ['john', 'jn', 'jhn', 'joh', 'jo'] },
  '2JN': { name: '2 John', aliases: ['john', 'jn', 'jhn', 'joh', 'jo'] },
  '3JN': { name: '3 John', aliases: ['john', 'jn', 'jhn', 'joh', 'jo'] },
  JUD: { name: 'Jude', aliases: ['jude', 'jd'] },
  REV: {
    name: 'Revelation',
    aliases: ['revelation', 'revelations', 'rev', 're', 'rv', 'apocalypse'],
  },
};

const ORDINAL_WORDS: Record<string, 1 | 2 | 3> = {
  i: 1,
  ii: 2,
  iii: 3,
  first: 1,
  second: 2,
  third: 3,
  '1st': 1,
  '2nd': 2,
  '3rd': 3,
};

/**
 * Normalises a book name for lookup: lower case, without full stops or spaces, with a leading
 * book number written as a digit. "1 Jn", "I John", "First John" and "1st Jn." all give "1j…".
 * Roman numerals and words count only when a space or full stop follows, so "Isaiah" stays.
 */
export function bookKey(name: string): string {
  let text = name.toLowerCase().replaceAll('.', ' ').trim();
  const match = /^(iii|ii|i|first|second|third|1st|2nd|3rd)\s+/.exec(text);
  if (match?.[1]) text = `${ORDINAL_WORDS[match[1]]}${text.slice(match[0].length)}`;
  return text.replaceAll(/\s+/g, '');
}

export const BOOKS: readonly Book[] = BOOK_CODES.map((code, i) => {
  const spec = SPECS[code];
  const number = /^[1-3]/.test(code) ? (Number(code[0]) as 1 | 2 | 3) : undefined;
  const prefix = number ?? '';
  const aliases = new Set(spec.aliases.map((alias) => `${prefix}${alias}`));
  if (code !== 'JUD') aliases.add(code.toLowerCase());
  return {
    code,
    index: i + 1,
    testament: i < 39 ? 'OT' : 'NT',
    name: spec.name,
    refName: spec.refName ?? spec.name,
    ...(number ? { number } : {}),
    aliases: [...aliases],
    verses: VERSE_COUNTS[code],
  };
});

const BY_CODE = new Map<string, Book>(BOOKS.map((book) => [book.code, book]));

export function isBookCode(code: string): code is BookCode {
  return BY_CODE.has(code);
}

export function getBook(code: BookCode): Book {
  return BY_CODE.get(code)!;
}

export function bookByIndex(index: number): Book | undefined {
  return BOOKS[index - 1];
}

export function chapterCount(code: BookCode): number {
  return getBook(code).verses.length;
}

/** Verses in a chapter, or 0 if the chapter doesn't exist. */
export function verseCount(code: BookCode, chapter: number): number {
  return getBook(code).verses[chapter - 1] ?? 0;
}
