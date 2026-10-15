import { describe, expect, it } from 'vitest';
import { BOOKS, type BookCode } from './books.ts';
import {
  type ParseError,
  describeParseError,
  editDistance,
  matchBooks,
  parseReference,
  suggest,
} from './parse-reference.ts';
import type { Passage } from './verse-ref.ts';

// Input → the display text of the parsed reference.
const VALID: [string, string][] = [
  // forms
  ['Rom 8:28', 'Romans 8:28'],
  ['Rom 8:28-30', 'Romans 8:28–30'],
  ['Rom 8:28–30', 'Romans 8:28–30'],
  ['Rom 8:28—30', 'Romans 8:28–30'],
  ['Rom 8:28‑30', 'Romans 8:28–30'],
  ['Rom 8:28 - 30', 'Romans 8:28–30'],
  ['Rom 8 : 28', 'Romans 8:28'],
  ['Rom8:28', 'Romans 8:28'],
  ['rom 8.28', 'Romans 8:28'],
  ['Rom 8.28-30', 'Romans 8:28–30'],
  ['ROMANS 8:28', 'Romans 8:28'],
  ['  Rom 8:28  ', 'Romans 8:28'],
  ['Rom. 8:1', 'Romans 8:1'],
  ['Romans 8', 'Romans 8'],
  ['Romans 8-9', 'Romans 8–9'],
  ['Romans 8 – 9', 'Romans 8–9'],
  ['Romans 1:1-16:25', 'Romans 1:1–16:25'],
  ['Rom 8:38–9:5', 'Romans 8:38–9:5'],
  ['Rom 8:38-9:5', 'Romans 8:38–9:5'],
  ['Rom 8:38 – 9:5', 'Romans 8:38–9:5'],
  ['Rom 8.38-9.5', 'Romans 8:38–9:5'],
  ['Rom 8:28-8:30', 'Romans 8:28–30'],
  ['Rom 8:28-28', 'Romans 8:28'],
  ['Rom 8-8', 'Romans 8'],
  ['Rom 8:28a', 'Romans 8:28'],
  ['Rom 8:28b-30a', 'Romans 8:28–30'],
  ['Rom 16:24', 'Romans 16:24'],
  ['Rom 16:25-27', 'Romans 16:25–27'],
  ['Ro 8', 'Romans 8'],
  ['Rm 8', 'Romans 8'],
  ['Roma 8', 'Romans 8'],
  ['romns 8', 'Romans 8'],
  ['Romasn 8', 'Romans 8'],
  ['Rmoans 12:1-2', 'Romans 12:1–2'],
  // Old Testament
  ['Gen 1:1', 'Genesis 1:1'],
  ['Gn 1:1', 'Genesis 1:1'],
  ['Ge 1', 'Genesis 1'],
  ['Genesis 50:26', 'Genesis 50:26'],
  ['Genisis 1', 'Genesis 1'],
  ['Genesis 1-3', 'Genesis 1–3'],
  ['Exod 20:1-17', 'Exodus 20:1–17'],
  ['Ex 3', 'Exodus 3'],
  ['Exo 14:14', 'Exodus 14:14'],
  ['Lev 19:18', 'Leviticus 19:18'],
  ['Num 6:24-26', 'Numbers 6:24–26'],
  ['Nm 6', 'Numbers 6'],
  ['Deut 6:4-9', 'Deuteronomy 6:4–9'],
  ['Dt 6:4', 'Deuteronomy 6:4'],
  ['dueteronomy 6', 'Deuteronomy 6'],
  ['Josh 1:9', 'Joshua 1:9'],
  ['Judg 6', 'Judges 6'],
  ['Judges 21:25', 'Judges 21:25'],
  ['Ruth 1:16', 'Ruth 1:16'],
  ['1 Sam 17', '1 Samuel 17'],
  ['1Sam 17', '1 Samuel 17'],
  ['1 S 17', '1 Samuel 17'],
  ['I Sam 17', '1 Samuel 17'],
  ['First Samuel 17', '1 Samuel 17'],
  ['1st Samuel 17:45', '1 Samuel 17:45'],
  ['2 Sam 7:12-16', '2 Samuel 7:12–16'],
  ['II Samuel 7', '2 Samuel 7'],
  ['Second Samuel 7', '2 Samuel 7'],
  ['2nd Sam 7', '2 Samuel 7'],
  ['1 Kgs 19', '1 Kings 19'],
  ['1 Kings 19:11-13', '1 Kings 19:11–13'],
  ['2 Ki 2', '2 Kings 2'],
  ['1 Chr 16:34', '1 Chronicles 16:34'],
  ['2 Chron 7:14', '2 Chronicles 7:14'],
  ['Ezra 7:10', 'Ezra 7:10'],
  ['Neh 8:10', 'Nehemiah 8:10'],
  ['Esth 4:14', 'Esther 4:14'],
  ['Job 19:25', 'Job 19:25'],
  ['Job 42', 'Job 42'],
  ['Ps 23', 'Psalm 23'],
  ['Psalm 23:1', 'Psalm 23:1'],
  ['Psalms 23', 'Psalm 23'],
  ['Ps 119:105', 'Psalm 119:105'],
  ['Ps 119:176', 'Psalm 119:176'],
  ['Ps 23 : 1 - 3', 'Psalm 23:1–3'],
  ['Pss 1-2', 'Psalms 1–2'],
  ['Psa 150', 'Psalm 150'],
  ['Prov 3:5-6', 'Proverbs 3:5–6'],
  ['Pr 31', 'Proverbs 31'],
  ['Eccl 3:1', 'Ecclesiastes 3:1'],
  ['Ecclesiates 3', 'Ecclesiastes 3'],
  ['Song 2:4', 'Song of Solomon 2:4'],
  ['Song of Songs 2:4', 'Song of Solomon 2:4'],
  ['Song of Solomon 8:6-7', 'Song of Solomon 8:6–7'],
  ['SOS 2', 'Song of Solomon 2'],
  ['Canticles 1', 'Song of Solomon 1'],
  ['Isa 53:5', 'Isaiah 53:5'],
  ['Is 40:31', 'Isaiah 40:31'],
  ['Isiah 9:6', 'Isaiah 9:6'],
  ['Jer 29:11', 'Jeremiah 29:11'],
  ['Lam 3:22-23', 'Lamentations 3:22–23'],
  ['Ezek 37', 'Ezekiel 37'],
  ['Ezk 36:26', 'Ezekiel 36:26'],
  ['Dan 3', 'Daniel 3'],
  ['Hos 6:6', 'Hosea 6:6'],
  ['Joel 2:28', 'Joel 2:28'],
  ['Amos 5:24', 'Amos 5:24'],
  ['Obadiah', 'Obadiah'],
  ['Obad 1', 'Obadiah 1'],
  ['Obadiah 1:15', 'Obadiah 15'],
  ['Jonah 2', 'Jonah 2'],
  ['Mic 6:8', 'Micah 6:8'],
  ['Nah 1:7', 'Nahum 1:7'],
  ['Hab 2:4', 'Habakkuk 2:4'],
  ['Habakuk 3:17-19', 'Habakkuk 3:17–19'],
  ['Zeph 3:17', 'Zephaniah 3:17'],
  ['Hag 2', 'Haggai 2'],
  ['Zech 9:9', 'Zechariah 9:9'],
  ['Mal 3:10', 'Malachi 3:10'],
  ['Mal 4:6', 'Malachi 4:6'],
  // New Testament
  ['Matt 5:3-12', 'Matthew 5:3–12'],
  ['Mt 28:19-20', 'Matthew 28:19–20'],
  ['Mathew 5', 'Matthew 5'],
  ['Mark 1', 'Mark 1'],
  ['Mk 10:45', 'Mark 10:45'],
  ['Luke 15', 'Luke 15'],
  ['Lk 2:1-20', 'Luke 2:1–20'],
  ['John 3:16', 'John 3:16'],
  ['Jn 1:1', 'John 1:1'],
  ['Jhon 3:16', 'John 3:16'],
  ['John 21:25', 'John 21:25'],
  ['Acts 2:38', 'Acts 2:38'],
  ['Ac 1:8', 'Acts 1:8'],
  ['1 Cor 13', '1 Corinthians 13'],
  ['1 Corinthians 13:4-7', '1 Corinthians 13:4–7'],
  ['1 Corinthans 13', '1 Corinthians 13'],
  ['2 Cor 5:17', '2 Corinthians 5:17'],
  ['Gal 2:20', 'Galatians 2:20'],
  ['Eph 2:8-9', 'Ephesians 2:8–9'],
  ['Phil 4:13', 'Philippians 4:13'],
  ['Php 4:6', 'Philippians 4:6'],
  ['Philipians 2', 'Philippians 2'],
  ['Col 3:23', 'Colossians 3:23'],
  ['1 Thess 5:16-18', '1 Thessalonians 5:16–18'],
  ['2 Thess 3:10', '2 Thessalonians 3:10'],
  ['1 Tim 2:5', '1 Timothy 2:5'],
  ['2 Tim 3:16-17', '2 Timothy 3:16–17'],
  ['Titus 2:11', 'Titus 2:11'],
  ['Tit 3:5', 'Titus 3:5'],
  ['Ti 3', 'Titus 3'],
  ['Philem 6', 'Philemon 6'],
  ['Phlm 1:6', 'Philemon 6'],
  ['Heb 11:1', 'Hebrews 11:1'],
  ['Heb 4:12', 'Hebrews 4:12'],
  ['Jas 1:22', 'James 1:22'],
  ['James 2', 'James 2'],
  ['1 Pet 5:7', '1 Peter 5:7'],
  ['2 Pet 3:9', '2 Peter 3:9'],
  ['1 Jn 1:9', '1 John 1:9'],
  ['1 Jn 3', '1 John 3'],
  ['1Jn 4:8', '1 John 4:8'],
  ['1Jn3', '1 John 3'],
  ['I John 4:19', '1 John 4:19'],
  ['First John 1', '1 John 1'],
  ['1st Jn 1', '1 John 1'],
  ['1 Jhon 1', '1 John 1'],
  ['2 Jn 6', '2 John 6'],
  ['3 Jn 2', '3 John 2'],
  ['3 John 1:14', '3 John 14'],
  ['Jude', 'Jude'],
  ['Jude 3', 'Jude 3'],
  ['Jude 24-25', 'Jude 24–25'],
  ['Jude 1:3', 'Jude 3'],
  ['Jude 1:24-25', 'Jude 24–25'],
  ['Rev 21:4', 'Revelation 21:4'],
  ['Revelation 22', 'Revelation 22'],
  ['Revelations 3:20', 'Revelation 3:20'],
  ['Revelaton 1', 'Revelation 1'],
  ['Apocalypse 1', 'Revelation 1'],
  ['Rev 22:21', 'Revelation 22:21'],
];

// Input → the expected error (only the listed fields are compared).
const ERRORS: [string, Partial<ParseError> & Pick<ParseError, 'code'>][] = [
  ['', { code: 'empty' }],
  ['   ', { code: 'empty' }],
  ['8:28', { code: 'syntax' }],
  ['3', { code: 'syntax' }],
  ['Rom 8:28,30', { code: 'syntax' }],
  ['Rom 8:28;30', { code: 'syntax' }],
  ['Rom 8:28-30-32', { code: 'syntax' }],
  ['Rom 8-9:5', { code: 'syntax' }],
  ['Rom 8::28', { code: 'syntax' }],
  ['Rom 8:28-', { code: 'syntax' }],
  ['Rom 8:', { code: 'syntax' }],
  ['Rom 8:28c', { code: 'syntax' }],
  ['Rom 8 28', { code: 'syntax' }],
  ['Rom 8:28 Gal 2:20', { code: 'syntax' }],
  ['Rom', { code: 'missing-chapter', book: 'ROM' }],
  ['Romans', { code: 'missing-chapter', book: 'ROM' }],
  ['1 John', { code: 'missing-chapter', book: '1JN' }],
  ['Xyz 3', { code: 'unknown-book', book: 'Xyz' }],
  ['Bob 1', { code: 'unknown-book' }],
  ['Foobar 1', { code: 'unknown-book' }],
  ['Hezekiah 3', { code: 'unknown-book' }],
  ['4 John 1', { code: 'unknown-book' }],
  ['1 Rom 8', { code: 'unknown-book' }],
  ['3 Sam 1', { code: 'unknown-book' }],
  ['Jo 3', { code: 'ambiguous-book', candidates: ['JOS', 'JOB', 'JOL', 'JON', 'JHN'] }],
  ['Jud 3', { code: 'ambiguous-book', candidates: ['JDG', 'JUD'] }],
  ['Ju 3', { code: 'ambiguous-book', candidates: ['JDG', 'JUD'] }],
  ['Ph 1', { code: 'ambiguous-book', candidates: ['PHP', 'PHM'] }],
  ['Ma 1', { code: 'ambiguous-book', candidates: ['MAL', 'MAT', 'MRK'] }],
  ['Sam 3', { code: 'ambiguous-book', candidates: ['1SA', '2SA'] }],
  ['Kings 3', { code: 'ambiguous-book', candidates: ['1KI', '2KI'] }],
  ['Cor 13', { code: 'ambiguous-book', candidates: ['1CO', '2CO'] }],
  ['Corinthans 13', { code: 'ambiguous-book', candidates: ['1CO', '2CO'] }],
  ['Tim 3', { code: 'ambiguous-book', candidates: ['1TI', '2TI'] }],
  ['Peter 1', { code: 'ambiguous-book', candidates: ['1PE', '2PE'] }],
  ['Rom 17', { code: 'chapter-out-of-range', book: 'ROM', chapter: 17, max: 16 }],
  ['Rom 0', { code: 'chapter-out-of-range', chapter: 0 }],
  ['Rom 8:38-17:1', { code: 'chapter-out-of-range', chapter: 17 }],
  ['Rom 8-17', { code: 'chapter-out-of-range', chapter: 17 }],
  ['Ps 151', { code: 'chapter-out-of-range', book: 'PSA', max: 150 }],
  ['Mal 5', { code: 'chapter-out-of-range', book: 'MAL', max: 4 }],
  ['Jude 2:1', { code: 'chapter-out-of-range', book: 'JUD', max: 1 }],
  ['Rom 8:40', { code: 'verse-out-of-range', chapter: 8, verse: 40, max: 39 }],
  ['Rom 8:0', { code: 'verse-out-of-range', verse: 0 }],
  ['Rom 8:28-40', { code: 'verse-out-of-range', verse: 40 }],
  ['Rom 8:38-9:40', { code: 'verse-out-of-range', chapter: 9, verse: 40, max: 33 }],
  ['Ps 119:177', { code: 'verse-out-of-range', max: 176 }],
  ['3 Jn 15', { code: 'verse-out-of-range', book: '3JN', max: 14 }],
  ['Jude 26', { code: 'verse-out-of-range', book: 'JUD', max: 25 }],
  ['Rom 8:30-28', { code: 'range-reversed' }],
  ['Rom 9:1-8:5', { code: 'range-reversed' }],
  ['Rom 9-8', { code: 'range-reversed' }],
  ['Jude 5-3', { code: 'range-reversed' }],
];

// The fields behind each shape, so the display tests above can trust them.
const SHAPES: [string, Passage][] = [
  ['Rom 8', { book: 'ROM', chapter: 8 }],
  ['Rom 8:28', { book: 'ROM', chapter: 8, verseStart: 28 }],
  ['Rom 8:28-30', { book: 'ROM', chapter: 8, verseStart: 28, verseEnd: 30 }],
  ['Rom 8-9', { book: 'ROM', chapter: 8, chapterEnd: 9 }],
  ['Rom 8:38–9:5', { book: 'ROM', chapter: 8, verseStart: 38, chapterEnd: 9, verseEnd: 5 }],
  ['Rom 8:28-8:30', { book: 'ROM', chapter: 8, verseStart: 28, verseEnd: 30 }],
  ['Rom 8:28-28', { book: 'ROM', chapter: 8, verseStart: 28 }],
  ['Rom 8-8', { book: 'ROM', chapter: 8 }],
  ['Jude', { book: 'JUD', chapter: 1 }],
  ['Jude 3', { book: 'JUD', chapter: 1, verseStart: 3 }],
  ['Jude 3-5', { book: 'JUD', chapter: 1, verseStart: 3, verseEnd: 5 }],
  ['Jude 1:3', { book: 'JUD', chapter: 1, verseStart: 3 }],
];

const displays = (input: string, limit?: number) => suggest(input, limit).map((s) => s.ref.display);
const codes = (name: string): BookCode[] => matchBooks(name).map((m) => m.book.code);

describe('parseReference', () => {
  it('has a table of at least 200 cases', () => {
    expect(VALID.length + ERRORS.length + SHAPES.length).toBeGreaterThanOrEqual(200);
  });

  it.each(VALID)('%j → %s', (input, display) => {
    const result = parseReference(input);
    expect(result.ok ? result.ref.display : result.error).toBe(display);
  });

  it.each(ERRORS)('%j fails with %j', (input, error) => {
    const result = parseReference(input);
    expect(result.ok ? result.ref : result.error).toMatchObject(error);
  });

  it.each(SHAPES)('%j has the fields %j', (input, passage) => {
    const result = parseReference(input);
    expect(result.ok && result.ref).toEqual({ ...passage, display: expect.any(String) });
  });

  // Every spelling in the table, each with a chapter (or a verse, for one-chapter books).
  const aliases = BOOKS.flatMap((book) => book.aliases.map((alias) => [alias, book.code] as const));
  it.each(aliases)('the alias %j finds %s', (alias, code) => {
    const result = parseReference(`${alias} 1`);
    expect(result.ok && result.ref.book).toBe(code);
  });

  it.each(BOOKS.map((book) => [book.name, book.code] as const))(
    'the name %j finds %s, through to its last chapter and verse',
    (name, code) => {
      const book = BOOKS.find((b) => b.code === code)!;
      const chapter = book.verses.length;
      const verse = book.verses.at(-1)!;
      const result = parseReference(`${name} ${chapter}:1-${verse}`);
      const ref = { book: code, chapter, verseStart: 1, verseEnd: verse };
      expect(result.ok && result.ref).toMatchObject(ref);
    },
  );
});

describe('suggest', () => {
  it.each([
    ['Rom 8:28-30', ['Romans 8:28–30']],
    ['1 Jn 3', ['1 John 3']],
    ['romns 8', ['Romans 8']],
    ['Rom 8:38–9:5', ['Romans 8:38–9:5']],
    ['Jo 3', ['Joshua 3', 'Job 3', 'Joel 3', 'Jonah 3', 'John 3']],
    ['Jo 30', ['Job 30']],
    ['Sam 3', ['1 Samuel 3', '2 Samuel 3']],
    ['Rom 8:', ['Romans 8']],
    ['Rom 8:28-', ['Romans 8:28']],
    ['Rom 8:28 – ', ['Romans 8:28']],
    ['Rom', ['Romans 1']],
    ['Jude', ['Jude']],
    ['Ju 4', ['Judges 4', 'Jude 4']],
    ['Rom 17', []],
    ['Rom 8:28,30', []],
    ['Xyz 1', []],
    ['', []],
    ['8:28', []],
  ] as const)('%j → %j', (input, expected) => {
    expect(displays(input)).toEqual(expected);
  });

  it('stops at the limit', () => {
    expect(displays('Jo 3', 2)).toEqual(['Joshua 3', 'Job 3']);
  });

  it('says how the book matched', () => {
    expect(suggest('Romans 8')[0]?.match).toBe('exact');
    expect(suggest('Roma 8')[0]?.match).toBe('prefix');
    expect(suggest('romns 8')[0]?.match).toBe('fuzzy');
  });
});

describe('matchBooks', () => {
  it.each([
    ['John', ['JHN']],
    ['jhon', ['JHN']],
    ['1 jhon', ['1JN']],
    ['jo', ['JOS', 'JOB', 'JOL', 'JON', 'JHN']],
    ['sam', ['1SA', '2SA']],
    ['2 sam', ['2SA']],
    ['jobe', ['JOB']],
    ['joshau', ['JOS']],
    ['1', []],
    ['', []],
    ['xyz', []],
    ['zzzzzz', []],
  ] as const)('%j → %j', (name, expected) => {
    expect(codes(name)).toEqual(expected);
  });
});

describe('editDistance', () => {
  it.each([
    ['john', 'john', 0],
    ['john', 'jhon', 1],
    ['romns', 'romans', 1],
    ['kitten', 'sitting', 3],
    ['', 'abc', 3],
    ['abc', '', 3],
  ] as const)('%j ↔ %j = %i', (a, b, distance) => {
    expect(editDistance(a, b)).toBe(distance);
  });
});

describe('describeParseError', () => {
  it.each<[string, string]>([
    ['', 'Type a reference, like Romans 8:28.'],
    ['8:28', '“8:28” isn’t a reference. Try a form like Romans 8:28–30.'],
    ['Xyz 3', 'No book matches “Xyz”.'],
    ['Jo 3', '“Jo” could be Joshua, Job, Joel, Jonah or John.'],
    ['Ph 1', '“Ph” could be Philippians or Philemon.'],
    ['Rom', 'Add a chapter to Romans.'],
    ['Rom 17', 'Romans has 16 chapters.'],
    ['Ps 23:7', 'Psalm 23 has 6 verses.'],
    ['Rom 8:30-28', 'The end of the range comes before its start.'],
  ])('%j → %s', (input, message) => {
    const result = parseReference(input);
    expect(result.ok ? result.ref : describeParseError(result.error)).toBe(message);
  });

  it('covers a passage with an invalid shape', () => {
    expect(describeParseError({ code: 'invalid-shape' })).toBe('That reference isn’t complete.');
  });
});
