import {
  citedRefs,
  escapeMarkdown,
  type Lesson,
  type Question,
  type Section,
  type Series,
  type Takeaway,
  toMarkdown,
  isAppTranslation,
  TRANSLATION_NAMES,
  type TranslationId,
  type VerseRef,
} from '@lamp/domain';
import { outline } from '@/components/sections/outline.ts';
import { longDate } from '@/lib/dates.ts';
import { count, SERIES_KIND_LABELS, SOURCE_LABELS } from '@/lib/labels.ts';

/**
 * Markdown export (F11, TECH-DESIGN §8.7, wireframes/export.md): a lesson, or a series with its
 * lessons, as a document that reads well as text and renders on GitHub. Pure; `load.ts` reads
 * the rows.
 *
 * - Sections in the lesson's order; a reply is quoted under its section (`> `), so it shows
 *   indented. Verse chips read "John 10:9 (BSB)", with their text quoted after the paragraph.
 * - A section's tags follow it in italics; the lesson's are in its header with its passages.
 * - Takeaways as a list, questions as a task list: `[x]` answered, `[ ]` open or parked.
 * - The translations quoted are credited at the end (decided 2026-10-14).
 */

export interface LessonForExport {
  lesson: Lesson;
  /** The lesson's live sections, in any order. */
  sections: Section[];
  /** Tag names by section id. */
  sectionTags: ReadonlyMap<string, string[]>;
  /** The lesson's own tags. */
  tags: string[];
  takeaways: Takeaway[];
  questions: Question[];
}

/** One lesson; `level` is its title's heading level (2 inside a series). */
export function lessonMarkdown(data: LessonForExport, level = 1): string {
  return document([...lessonBlocks(data, level), ...credits([data])]);
}

export function seriesMarkdown(series: Series, lessons: LessonForExport[]): string {
  return document([
    `# ${escapeMarkdown(series.title)}`,
    `${SERIES_KIND_LABELS[series.kind]} · ${count(lessons.length, 'lesson')}`,
    series.description.trim() && paragraphs(series.description),
    ...lessons.flatMap((lesson) => lessonBlocks(lesson, 2)),
    ...credits(lessons),
  ]);
}

/** Blocks joined by blank lines, ending in one newline. */
function document(blocks: string[]): string {
  return `${blocks.filter(Boolean).join('\n\n')}\n`;
}

function lessonBlocks(data: LessonForExport, level: number): string[] {
  const { lesson } = data;
  const heading = '#'.repeat(level);
  const sub = '#'.repeat(level + 1);
  const blocks = [`${heading} ${escapeMarkdown(lesson.title)}`, header(data)];

  for (const row of outline(data.sections)) {
    const body = toMarkdown(row.item.body, { headingLevel: level + 1 }).trimEnd();
    const tags = data.sectionTags.get(row.item.id) ?? [];
    const lines = [body, tags.length > 0 ? `*${tags.map(tagLabel).join(' · ')}*` : '']
      .filter(Boolean)
      .join('\n\n');
    if (!lines) continue;
    blocks.push(row.level === 0 ? lines : quoted(lines));
  }

  if (data.takeaways.length > 0) {
    blocks.push(
      `${sub} Takeaways`,
      data.takeaways.map((t) => `- ${escapeMarkdown(t.text)}`).join('\n'),
    );
  }
  if (data.questions.length > 0) {
    blocks.push(`${sub} Questions`, data.questions.map(questionLine).join('\n'));
  }
  return blocks;
}

/** The lesson's header lines, in one paragraph with hard breaks. */
function header(data: LessonForExport): string {
  return headerLines(data).map(escapeMarkdown).join('\\\n');
}

/**
 * A lesson's header, as text: "Sunday 12 October 2026 · Sermon · Pastor Ann, Grace Chapel", then
 * the passages and tags: "John 10:1–18 · #grace". The print view shows the same lines.
 */
export function headerLines({ lesson, tags }: LessonForExport): string[] {
  const who = [lesson.speaker, lesson.church].filter(Boolean).join(', ');
  return [
    [longDate(lesson.date), SOURCE_LABELS[lesson.source], who].filter(Boolean).join(' · '),
    [...lesson.mainPassages.map((p) => p.display), ...tags.map(tagLabel)].join(' · '),
  ].filter(Boolean);
}

/** A tag as the exports show it: "#grace". */
export function tagLabel(name: string): string {
  return `#${name}`;
}

function questionLine(question: Question): string {
  const text = escapeMarkdown(question.text);
  if (question.status === 'answered') return `- [x] ${text}`;
  return question.status === 'parked' ? `- [ ] ${text} *(parked)*` : `- [ ] ${text}`;
}

/** A reply, quoted under its section: GitHub shows it indented. */
function quoted(markdown: string): string {
  return markdown
    .split('\n')
    .map((line) => (line ? `> ${line}` : '>'))
    .join('\n');
}

/** Free text (a series description): its lines kept, each shown as typed. */
function paragraphs(text: string): string {
  return text
    .trim()
    .split(/\n\s*\n/)
    .map((para) => para.split('\n').map(escapeMarkdown).join('\\\n'))
    .join('\n\n');
}

/** The credit after a rule; none without a verse. */
function credits(lessons: LessonForExport[]): string[] {
  const credit = scriptureCredit(lessons);
  return credit ? ['---', credit] : [];
}

/**
 * "Scripture: Berean Standard Bible (public domain).", for the translations the lessons quote; null
 * when they quote none.
 */
export function scriptureCredit(lessons: LessonForExport[]): string | null {
  const used = new Set<TranslationId>();
  const use = (ref: VerseRef) => isAppTranslation(ref.translation) && used.add(ref.translation);
  for (const { lesson, sections } of lessons) {
    lesson.mainPassages.forEach(use);
    for (const section of sections) citedRefs(section.body).forEach(use);
  }
  // Text from outside isn't the app's to credit: it's labelled where it's quoted.
  if (used.size === 0) return null;
  const names = [...used].toSorted().map((id) => TRANSLATION_NAMES[id]);
  return `Scripture: ${names.join(', ')} (public domain).`;
}

/** A file name from a title: "2026-10-12-the-good-shepherd.md" for a lesson, "john.md". */
export function fileName(title: string, date?: string): string {
  const slug =
    title
      .normalize('NFKD')
      .replaceAll(/\p{M}/gu, '')
      .toLowerCase()
      .replaceAll(/[^\p{L}\p{N}]+/gu, '-')
      .replaceAll(/^-|-$/g, '')
      .slice(0, 80)
      .replace(/-$/, '') || 'lesson';
  return `${date ? `${date}-` : ''}${slug}.md`;
}
