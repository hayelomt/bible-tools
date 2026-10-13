/**
 * Reads one USFM book from eBible.org into verse text (TECH-DESIGN §9). Footnotes, cross
 * references, headings and word-level markup are removed; the words themselves are kept exactly,
 * with each run of whitespace (line and paragraph breaks) collapsed to one space.
 */

/** A book's text as shipped to the device: `c[chapter - 1][verse - 1]`. */
export interface BookText {
  c: string[][];
  /** Titles outside the verse numbering (Psalm titles, the Psalm 119 letters), by the "c:v" they precede. */
  d?: Record<string, string>;
  /** For verses WEB leaves empty: the footnote explaining why, by "c:v". */
  n?: Record<string, string>;
}

export interface UsfmBook extends BookText {
  /** The USFM book code from `\id`. */
  code: string;
}

/** Paragraph and poetry markers: verse text goes on across them. */
const BREAKS = new Set(['p', 'm', 'mi', 'nb', 'pc', 'pi1', 'li1', 'q1', 'q2', 'q3', 'b']);
/** Line markers whose text is not verse text: identification, headings, intros, speakers. */
const DROPPED = new Set(
  'id ide h toc1 toc2 toc3 mt1 mt2 mt3 cl cp ms1 s1 sp ip is1 ili rem'.split(' '),
);
/** Character markers whose content is verse text; only the markers go. */
const INLINE = new Set(['w', '+w', 'wj', 'k', 'qs', 'bk', '+bk', 'add', 'nd', '+wh']);
/** Footnote parts whose text is kept when a footnote is recorded (`fr`, the reference, is not). */
const NOTE_TEXT = new Set(['ft', 'fq', 'fqa', 'fl', '+wh']);

type Token = { text: string } | { marker: string; closing: boolean };

/** Splits USFM into markers and text. An opening marker's one delimiting space is dropped. */
export function tokenize(usfm: string): Token[] {
  const tokens: Token[] = [];
  let last = 0;
  // A closing marker has no delimiter, so a space after it is text.
  for (const match of usfm.matchAll(/\\(\+?[a-z]+\d*)(?:(\*)|\s?)/g)) {
    if (match.index > last) tokens.push({ text: usfm.slice(last, match.index) });
    tokens.push({ marker: match[1]!, closing: match[2] === '*' });
    last = match.index + match[0].length;
  }
  if (last < usfm.length) tokens.push({ text: usfm.slice(last) });
  return tokens;
}

export function parseUsfm(usfm: string): UsfmBook {
  const book: UsfmBook = { code: '', c: [] };
  const tokens = tokenize(usfm);
  let chapter = 0;
  let verse = 0;
  /** Where text goes: the current verse, a title, or nowhere. */
  let target: 'verse' | 'title' | 'none' | 'id' = 'none';
  let verseText: string[] = [];
  let footnotes: string[] = [];
  let titleText: string[] = [];

  const endVerse = () => {
    if (verse === 0) return;
    const text = clean(verseText.join(''));
    book.c[chapter - 1]![verse - 1] = text;
    if (!text && footnotes.length > 0) (book.n ??= {})[`${chapter}:${verse}`] = footnotes.join(' ');
    verseText = [];
    footnotes = [];
  };
  const endTitle = () => {
    const text = clean(titleText.join(''));
    if (text) (book.d ??= {})[`${chapter}:${verse + 1}`] = text;
    titleText = [];
  };

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]!;
    if ('text' in token) {
      // After an opening \w, the text is "word|strong=…": keep the word.
      const previous = tokens[i - 1];
      const word =
        previous && 'marker' in previous && !previous.closing && /^\+?w$/.test(previous.marker);
      const text = word ? token.text.replace(/\|[^]*$/, '') : token.text;
      if (target === 'verse' && verse > 0) verseText.push(text);
      else if (target === 'title') titleText.push(text);
      else if (target === 'id' && !book.code) book.code = text.trim().slice(0, 3);
      continue;
    }

    const { marker, closing } = token;
    if (marker === 'f' || marker === 'x') {
      // Skip the note, keeping a footnote's text in case its verse turns out to be empty.
      const note: string[] = [];
      let part = '';
      for (i++; i < tokens.length; i++) {
        const t = tokens[i]!;
        if ('marker' in t) {
          if (t.marker === marker && t.closing) break;
          if (!t.closing) part = t.marker;
        } else if (NOTE_TEXT.has(part)) {
          note.push(t.text);
        }
      }
      if (marker === 'f' && target === 'verse') footnotes.push(clean(note.join('')));
    } else if (INLINE.has(marker)) {
      // Content stays where it is.
    } else if (closing) {
      throw new Error(`Unexpected \\${marker}* in ${book.code} ${chapter}:${verse}`);
    } else if (BREAKS.has(marker)) {
      endTitle();
      target = 'verse';
      verseText.push(' ');
    } else if (marker === 'v') {
      endTitle();
      endVerse();
      const next = numberAfter(tokens, i, `\\v without a number in ${book.code} ${chapter}`);
      verse = next.number;
      next.token.text = next.token.text.slice(next.length);
      target = 'verse';
    } else if (marker === 'c') {
      endTitle();
      endVerse();
      chapter = numberAfter(tokens, i, `\\c without a number in ${book.code}`).number;
      verse = 0;
      book.c[chapter - 1] = [];
      i++; // the rest of the line after a chapter number is not text
      target = 'none';
    } else if (marker === 'd') {
      endTitle();
      target = 'title';
    } else if (DROPPED.has(marker)) {
      endTitle();
      target = marker === 'id' ? 'id' : 'none';
    } else {
      throw new Error(`Unknown USFM marker \\${marker} in ${book.code} ${chapter}:${verse}`);
    }
  }
  endTitle();
  endVerse();
  return book;
}

/** The number at the start of the text after marker `i`, with the one space after it. */
function numberAfter(tokens: Token[], i: number, error: string) {
  const token = tokens[i + 1];
  const match = token && 'text' in token ? /^(\d+)\s?/.exec(token.text) : null;
  if (!token || !('text' in token) || !match) throw new Error(error);
  return { token, number: Number(match[1]), length: match[0].length };
}

/** Collapses whitespace and trims. */
function clean(text: string): string {
  return text.replaceAll(/\s+/g, ' ').trim();
}
