import type { VerseTextMatch } from '@lamp/bible-data';
import {
  findReferences,
  isBibleSite,
  type FoundReference,
  type Passage,
  passageRange,
  shareSource,
  type TranslationId,
  type VerseRef,
} from '@lamp/domain';

/** What a share brings (F18): the Web Share Target's `title`, `text` and `url`. */
export interface ShareInput {
  title?: string | null;
  text?: string | null;
  url?: string | null;
}

/** One verse found in a share, as it would be put in the inbox. */
export interface FoundVerse {
  ref: VerseRef;
  /** Whether its translation and text are still to come from Lamp's own book. */
  fromBook: boolean;
}

/** What the share screen shows and adds (wireframes/interop.md "Share landing"). */
export interface ShareReading {
  verses: FoundVerse[];
  /** The rest of the text: a note on the first verse ticked, or the item itself with none. */
  note: string | null;
  /** The address shared, or the first one in the text. */
  sourceUrl: string | null;
}

const URL_PATTERN = /https?:\/\/[^\s<>"“”]+/giu;
/** An item's text: the inbox item's limit (TECH-DESIGN §17.2). */
const MAX_NOTE = 10_000;

/**
 * Reads a share (F18, M9-06): its references (M9-03), the whole BSB or KJV verses in it (M9-04,
 * `matches`, which the caller asks the matcher for with `shareHints`), and the translation its
 * address or text names (M9-05).
 * - A verse whose text was matched gets that translation, and the text as it came is its
 *   snapshot (decided 2026-10-18).
 * - A reference from a Bible site or app (an address it recognises, or a version after the
 *   reference) gets the source's translation, and the rest of the text is the verse's text; with
 *   several references, that text is the note instead.
 * - A reference from anywhere else ("Look at John 3:16 for Sunday") is a chip in `translation`
 *   whose text comes from Lamp's book, and the rest of the text is the note.
 * With no reference and no match, the address's passage counts (`bible.com/…/JHN.10.11`); with
 * none of those, the share is a note. A paste reads the same, with text from an unknown version
 * `pasted` instead of `shared`.
 */
export function readShare(
  input: ShareInput,
  matches: readonly VerseTextMatch[],
  translation: TranslationId,
  /** What text from an unknown version is: `shared`, or `pasted` for a paste (§17.3). */
  outside: 'shared' | 'pasted' = 'shared',
): ShareReading {
  const raw = (input.text ?? '').trim();
  const sourceUrl = input.url?.trim() || (raw.match(URL_PATTERN)?.[0] ?? null);
  const text = raw.replaceAll(URL_PATTERN, (url) => ' '.repeat(url.length));
  const title = (input.title ?? '').trim();
  let references = findReferences(text);
  const named = shareSource(sourceUrl, `${text}\n${title}`);
  const source = named.translation === 'shared' ? { ...named, translation: outside } : named;
  if (references.length === 0 && matches.length === 0 && title) {
    references = findReferences(title).map((found) => ({ ...found, from: -1, to: -1 }));
  }
  const identified =
    named.translation !== 'shared' || !!named.versionLabel || isBibleSite(sourceUrl);

  // Spans that aren't the note: references (with a version label after them) and matched verses.
  const spans: Array<[number, number]> = [];
  const verses: Array<FoundVerse & { at: number }> = [];
  for (const match of matches) {
    // The verse's closing punctuation and quote go with it.
    const to = match.to + (/^[.,;:!?’”"')\]]*/u.exec(text.slice(match.to))?.[0].length ?? 0);
    spans.push([match.from, to]);
    verses.push({
      at: match.from,
      fromBook: false,
      ref: {
        ...match.passage,
        translation: match.translation as TranslationId,
        snapshotText: tidy(text.slice(match.from, to)),
      },
    });
  }
  for (const found of references) {
    if (found.from >= 0) spans.push([found.from, labelEnd(text, found)]);
    if (verses.some((v) => samePassage(v.ref, found.ref))) continue;
    const ref = { ...found.ref };
    verses.push({
      at: found.from,
      fromBook: !identified,
      ref: identified
        ? {
            ...ref,
            translation: source.translation,
            ...(source.versionLabel && { versionLabel: source.versionLabel }),
          }
        : { ...ref, translation },
    });
  }
  if (verses.length === 0 && source.passage) {
    verses.push({
      at: 0,
      fromBook: false,
      ref: {
        ...source.passage,
        translation: source.translation,
        ...(source.versionLabel && { versionLabel: source.versionLabel }),
      },
    });
  }
  verses.sort((a, b) => a.at - b.at);

  let rest = tidy(without(text, spans));
  if (!/[\p{L}\p{N}]/u.test(rest)) rest = '';
  // From a Bible site, one reference's rest is its verse text.
  const only = verses.length === 1 ? verses[0]! : null;
  if (only && identified && !only.ref.snapshotText && rest) {
    only.ref.snapshotText = rest;
    rest = '';
  }

  const note = verses.length > 0 ? rest || null : tidy(raw) || sourceUrl;
  return {
    verses: verses.map(({ fromBook, ref }) => ({ fromBook, ref })),
    note: note && note.length > MAX_NOTE ? note.slice(0, MAX_NOTE) : note,
    sourceUrl,
  };
}

/** The passages to tell the matcher about: the references in the share and its address's. */
export function shareHints(input: ShareInput): Passage[] {
  const hints: Passage[] = findReferences(input.text ?? '').map((found) => found.ref);
  const source = shareSource(input.url, input.text);
  if (source.passage) hints.push(source.passage);
  return hints;
}

/** Where a reference ends, with a version label after it: "John 3:16 NIV", "Romans 8:28 (ESV)". */
function labelEnd(text: string, found: FoundReference): number {
  const after = /^[^\S\n]*[([]?[A-Z][A-Z0-9]{1,11}[)\]]?(?![\p{L}\p{N}])/u.exec(
    text.slice(found.to),
  );
  return found.to + (after?.[0].length ?? 0);
}

export const samePassage = (a: Passage, b: Passage) => {
  const [x, y] = [passageRange(a), passageRange(b)];
  return x[0] === y[0] && x[1] === y[1];
};

/** The text with the spans taken out, each leaving a space. */
function without(text: string, spans: Array<[number, number]>): string {
  let out = '';
  let at = 0;
  for (const [from, to] of spans.toSorted((a, b) => a[0] - b[0])) {
    if (from < at) {
      at = Math.max(at, to);
      continue;
    }
    out += `${text.slice(at, from)} `;
    at = to;
  }
  return out + text.slice(at);
}

/**
 * Shared text tidied, words untouched: verse numbers before a verse ("28And", "29 For") and
 * spaces collapsed, quotes and dashes left dangling at either end dropped.
 */
export function tidy(text: string): string {
  return (
    text
      .replaceAll(/(^|[\s.;:!?”"’)])\d{1,3}(?=\s?[\p{Lu}“"‘'(])/gu, '$1 ')
      // Commas, semicolons and dashes left alone where references were taken out.
      .replaceAll(/(?<=^|\s)[,;:—–-]+(?=\s|$)/gu, '')
      .replaceAll(/[^\S\n]+/g, ' ')
      .replaceAll(/\s*\n\s*/g, '\n')
      .replaceAll(/\n{2,}/g, '\n')
      .replace(/^[\s“”"‘’'«»—–\-:,;.]+/u, '')
      .replace(/[\s“”"‘’'«»—–\-:,;]+$/u, '')
      .trim()
  );
}
