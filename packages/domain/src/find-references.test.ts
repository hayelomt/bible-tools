import { describe, expect, it } from 'vitest';
import { findReferences } from './find-references.ts';

/** Each case: the text, then each reference found as [as written, as displayed]. */
type Case = [text: string, found: Array<[written: string, display: string]>];

const one = (written: string, display = written): Case => [written, [[written, display]]];

const ALONE: Case[] = [
  one('John 3:16'),
  one('Romans 8:28'),
  one('Rom 8:28', 'Romans 8:28'),
  one('Rom. 8:28', 'Romans 8:28'),
  one('Rm 8:28', 'Romans 8:28'),
  one('Gen 1:1', 'Genesis 1:1'),
  one('Gen. 1:1-3', 'Genesis 1:1–3'),
  one('Exod 20:1–17', 'Exodus 20:1–17'),
  one('Ps 23', 'Psalm 23'),
  one('Psalm 23'),
  one('Psalms 119:105', 'Psalm 119:105'),
  one('Prov 3:5-6', 'Proverbs 3:5–6'),
  one('Isaiah 53:5'),
  one('Is 53:5', 'Isaiah 53:5'),
  one('Jer 29:11', 'Jeremiah 29:11'),
  one('Lam 3:22-23', 'Lamentations 3:22–23'),
  one('Ezek 37', 'Ezekiel 37'),
  one('Mic 6:8', 'Micah 6:8'),
  one('Matt 5:3-12', 'Matthew 5:3–12'),
  one('Mt 28:19', 'Matthew 28:19'),
  one('Mark 4:35–41'),
  one('Lk 15', 'Luke 15'),
  one('Jn 1:1', 'John 1:1'),
  one('Acts 2:38'),
  one('Ac 2:38', 'Acts 2:38'),
  one('1 Cor 13', '1 Corinthians 13'),
  one('1 Cor 13:4-7', '1 Corinthians 13:4–7'),
  one('1Cor 13:4', '1 Corinthians 13:4'),
  one('I Cor 13:4', '1 Corinthians 13:4'),
  one('First Corinthians 13:4', '1 Corinthians 13:4'),
  one('1st John 4:8', '1 John 4:8'),
  one('2 Tim 3:16', '2 Timothy 3:16'),
  one('II Timothy 3:16', '2 Timothy 3:16'),
  one('2nd Peter 1:21', '2 Peter 1:21'),
  one('3 John 4', '3 John 4'),
  one('Jude 3'),
  one('Jude 24-25', 'Jude 24–25'),
  one('Phlm 6', 'Philemon 6'),
  one('Obadiah 15'),
  one('Song of Songs 2:4', 'Song of Solomon 2:4'),
  one('Song of Solomon 8:6'),
  one('Rev 21:4', 'Revelation 21:4'),
  one('Heb 11', 'Hebrews 11'),
  one('Eph 2:8-9', 'Ephesians 2:8–9'),
  one('Phil 4:13', 'Philippians 4:13'),
  one('Gal 5:22–23', 'Galatians 5:22–23'),
  one('Jas 1:2', 'James 1:2'),
  one('Rom 8:38–9:5', 'Romans 8:38–9:5'),
  one('Rom 7:24-8:2', 'Romans 7:24–8:2'),
  one('Ps 1-2', 'Psalms 1–2'),
  one('John 3.16', 'John 3:16'),
  one('John 3:16a', 'John 3:16'),
  one('Rom 8:28 – 30', 'Romans 8:28–30'),
  one('Job 38:4'),
];

const IN_SENTENCES: Case[] = [
  ['Paul says in Romans 8:28 that all things work together.', [['Romans 8:28', 'Romans 8:28']]],
  ['(see John 10:11)', [['John 10:11', 'John 10:11']]],
  ['Read Ps 23.', [['Ps 23', 'Psalm 23']]],
  ['“John 3:16” is the best known.', [['John 3:16', 'John 3:16']]],
  [
    'Compare Gen 1:1 with John 1:1.',
    [
      ['Gen 1:1', 'Genesis 1:1'],
      ['John 1:1', 'John 1:1'],
    ],
  ],
  [
    'Today: Isaiah 40:31 and Matthew 11:28-30, then prayer.',
    [
      ['Isaiah 40:31', 'Isaiah 40:31'],
      ['Matthew 11:28-30', 'Matthew 11:28–30'],
    ],
  ],
  ['Sermon on Jn 10:1-18 by Pastor Ann', [['Jn 10:1-18', 'John 10:1–18']]],
  ['The text was Rom. 12:1–2; a call to worship.', [['Rom. 12:1–2', 'Romans 12:1–2']]],
  ['We sang Psalm 100 together', [['Psalm 100', 'Psalm 100']]],
  ['Isaiah 53:5 But he was pierced for our transgressions', [['Isaiah 53:5', 'Isaiah 53:5']]],
  ['Matthew 5:3 — Blessed are the poor in spirit', [['Matthew 5:3', 'Matthew 5:3']]],
  [
    'Romans 8:28 BSB\nAnd we know that God works all things together for the good',
    [['Romans 8:28', 'Romans 8:28']],
  ],
  ['Key verse:John 15:5', [['John 15:5', 'John 15:5']]],
  ['Am I wrong? Amos 5:24 says let justice roll.', [['Amos 5:24', 'Amos 5:24']]],
  ['Am 5:24 is the verse.', [['Am 5:24', 'Amos 5:24']]],
  [
    'Job 1:21 and Job 19:25',
    [
      ['Job 1:21', 'Job 1:21'],
      ['Job 19:25', 'Job 19:25'],
    ],
  ],
  [
    '1 John 1:9; 2 John 6',
    [
      ['1 John 1:9', '1 John 1:9'],
      ['2 John 6', '2 John 6'],
    ],
  ],
  ['Exodus 3 tells of the bush', [['Exodus 3', 'Exodus 3']]],
  [
    'Romans 8:28, 1 Corinthians 13',
    [
      ['Romans 8:28', 'Romans 8:28'],
      ['1 Corinthians 13', '1 Corinthians 13'],
    ],
  ],
];

const LISTS: Case[] = [
  [
    'Romans 8:28, 31–32; 9:1',
    [
      ['Romans 8:28', 'Romans 8:28'],
      ['31–32', 'Romans 8:31–32'],
      ['9:1', 'Romans 9:1'],
    ],
  ],
  [
    'John 3:16, 17',
    [
      ['John 3:16', 'John 3:16'],
      ['17', 'John 3:17'],
    ],
  ],
  [
    'John 3:16; 4:1',
    [
      ['John 3:16', 'John 3:16'],
      ['4:1', 'John 4:1'],
    ],
  ],
  [
    'Ps 23; 91',
    [
      ['Ps 23', 'Psalm 23'],
      ['91', 'Psalm 91'],
    ],
  ],
  [
    'Ps 23, 91',
    [
      ['Ps 23', 'Psalm 23'],
      ['91', 'Psalm 91'],
    ],
  ],
  [
    'Rom 8:38–9:5, 7',
    [
      ['Rom 8:38–9:5', 'Romans 8:38–9:5'],
      ['7', 'Romans 9:7'],
    ],
  ],
  [
    'Gen 1:1, 3, 5',
    [
      ['Gen 1:1', 'Genesis 1:1'],
      ['3', 'Genesis 1:3'],
      ['5', 'Genesis 1:5'],
    ],
  ],
  [
    'Jude 3, 20-21',
    [
      ['Jude 3', 'Jude 3'],
      ['20-21', 'Jude 20–21'],
    ],
  ],
  [
    'Rom 8:28; 1 Cor 13:4',
    [
      ['Rom 8:28', 'Romans 8:28'],
      ['1 Cor 13:4', '1 Corinthians 13:4'],
    ],
  ],
  [
    'Rom 1:16; Gal 2:20; Eph 2:8',
    [
      ['Rom 1:16', 'Romans 1:16'],
      ['Gal 2:20', 'Galatians 2:20'],
      ['Eph 2:8', 'Ephesians 2:8'],
    ],
  ],
  ['Matt 5:3, 2019', [['Matt 5:3', 'Matthew 5:3']]],
  ['John 3:16, and more', [['John 3:16', 'John 3:16']]],
  [
    'John 3:16,17',
    [
      ['John 3:16', 'John 3:16'],
      ['17', 'John 3:17'],
    ],
  ],
  [
    'Readings:\n- Ps 1\n- Rom 12:1-2\n- Jas 1:22',
    [
      ['Ps 1', 'Psalm 1'],
      ['Rom 12:1-2', 'Romans 12:1–2'],
      ['Jas 1:22', 'James 1:22'],
    ],
  ],
];

const NONE: Case[] = [
  ['', []],
  ['No references here at all.', []],
  ['I am 5 minutes late.', []],
  ['Am 5 minutes late.', []],
  ['It Is 3 o’clock.', []],
  ['romans 8:28', []],
  ['rom 8:28', []],
  ['Romns 8:28', []],
  ['Roma 8:28', []],
  ['John 30', []],
  ['Romans 17:1', []],
  ['Jude 30', []],
  ['Mark 4th', []],
  ['Psalm 23rd', []],
  ['Romans', []],
  ['Chapter 3 verse 16', []],
  ['Job 3', []],
  ['1 3:16', []],
  ['Call 555-1234', []],
  ['Meet at 10:30 on Sunday', []],
  ['said John. 3 days later', []],
  ['Rom 8:28th', []],
  ['Sam 3:1', []],
  ['Jud 5', []],
  ['Re 2:1', [['Re 2:1', 'Revelation 2:1']]],
];

describe('findReferences', () => {
  const cases = [...ALONE, ...IN_SENTENCES, ...LISTS, ...NONE];

  it('has at least 100 cases', () => {
    expect(cases.length).toBeGreaterThanOrEqual(100);
  });

  it.each(cases)('%j', (text, expected) => {
    const found = findReferences(text);
    expect(found.map((f) => [f.text, f.ref.display])).toEqual(expected);
    for (const f of found) expect(text.slice(f.from, f.to)).toBe(f.text);
  });

  it('returns the passage of each reference', () => {
    expect(findReferences('see Rom 8:38–9:5, 7')).toEqual([
      {
        from: 4,
        to: 16,
        text: 'Rom 8:38–9:5',
        ref: {
          book: 'ROM',
          chapter: 8,
          verseStart: 38,
          chapterEnd: 9,
          verseEnd: 5,
          display: 'Romans 8:38–9:5',
        },
      },
      {
        from: 18,
        to: 19,
        text: '7',
        ref: { book: 'ROM', chapter: 9, verseStart: 7, display: 'Romans 9:7' },
      },
    ]);
  });
});
