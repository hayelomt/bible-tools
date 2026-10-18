import { type BookCode, getBook, isBookCode } from './books.ts';
import { findReferences } from './find-references.ts';
import { type ParsedPassage, parseReference } from './parse-reference.ts';
import type { ChipTranslation } from './verse-ref.ts';

/** What a share says about its verse text: the translation, and the passage its address names. */
export interface ShareSource {
  /** `BSB` or `KJV` when the source names one; otherwise `shared` (TECH-DESIGN §17.3). */
  translation: ChipTranslation;
  /** The version the source names when it isn't one Lamp has ("NIV"); shown in place of `shared`. */
  versionLabel?: string;
  /** The passage in the address (YouVersion's `/bible/111/JHN.3.16.NIV`), if it names one. */
  passage?: ParsedPassage;
}

/**
 * Version labels Lamp recognises in a share's text ("John 3:16 NIV") and in Bible Hub's paths,
 * where other path segments aren't versions (`/interlinear/`, `/commentaries/`). Upper case.
 */
const KNOWN_VERSIONS = new Set([
  'AMP', 'AMPC', 'ASV', 'BSB', 'BLB', 'CEB', 'CEV', 'CSB', 'DBY', 'DRB', 'ERV', 'ESV', 'GNT',
  'GNV', 'GW', 'HCSB', 'ISV', 'KJV', 'LSB', 'MSG', 'NABRE', 'NASB', 'NASB1995', 'NASB2020', 'NASB20', 'NASB95',
  'NCV', 'NET', 'NHEB', 'NIRV', 'NIV', 'NIVUK', 'NKJV', 'NLT', 'NLV', 'NRSV', 'NRSVUE', 'RSV', 'RVR60',
  'TLB', 'TPT', 'WEB', 'YLT',
]); // prettier-ignore

/**
 * YouVersion's version ids (`/bible/{id}/…`) for the versions most shared, so an address without
 * the abbreviation at its end still gets one. The abbreviation, when there, wins for any other id.
 */
const YOUVERSION_IDS: Record<string, string> = {
  1: 'KJV',
  12: 'ASV',
  59: 'ESV',
  97: 'MSG',
  100: 'NASB1995',
  111: 'NIV',
  114: 'NKJV',
  116: 'NLT',
  1588: 'AMP',
  1713: 'CSB',
  2692: 'NASB2020',
  3034: 'BSB',
};

/** A version label: a few letters, perhaps with digits ("NIV", "NASB1995"). */
const LABEL = /^[A-Za-z][A-Za-z0-9]{1,11}$/u;

/**
 * The translation of a share (F18, M9-05), from its address, else from a version named after a
 * reference in its text ("John 3:16 NIV"):
 * - YouVersion (`bible.com/bible/{id}/{USFM}[.{ABBR}]`): the id, or the abbreviation at the end.
 * - Blue Letter Bible: `t=` (`?t=NIV`), or the first path segment (`/kjv/jhn/3/16/`).
 * - Bible Hub: the first path segment when it's a version (`/bsb/john/3.htm`).
 * BSB and KJV become those translations; any other version is `shared` with its label; anything
 * else is `shared` alone.
 */
export function shareSource(url: string | null | undefined, text?: string | null): ShareSource {
  const fromUrl = url ? sourceOfUrl(url) : null;
  if (fromUrl && (fromUrl.label || fromUrl.passage)) {
    const label = fromUrl.label ?? (text ? labelInText(text) : null);
    return { ...withLabel(label), ...(fromUrl.passage && { passage: fromUrl.passage }) };
  }
  return withLabel(text ? labelInText(text) : null);
}

function withLabel(label: string | null | undefined): ShareSource {
  if (!label) return { translation: 'shared' };
  if (label === 'BSB' || label === 'KJV') return { translation: label };
  return { translation: 'shared', versionLabel: label };
}

interface UrlSource {
  label?: string;
  passage?: ParsedPassage;
}

/** The sites `shareSource` reads, by host without `www.`. */
const BIBLE_SITES = new Set(['bible.com', 'blueletterbible.org', 'biblehub.com']);

function siteOf(url: string): { parsed: URL; host: string } | null {
  try {
    const parsed = new URL(url.trim());
    return { parsed, host: parsed.hostname.toLowerCase().replace(/^(www|m|my)\./u, '') };
  } catch {
    return null;
  }
}

/** Whether an address is on a Bible site `shareSource` reads, so text shared from it is scripture. */
export const isBibleSite = (url: string | null | undefined): boolean =>
  !!url && BIBLE_SITES.has(siteOf(url)?.host ?? '');

function sourceOfUrl(url: string): UrlSource | null {
  const site = siteOf(url);
  if (!site) return null;
  const { parsed, host } = site;
  const segments = parsed.pathname.split('/').filter(Boolean);
  if (host === 'bible.com') return youVersion(segments);
  if (host === 'blueletterbible.org') return blueLetterBible(parsed, segments);
  if (host === 'biblehub.com') return bibleHub(segments);
  return null;
}

/** `/bible/111/JHN.3.16.NIV`, `/en-GB/bible/113/jhn.3.16`, `/bible/3034/PSA.23`. */
function youVersion(segments: string[]): UrlSource | null {
  const at = segments.findIndex((segment) => segment.toLowerCase() === 'bible');
  if (at === -1) return null;
  const id = segments[at + 1];
  if (!id || !/^\d+$/u.test(id)) return null;
  const parts = (segments[at + 2] ?? '').split('.');
  const book = parts[0]?.toUpperCase() ?? '';
  // The abbreviation follows the chapter and verse: JHN.3.16.NIV, or PSA.23.BSB.
  const last = parts.length > 2 && !/^\d/u.test(parts.at(-1)!) ? parts.pop()! : null;
  const label = YOUVERSION_IDS[id] ?? (last && LABEL.test(last) ? last.toUpperCase() : undefined);
  const passage = isBookCode(book) ? usfmPassage(book, parts.slice(1)) : undefined;
  return { ...(label && { label }), ...(passage && { passage }) };
}

/** A USFM chapter and verses after the book: `3`, `3.16`, `3.16-18`; anything else is none. */
function usfmPassage(book: BookCode, parts: string[]): ParsedPassage | undefined {
  const [chapter, verses] = parts;
  if (!chapter || !/^\d+$/u.test(chapter) || parts.length > 2) return undefined;
  if (verses !== undefined && !/^\d+(-\d+)?$/u.test(verses)) return undefined;
  const result = parseReference(`${getBook(book).name} ${chapter}${verses ? `:${verses}` : ''}`);
  return result.ok ? result.ref : undefined;
}

/** `?t=NIV` on any page, or `/kjv/jhn/3/16/`. */
function blueLetterBible(url: URL, segments: string[]): UrlSource {
  const t = url.searchParams.get('t') ?? url.searchParams.get('T');
  if (t && LABEL.test(t)) return { label: t.toUpperCase() };
  const label = segments[0]?.toUpperCase();
  if (label && segments.length >= 3 && KNOWN_VERSIONS.has(label)) return { label };
  return {};
}

/** `/bsb/john/3.htm`, `/kjv/john/3-16.htm`; `/john/3-16.htm` names no version. */
function bibleHub(segments: string[]): UrlSource {
  const first = segments[0]?.toLowerCase();
  if (!first || segments.length < 3) return {};
  const label = first.toUpperCase();
  return KNOWN_VERSIONS.has(label) ? { label } : {};
}

/** A known version in capitals right after a reference: "John 3:16 NIV", "Romans 8:28 (ESV)". */
function labelInText(text: string): string | null {
  for (const found of findReferences(text)) {
    const after = versionAfter(text, found.to);
    if (after) return after.label;
  }
  return null;
}

/**
 * The known version written at `at`, just after a reference ("John 3:16 NIV", "(ESV)"), and how
 * many characters it takes with the space and brackets before it; null if there's none.
 */
export function versionAfter(text: string, at: number): { label: string; length: number } | null {
  const after = AFTER_REFERENCE.exec(text.slice(at));
  return after && KNOWN_VERSIONS.has(after[1]!)
    ? { label: after[1]!, length: after[0].length }
    : null;
}

/** The label of a YouVersion version id (`111` is "NIV"), for the versions most shared. */
export const youVersionLabel = (id: number | string): string | undefined => YOUVERSION_IDS[id];

const AFTER_REFERENCE = /^[^\S\n]*[([]?([A-Z][A-Z0-9]{1,11})[)\]]?(?![\p{L}\p{N}])/u;
