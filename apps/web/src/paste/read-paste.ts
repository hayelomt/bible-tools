import type { VerseTextMatch } from '@lamp/bible-data';
import { findReferences, type FoundReference, type VerseRef, versionAfter } from '@lamp/domain';
import { samePassage, tidy } from '@/share/read-share.ts';

/** A chip pasting could make (F19): the span of the pasted text it replaces, and the chip. */
export interface PasteChip {
  from: number;
  to: number;
  ref: VerseRef;
  /** Found by its words (the matcher), with no reference in the text. */
  matchedOnly: boolean;
}

/** Between a reference and its verse: spaces, quotes, brackets, punctuation, a verse number. */
const JOINER = /^[\s\d"“”'‘’()[\].,:;—–-]*$/u;
/** The verse's quotes and closing punctuation go with it. */
const OPENING = /[“"‘'([]*$/u;
const CLOSING = /^[.,;:!?’”"')\]]*/u;

/**
 * Reads pasted text for chips (F19, M9-08, wireframes/interop.md "Paste prompt"): the references
 * in it (M9-03) and the whole BSB or KJV verses the matcher found (M9-04, `matches`). A chip of
 * the app's own text is the passage alone, read in the translation picked in Settings (decision
 * 97), so a verse matched in the KJV reads in the BSB when that's the one picked.
 * - A matched verse is a chip that replaces it. A reference just before or after it, for the same
 *   passage, goes into the same chip.
 * - A reference with another version after it ("John 3:16 NIV") is a `pasted` chip with that
 *   label, and the verse text is the rest of its line, or the line before when the reference stands
 *   on its own (as YouVersion copies it); BSB or KJV after it goes into the chip.
 * - Any other reference is a chip, and the text around it stays (decided 2026-10-18).
 */
export function readPaste(text: string, matches: readonly VerseTextMatch[]): PasteChip[] {
  const references = findReferences(text);
  const used = new Set<FoundReference>();
  const chips: PasteChip[] = [];

  for (const match of matches) {
    let from = match.from - (OPENING.exec(text.slice(0, match.from))?.[0].length ?? 0);
    let to = match.to + (CLOSING.exec(text.slice(match.to))?.[0].length ?? 0);
    // The same passage named next to it: "Romans 8:28 And we know…", "“…”\nJohn 10:11 BSB".
    const named = references.find((found) => {
      if (used.has(found) || !samePassage(found.ref, match.passage)) return false;
      const end = labelEnd(text, found);
      return end <= from
        ? JOINER.test(text.slice(end, from))
        : found.from >= to && JOINER.test(text.slice(to, found.from));
    });
    if (named) {
      used.add(named);
      from = Math.min(from, named.from);
      to = Math.max(to, labelEnd(text, named));
    }
    chips.push({ from, to, matchedOnly: !named, ref: { ...match.passage } });
  }

  for (const found of references) {
    if (used.has(found) || chips.some((c) => found.from < c.to && found.to > c.from)) continue;
    const label = versionAfter(text, found.to);
    const end = found.to + (label?.length ?? 0);
    const ref = { ...found.ref };
    if (label?.label === 'BSB' || label?.label === 'KJV') {
      chips.push({ from: found.from, to: end, matchedOnly: false, ref });
    } else if (label) {
      const verse = labelledText(text, found.from, end);
      chips.push({
        from: Math.min(found.from, verse?.from ?? found.from),
        to: Math.max(end, verse?.to ?? end),
        matchedOnly: false,
        ref: {
          ...ref,
          translation: 'pasted',
          versionLabel: label.label,
          ...(verse && { snapshotText: verse.text }),
        },
      });
    } else {
      chips.push({ from: found.from, to: found.to, matchedOnly: false, ref });
    }
  }
  return chips.toSorted((a, b) => a.from - b.from);
}

/** Where a reference ends, with a version after it ("John 3:16 NIV"). */
function labelEnd(text: string, found: FoundReference): number {
  return found.to + (versionAfter(text, found.to)?.length ?? 0);
}

/**
 * The verse text of a labelled reference: the rest of its line, or, when the reference is the
 * whole line, the line before it (YouVersion: `“For God so loved…”\nJohn 3:16 NIV`). A line
 * holding another reference isn't verse text.
 */
function labelledText(
  text: string,
  from: number,
  end: number,
): { from: number; to: number; text: string } | null {
  const lineStart = text.lastIndexOf('\n', from - 1) + 1;
  const lineEnd = text.indexOf('\n', end) === -1 ? text.length : text.indexOf('\n', end);
  const rest = text.slice(end, lineEnd);
  if (/\p{L}/u.test(rest) && findReferences(rest).length === 0) {
    return { from: end, to: lineEnd, text: tidy(rest) };
  }
  if (text.slice(lineStart, from).trim() || lineStart === 0) return null;
  const before = text.lastIndexOf('\n', lineStart - 2) + 1;
  const previous = text.slice(before, lineStart - 1);
  if (!/\p{L}/u.test(previous) || findReferences(previous).length > 0) return null;
  return { from: before, to: lineStart, text: tidy(previous) };
}
