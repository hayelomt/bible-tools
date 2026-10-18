import {
  compareOrder,
  type Lesson,
  type NoteLinkAttrs,
  type Section,
  toPlainText,
} from '@lamp/domain';
import { db as appDb, type LampDb } from './db.ts';

/** How long a section's first words run in a link's title before "…". */
const FIRST_WORDS = 40;

/** A section's first words, quoted: "“I am the good shepherd…”". */
export function firstWords(section: Pick<Section, 'body'>): string {
  const line = toPlainText(section.body).split('\n', 1)[0]?.trim() ?? '';
  if (!line) return '“…”';
  if (line.length <= FIRST_WORDS) return `“${line}”`;
  const cut = line.slice(0, FIRST_WORDS);
  const space = cut.lastIndexOf(' ');
  return `“${(space > FIRST_WORDS / 2 ? cut.slice(0, space) : cut).trimEnd()}…”`;
}

/**
 * What a link chip names now (F23, §17.4): `live`, with its current title (a lesson's title, or
 * a section's lesson › first words); `deleted`, a tombstone here, shown with the title it last had
 * (`label`); or `missing`, not on this device, perhaps not synced yet, shown muted.
 */
export type LinkTarget =
  | {
      state: 'live';
      title: string;
      lesson: Lesson;
      /** For a link to a section. */
      section?: Section;
    }
  | { state: 'deleted' }
  | { state: 'missing' };

export function linkTitle(lesson: Pick<Lesson, 'title'>, section?: Pick<Section, 'body'>): string {
  return section ? `${lesson.title} › ${firstWords(section)}` : lesson.title;
}

/** Resolves a link chip against this device's rows. */
export async function linkTarget(link: NoteLinkAttrs, db: LampDb = appDb): Promise<LinkTarget> {
  if (link.targetType === 'lesson') {
    const lesson = await db.lesson.get(link.targetId);
    if (!lesson) return { state: 'missing' };
    if (lesson.deletedAt !== null) return { state: 'deleted' };
    return { state: 'live', title: linkTitle(lesson), lesson };
  }
  const section = await db.section.get(link.targetId);
  if (!section) return { state: 'missing' };
  const lesson = await db.lesson.get(section.lessonId);
  if (section.deletedAt !== null || !lesson || lesson.deletedAt !== null) {
    return { state: 'deleted' };
  }
  return { state: 'live', title: linkTitle(lesson, section), lesson, section };
}

/** A section that links to a lesson or section, for "Linked from" (M10-07). */
export interface Backlink {
  section: Section;
  lesson: Lesson;
}

/**
 * The live sections linking to a section, or to a lesson or any of its sections (wireframes/
 * thinking.md "Linked from"), newest lesson first, each section once.
 */
export async function linkedFrom(
  target: { kind: 'lesson' | 'section'; id: string },
  db: LampDb = appDb,
): Promise<Backlink[]> {
  const targets =
    target.kind === 'section'
      ? [target.id]
      : [target.id, ...(await db.section.where('lessonId').equals(target.id).primaryKeys())];
  const links = await db.link.where('targetId').anyOf(targets).toArray();
  const ids = [...new Set(links.map((link) => link.fromSectionId))];
  const sections = (await db.section.bulkGet(ids)).filter(
    (s): s is Section => !!s && s.deletedAt === null,
  );
  const lessons = new Map(
    (await db.lesson.bulkGet([...new Set(sections.map((s) => s.lessonId))]))
      .filter((l): l is Lesson => !!l && l.deletedAt === null)
      .map((l) => [l.id, l]),
  );
  return sections
    .flatMap((section) => {
      const lesson = lessons.get(section.lessonId);
      return lesson ? [{ section, lesson }] : [];
    })
    .toSorted(
      (a, b) =>
        b.lesson.date.localeCompare(a.lesson.date) ||
        b.lesson.createdAt.localeCompare(a.lesson.createdAt) ||
        compareOrder(a.section, b.section),
    );
}
