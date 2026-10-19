import { type BookText, passageVerses } from '@lamp/bible-data';
import { type Passage, toPlainText, translationLabel, type VerseRef } from '@lamp/domain';
import { outline } from '@/components/sections/outline.ts';
import type { QuestionView } from '@/data/question-status.ts';
import { count } from '@/lib/labels.ts';
import { headerLines, type LessonForExport, scriptureCredit, sourceOf } from './markdown.ts';

/**
 * The handout (F33, M12-05, wireframes/reflection.md "Handout"): a lesson on one printed page, A4
 * or Letter. Its details, main passages with their text, each top-level section's first line,
 * takeaways and questions. `fitStep` says how a step of fitting it lays them out.
 */

/** A main passage, and its verses when Lamp has the text and it's short enough to print. */
export interface HandoutPassage {
  /** "John 10:1–18 (BSB)". */
  label: string;
  verses: { label: string; text: string }[] | null;
}

export interface Handout {
  title: string;
  details: string[];
  passages: HandoutPassage[];
  /** Each top-level section's first line, in order. */
  notes: string[];
  takeaways: string[];
  questions: Pick<QuestionView, 'id' | 'text' | 'status'>[];
  /** "Scripture: Berean Standard Bible (public domain). Made with Lamp." */
  credit: string;
}

/** More verses than this print as the reference alone: a whole chapter or more won't fit. */
export const MAX_HANDOUT_VERSES = 60;

/** The passage a chip names, without its text and display fields. */
export function passageOf(ref: VerseRef): Passage {
  const { book, chapter, verseStart, chapterEnd, verseEnd } = ref;
  return Object.fromEntries(
    Object.entries({ book, chapter, verseStart, chapterEnd, verseEnd }).filter(
      ([, v]) => v !== null && v !== undefined,
    ),
  ) as unknown as Passage;
}

/**
 * The handout's content. `books` holds the main passages' books in `data.verses.translation`, the
 * one picked in Settings, in their order: null for one that isn't here (offline), which prints as
 * its reference, as text from outside Lamp does.
 */
export function handoutOf(data: LessonForExport, books: readonly (BookText | null)[]): Handout {
  const { lesson } = data;
  const source = sourceOf(lesson);
  const host = source?.url ? hostOf(source.url) : null;
  const details = [
    headerLines(data)[0]!,
    ...(source ? [host ? `${source.words} (${host})` : source.words] : []),
  ];
  const passages = lesson.mainPassages.map((ref, i): HandoutPassage => {
    const book = ref.translation ? null : books[i];
    const verses = book ? passageVerses(book, passageOf(ref)).filter((v) => v.text) : [];
    return {
      label: `${ref.display} (${translationLabel(ref, data.verses.translation)})`,
      verses:
        verses.length > 0 && verses.length <= MAX_HANDOUT_VERSES
          ? verses.map((v, j) => ({
              label:
                j > 0 && v.chapter !== verses[j - 1]!.chapter
                  ? `${v.chapter}:${v.verse}`
                  : `${v.verse}`,
              text: v.text,
            }))
          : null,
    };
  });
  const notes = outline(data.sections)
    .filter((row) => row.level === 0)
    .map((row) => toPlainText(row.item.body).split('\n')[0]?.trim() ?? '')
    .filter(Boolean);
  const credit = scriptureCredit([{ ...data, sections: [] }]);
  return {
    title: lesson.title,
    details,
    passages,
    notes,
    takeaways: data.takeaways.map((t) => t.text),
    questions: data.questions.map(({ id, text, status }) => ({ id, text, status })),
    credit: credit ? `${credit} Made with Lamp.` : 'Made with Lamp.',
  };
}

function hostOf(url: string): string | null {
  try {
    return new URL(url).host.replace(/^www\./, '');
  } catch {
    return null;
  }
}

/** How one step of fitting lays the handout out (wireframes: text, then columns, then type). */
export interface FitLayout {
  /** The passages' text; without it, their references alone. */
  passageText: boolean;
  /** The notes in two columns. */
  columns: 1 | 2;
  /** The body type, in points. */
  size: number;
  /** How many of each are left out, from the end, once the type is as small as it goes. */
  leftOut: { notes: number; questions: number; takeaways: number };
}

const LAYOUTS: Omit<FitLayout, 'leftOut'>[] = [
  { passageText: true, columns: 1, size: 11 },
  { passageText: false, columns: 1, size: 11 },
  { passageText: false, columns: 2, size: 11 },
  { passageText: false, columns: 2, size: 10.5 },
  { passageText: false, columns: 2, size: 10 },
  { passageText: false, columns: 2, size: 9.5 },
  { passageText: false, columns: 2, size: 9 },
];

/** The last step there is for this handout: everything that can be left out, left out. */
export function lastFitStep(handout: Handout): number {
  return (
    LAYOUTS.length - 1 + handout.notes.length + handout.questions.length + handout.takeaways.length
  );
}

/**
 * Step `step` of fitting: the layouts in turn, then one more line left out at each step, note
 * headings from the end first, then questions, then takeaways. Never the title, details or
 * passages' references.
 */
export function fitStep(handout: Handout, step: number): FitLayout {
  const layout = LAYOUTS[Math.min(step, LAYOUTS.length - 1)]!;
  let more = Math.max(0, step - (LAYOUTS.length - 1));
  const take = (n: number) => {
    const taken = Math.min(more, n);
    more -= taken;
    return taken;
  };
  const notes = take(handout.notes.length);
  const questions = take(handout.questions.length);
  const takeaways = take(handout.takeaways.length);
  return { ...layout, leftOut: { notes, questions, takeaways } };
}

/** "Too long for one page: 4 note headings left out."; null when nothing is. */
export function leftOutNotice({ leftOut }: FitLayout): string | null {
  const parts = [
    leftOut.notes && count(leftOut.notes, 'note heading'),
    leftOut.questions && count(leftOut.questions, 'question'),
    leftOut.takeaways && count(leftOut.takeaways, 'takeaway'),
  ].filter((part): part is string => !!part);
  if (parts.length === 0) return null;
  const list =
    parts.length === 1 ? parts[0]! : `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}`;
  return `Too long for one page: ${list} left out.`;
}
