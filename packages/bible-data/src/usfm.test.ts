import { describe, expect, it } from 'vitest';
import { parseUsfm, tokenize } from './usfm.ts';

const book = (body: string) =>
  parseUsfm(`\\id PSA World English Bible (WEB)\n\\ide UTF-8\n\\h Psalms\n${body}`);

describe('tokenize', () => {
  it('drops an opening marker’s delimiting space but keeps a space after a closing marker', () => {
    expect(tokenize('a \\w b\\w* c')).toEqual([
      { text: 'a ' },
      { marker: 'w', closing: false },
      { text: 'b' },
      { marker: 'w', closing: true },
      { text: ' c' },
    ]);
  });
});

describe('parseUsfm', () => {
  it('reads the book code, chapters and verses', () => {
    const parsed = book('\\c 1\n\\p\n\\v 1 One.\n\\v 2 Two.\n\\c 2\n\\p\n\\v 1 Three.');
    expect(parsed).toEqual({ code: 'PSA', c: [['One.', 'Two.'], ['Three.']] });
  });

  it('keeps the words of \\w markup and drops the Strong’s numbers', () => {
    const parsed = book(
      '\\c 1\n\\v 1 \\w Blessed|strong="H835"\\w* \\w is|strong="H1870"\\w* the man.',
    );
    expect(parsed.c[0]).toEqual(['Blessed is the man.']);
  });

  it('keeps nested \\+w words and the words of Jesus', () => {
    const parsed = book('\\c 1\n\\v 1 \\wj “\\+w Follow|strong="G1205"\\+w* me.”\\wj*');
    expect(parsed.c[0]).toEqual(['“Follow me.”']);
  });

  it('removes footnotes and cross references with their content', () => {
    const parsed = book(
      '\\c 1\n\\v 1 Yahweh’s\\f + \\fr 1:2 \\ft “Yahweh” is God’s proper Name.\\f* law\\x - \\xo 1:1 \\xt Ps 2:1\\x*.',
    );
    expect(parsed.c[0]).toEqual(['Yahweh’s law.']);
    expect(parsed.n).toBeUndefined();
  });

  it('joins poetry lines and paragraphs with one space', () => {
    const parsed = book('\\c 1\n\\q1\n\\v 1 Line one,  \n\\q2 line two.   \n\\b\n\\p\n\\v 2 Next.');
    expect(parsed.c[0]).toEqual(['Line one, line two.', 'Next.']);
  });

  it('keeps Selah and other character styles as text', () => {
    const parsed = book('\\c 1\n\\v 1 holy hill. \\qs Selah.\\qs* \\bk Jashar\\bk* \\k Abba\\k*');
    expect(parsed.c[0]).toEqual(['holy hill. Selah. Jashar Abba']);
  });

  it('drops headings, speakers and book titles', () => {
    const parsed = book(
      '\\toc1 The Psalms\n\\mt1 The Psalms\n\\cl Psalm\n\\c 1\n\\ms1 BOOK 1\n\\s1 A heading\n\\p\n\\v 1 One.\n\\sp Beloved\n\\q1\n\\v 2 Two.',
    );
    expect(parsed.c[0]).toEqual(['One.', 'Two.']);
  });

  it('continues a verse after a heading inside it', () => {
    const parsed = book('\\c 1\n\\p\n\\v 1 Before\n\\s1 Heading\n\\p after.');
    expect(parsed.c[0]).toEqual(['Before after.']);
  });

  it('keeps titles outside the verse numbering, by the verse they precede', () => {
    const parsed = book(
      '\\c 3\n\\d A Psalm by \\w David|strong="H1732"\\w*.\n\\q1\n\\v 1 Yahweh.\n\\d BETH\n\\q1\n\\v 2 How.',
    );
    expect(parsed.d).toEqual({ '3:1': 'A Psalm by David.', '3:2': 'BETH' });
    expect(parsed.c[2]).toEqual(['Yahweh.', 'How.']);
  });

  it('keeps an empty verse as "" with its footnote, minus the reference', () => {
    const parsed = book(
      '\\c 8\n\\v 36 Water.\n\\v 37 \\f + \\fr 8:37 \\ft TR adds \\fqa Philip said, “If you believe.”\\f*\n\\v 38 He commanded.',
    );
    expect(parsed.c[7]).toEqual([...Array.from({ length: 35 }), 'Water.', '', 'He commanded.']);
    expect(parsed.n).toEqual({ '8:37': 'TR adds Philip said, “If you believe.”' });
  });

  it.each([
    ['an unknown marker', '\\c 1\n\\v 1 x \\zz y', 'Unknown USFM marker \\zz in PSA 1:1'],
    ['a stray closing marker', '\\c 1\n\\v 1 x \\p* y', 'Unexpected \\p* in PSA 1:1'],
    ['a verse without a number', '\\c 1\n\\v x', '\\v without a number in PSA 1'],
    ['a chapter without a number', '\\c x', '\\c without a number in PSA'],
  ])('rejects %s', (_, body, message) => {
    expect(() => book(body)).toThrow(message);
  });
});
