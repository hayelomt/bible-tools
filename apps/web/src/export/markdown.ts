import {
  citedRefs,
  type CompileGroup,
  escapeMarkdown,
  formatPassage,
  type Lesson,
  type LinkWriter,
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
import { linkTitle } from '@/data/links.ts';
import type { QuestionView } from '@/data/question-status.ts';
import type { Commentary, CompiledNote } from '@/search/compile.ts';
import { longDate } from '@/lib/dates.ts';
import { count, SERIES_KIND_LABELS, KIND_LABELS } from '@/lib/labels.ts';

/**
 * Markdown export (F11, TECH-DESIGN §8.7, wireframes/export.md): a lesson, or a series with its
 * lessons, as a document that reads well as text and renders on GitHub. Pure; `load.ts` reads
 * the rows.
 *
 * - Sections in the lesson's order; a reply is quoted under its section (`> `), so it shows
 *   indented. Verse chips read "John 10:9 (BSB)", with their text quoted after the paragraph.
 * - A section's tags follow it in italics; the lesson's are in its header with its passages.
 * - Takeaways as a list, questions as a task list: `[x]` answered, `[ ]` open or parked.
 * - A link chip links to the file its lesson's own export gets, with its current title (F23,
 *   decided in M10-05): "[The Good Shepherd](2026-10-12-the-good-shepherd.md)". Lessons exported
 *   into one folder link to each other. A deleted target is its last title and "(deleted)".
 * - The translations quoted are credited at the end (decided 2026-10-14).
 */

/** What the export knows of each link target it found, by id: null for one deleted here. */
export type LinkTargets = ReadonlyMap<
  string,
  { lesson: Pick<Lesson, 'title' | 'date'>; section?: Pick<Section, 'body'> } | null
>;

/**
 * Writes link chips as relative references to the target lesson's file. A target not on this
 * device has no file to point at, so it's its title alone.
 */
export function linkWriter(targets: LinkTargets): LinkWriter {
  return (link) => {
    if (!targets.has(link.targetId)) return { text: link.label };
    const target = targets.get(link.targetId);
    if (!target) return null;
    return {
      text: linkTitle(target.lesson, target.section),
      href: fileName(target.lesson.title, target.lesson.date),
    };
  };
}

export interface LessonForExport {
  lesson: Lesson;
  /** The lesson's live sections, in any order. */
  sections: Section[];
  /** Tag names by section id. */
  sectionTags: ReadonlyMap<string, string[]>;
  /** The lesson's own tags. */
  tags: string[];
  takeaways: Takeaway[];
  questions: QuestionView[];
  /** The targets of the link chips in its sections. */
  links?: LinkTargets;
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

/**
 * The compile view (F22, M10-04) as one document: "Commentary on Romans 8", then each group's
 * passage as a heading over its sections, each followed by its lesson and date. A book has a
 * heading for each chapter above its groups. A reply nested under its section is quoted, as in a
 * lesson; a section under several passages says where else it is, or, shown once, points there.
 */
export function commentaryMarkdown(
  title: string,
  data: Commentary,
  wholeBook: boolean,
  links: LinkTargets = new Map(),
): string {
  const writer = linkWriter(links);
  const blocks = [
    `# Commentary on ${escapeMarkdown(title)}`,
    `${count(data.sections, 'section')} in ${count(data.lessons, 'lesson')}`,
  ];
  const level = wholeBook ? 3 : 2;
  let chapter: number | null = null;
  for (const group of data.groups) {
    if (wholeBook && group.passage.chapter !== chapter) {
      chapter = group.passage.chapter;
      blocks.push(`## ${formatPassage({ book: group.passage.book, chapter })}`);
    }
    blocks.push(`${'#'.repeat(level)} ${formatPassage(group.passage)}`);
    for (const entry of group.entries) blocks.push(commentaryEntry(entry, level + 1, writer));
  }
  const sections = data.groups.flatMap((g) =>
    g.entries.filter((e) => !e.shownUnder).map((e) => e.item.section),
  );
  const credit = creditFor(sections.flatMap((s) => citedRefs(s.body)));
  return document([...blocks, ...(credit ? ['---', credit] : [])]);
}

function commentaryEntry(
  entry: CompileGroup<CompiledNote>['entries'][number],
  level: number,
  links: LinkWriter,
) {
  const { section, lesson, nested } = entry.item;
  const byline = `*${escapeMarkdown(lesson.title)} · ${longDate(lesson.date)}*`;
  if (entry.shownUnder) {
    return `${byline} — under ${formatPassage(entry.shownUnder)}, above.`;
  }
  const also =
    entry.also.length > 0
      ? `*Also under ${entry.also.map((p) => formatPassage(p)).join(', ')}*`
      : '';
  const lines = [toMarkdown(section.body, { headingLevel: level, links }).trimEnd(), byline, also]
    .filter(Boolean)
    .join('\n\n');
  return nested ? quoted(lines) : lines;
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
  const links = linkWriter(data.links ?? new Map());

  for (const row of outline(data.sections)) {
    const body = toMarkdown(row.item.body, { headingLevel: level + 1, links }).trimEnd();
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
    [longDate(lesson.date), KIND_LABELS[lesson.kind], who].filter(Boolean).join(' · '),
    [...lesson.mainPassages.map((p) => p.display), ...tags.map(tagLabel)].join(' · '),
  ].filter(Boolean);
}

/** A tag as the exports show it: "#grace". */
export function tagLabel(name: string): string {
  return `#${name}`;
}

function questionLine(question: QuestionView): string {
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
  return creditFor(
    lessons.flatMap(({ lesson, sections }) => [
      ...lesson.mainPassages,
      ...sections.flatMap((section) => citedRefs(section.body)),
    ]),
  );
}

/** The credit for the translations of `refs`; null when none is the app's. */
function creditFor(refs: readonly VerseRef[]): string | null {
  const used = new Set<TranslationId>();
  for (const ref of refs) if (isAppTranslation(ref.translation)) used.add(ref.translation);
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
