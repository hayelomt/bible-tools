import {
  citedRefs,
  isAppTranslation,
  type Lesson,
  type Section,
  type Series,
  type SourceType,
  TRANSLATION_NAMES,
  type TranslationId,
  type VerseRef,
} from '@lamp/domain';

/**
 * Words and dates as the app writes them on a printed page (apps/web/src/lib/labels.ts, dates.ts
 * and export/markdown.ts), for the shared pages. Kept in step with those by hand: the server
 * renders the same lines the print view shows.
 */

export const KIND_LABELS: Record<Lesson['kind'], string> = {
  sermon: 'Sermon',
  personal: 'Personal',
  group: 'Group',
};

const SOURCE_TYPE_LABELS: Record<SourceType, string> = {
  sermon: 'Sermon',
  book: 'Book',
  podcast: 'Podcast',
  other: 'Other',
};

export const SERIES_KIND_LABELS: Record<Series['kind'], string> = {
  sermon_series: 'Sermon series',
  book_study: 'Book study',
  custom: 'Other',
};

/** "1 lesson", "3 lessons". */
export function count(n: number, noun: string, plural = `${noun}s`): string {
  return `${n} ${n === 1 ? noun : plural}`;
}

const asUtc = (date: string) => new Date(`${date.slice(0, 10)}T00:00:00Z`);
const withoutCommas = (text: string) => text.replaceAll(',', '');

const LONG = new Intl.DateTimeFormat('en-GB', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});
const SHORT_WITH_YEAR = new Intl.DateTimeFormat('en-GB', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});

/** "Sunday 12 October 2026". */
export const longDate = (date: string) => withoutCommas(LONG.format(asUtc(date)));

/** "Sun 12 Oct 2026". */
export const shortDateWithYear = (date: string) =>
  withoutCommas(SHORT_WITH_YEAR.format(asUtc(date)));

/** A tag as the exports show it: "#grace". */
export const tagLabel = (name: string) => `#${name}`;

/**
 * A lesson's header: "Sunday 12 October 2026 · Sermon · Pastor Ann, Grace Chapel", then its
 * passages and tags: "John 10:1–18 · #grace".
 */
export function headerLines(lesson: Lesson, tags: readonly string[]): string[] {
  const who = [lesson.speaker, lesson.church].filter(Boolean).join(', ');
  return [
    [longDate(lesson.date), KIND_LABELS[lesson.kind], who].filter(Boolean).join(' · '),
    [...lesson.mainPassages.map((p) => p.display), ...tags.map(tagLabel)].join(' · '),
  ].filter(Boolean);
}

/** "Sermon: Sunday service · Pastor Ann" and its link; null without a source. */
export function sourceOf(lesson: Lesson): { words: string; url: string | null } | null {
  const parts = [lesson.sourceTitle, lesson.sourceAuthor].filter(Boolean).join(' · ');
  if (!parts && !lesson.sourceUrl) return null;
  const type = lesson.sourceType ? SOURCE_TYPE_LABELS[lesson.sourceType] : 'Source';
  return { words: parts ? `${type}: ${parts}` : type, url: lesson.sourceUrl };
}

const pad = (n: number) => String(n).padStart(2, '0');

/** A length of time as a clock shows it: "09:45", "1:02:10"; "−00:30" before the start. */
function clockLabel(ms: number): string {
  const sign = ms < 0 ? '−' : '';
  const seconds = Math.floor(Math.abs(ms) / 1000);
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return h > 0 ? `${sign}${h}:${pad(m)}:${pad(s)}` : `${sign}${pad(m)}:${pad(s)}`;
}

/** A section's place in the source, "09:45" or "p. 112"; null for neither. */
export function momentLabel(section: Section, lesson: Lesson): string | null {
  if (section.sourceAt && lesson.sourceStartedAt) {
    return clockLabel(Date.parse(section.sourceAt) - Date.parse(lesson.sourceStartedAt));
  }
  return section.sourcePage ? `p. ${section.sourcePage}` : null;
}

/**
 * "Scripture: Berean Standard Bible (public domain).", for the app's translations these refs
 * quote; null when they quote none. Text from outside Lamp is labelled where it's quoted.
 */
export function creditFor(refs: readonly VerseRef[]): string | null {
  const used = new Set<TranslationId>();
  for (const ref of refs) if (isAppTranslation(ref.translation)) used.add(ref.translation);
  if (used.size === 0) return null;
  const names = [...used].toSorted().map((id) => TRANSLATION_NAMES[id]);
  return `Scripture: ${names.join(', ')} (public domain).`;
}

/** The credit for lessons: their main passages and the chips in their sections. */
export function lessonsCredit(
  lessons: readonly { lesson: Lesson; sections: readonly Section[] }[],
): string | null {
  return creditFor(
    lessons.flatMap(({ lesson, sections }) => [
      ...lesson.mainPassages,
      ...sections.flatMap((s) => citedRefs(s.body)),
    ]),
  );
}
