import {
  builtInTemplate,
  headedBody,
  isUntouchedHeading,
  keysBetween,
  type Lesson,
  type LessonKind,
  newId,
  sameJson,
  structureOf,
  type Template,
  type TemplateSection,
} from '@lamp/domain';
import { action, type RowPatch, type Writer } from '../action.ts';
import { db as appDb, type LampDb, SETTINGS_KEY } from '../db.ts';

/** Where a template's sections go: between two top-level order keys, null for either end. */
export interface TemplatePlace {
  after: string | null;
  before: string | null;
  /** The first section's id, so the list can put the cursor in it as it's stored. */
  firstId?: string;
}

/**
 * Applies a template (F25, §17.6) in one action: each of its sections a top-level section headed
 * with its title and an empty line, its children replies made the same way. Afterwards they're
 * ordinary sections; nothing links back to the template. Returns the top-level sections' ids in
 * order, for Undo (`removeApplied`).
 */
export function applyTemplate(
  lessonId: string,
  structure: readonly TemplateSection[],
  place: TemplatePlace,
  db: LampDb = appDb,
): Promise<string[]> {
  return action(db, (w) => placeTemplate(w, lessonId, structure, place));
}

/** `applyTemplate` inside another action. */
async function placeTemplate(
  w: Writer,
  lessonId: string,
  structure: readonly TemplateSection[],
  { after, before, firstId }: TemplatePlace,
): Promise<string[]> {
  const keys = keysBetween(after, before, structure.length);
  const ids: string[] = [];
  for (const [index, { title, children = [] }] of structure.entries()) {
    const section = await w.create('section', {
      id: index === 0 ? (firstId ?? newId()) : newId(),
      lessonId,
      parentId: null,
      orderKey: keys[index]!,
      body: headedBody(title),
      conflictOf: null,
      conflictDevice: null,
      sourceAt: null,
      sourcePage: null,
    });
    ids.push(section.id);
    const replyKeys = keysBetween(null, null, children.length);
    for (const [n, child] of children.entries()) {
      await w.create('section', {
        lessonId,
        parentId: section.id,
        orderKey: replyKeys[n]!,
        body: headedBody(child.title),
        conflictOf: null,
        conflictDevice: null,
        sourceAt: null,
        sourcePage: null,
      });
    }
  }
  return ids;
}

/** Undo of `applyTemplate`: its sections go, with their replies and anything since added to them. */
export function removeApplied(ids: readonly string[], db: LampDb = appDb): Promise<void> {
  return action(db, async (w) => {
    for (const id of ids) {
      const replies = await w.db.section
        .where('parentId')
        .equals(id)
        .filter((s) => s.deletedAt === null)
        .primaryKeys();
      for (const sectionId of [...replies, id]) {
        const tags = await w.db.sectionTag
          .where('sectionId')
          .equals(sectionId)
          .filter((t) => t.deletedAt === null)
          .primaryKeys();
        for (const tagId of tags) await w.remove('sectionTag', tagId);
        await w.remove('section', sectionId);
      }
    }
  });
}

/** What a template is called and makes, built in or the user's own. */
export interface TemplateChoice {
  /** A built-in's key, or the template's id: what a default names. */
  key: string;
  name: string;
  structure: readonly TemplateSection[];
}

/** The template a default names: a built-in, or a template that hasn't been deleted. */
export async function templateByKey(
  key: string | null,
  db: LampDb,
): Promise<TemplateChoice | null> {
  if (key === null) return null;
  const builtIn = builtInTemplate(key);
  if (builtIn) return builtIn;
  const own = await db.template.get(key);
  return own && own.deletedAt === null ? { key: own.id, ...own } : null;
}

/** The template a new lesson of this kind starts with (M10-14), or null. */
async function defaultFor(kind: LessonKind, db: LampDb): Promise<TemplateChoice | null> {
  const settings = await db.userSettings.get(SETTINGS_KEY);
  return templateByKey(settings?.defaultTemplates[kind] ?? null, db);
}

/**
 * A lesson takes its kind's default template (F25, M10-14, §17.6): a new lesson, which has no
 * sections, or one whose kind changes while it holds only the previous kind's default as that
 * made it, untouched: no text under the headings, no tags, no answers. Then the old default's
 * sections go and the new one's take their place. Anything else stays as it is.
 */
export async function startWithDefault(
  w: Writer,
  lesson: Lesson,
  from?: LessonKind,
): Promise<void> {
  const sections = (await w.db.section.where('lessonId').equals(lesson.id).toArray()).filter(
    (s) => s.deletedAt === null,
  );
  let before: string | null = null;
  if (sections.length > 0) {
    const previous = from ? await defaultFor(from, w.db) : null;
    if (!previous || !sections.every((s) => isUntouchedHeading(s.body))) return;
    if (!sameJson(structureOf(sections), previous.structure)) return;
    const ids = sections.map((s) => s.id);
    const tagged = await w.db.sectionTag.where('sectionId').anyOf(ids).filter(isLive).count();
    const answers = await w.db.questionEntry.where('sectionId').anyOf(ids).filter(isLive).count();
    if (tagged + answers > 0) return;
    // The new sections go where the old ones were, before the empty one the lesson ends with.
    before = sections.map((s) => s.orderKey).toSorted()[0]!;
    for (const section of sections) await w.remove('section', section.id);
  }
  const template = await defaultFor(lesson.kind, w.db);
  if (template) await placeTemplate(w, lesson.id, template.structure, { after: null, before });
}

const isLive = (row: { deletedAt: string | null }) => row.deletedAt === null;

/** A template of the user's own (M10-13): made from scratch, or a copy of a built-in. */
export function createTemplate(
  fields: { name: string; structure: TemplateSection[] },
  db: LampDb = appDb,
): Promise<Template> {
  return action(db, (w) => w.create('template', fields));
}

export function updateTemplate(
  id: string,
  patch: RowPatch<'template'>,
  db: LampDb = appDb,
): Promise<Template> {
  return action(db, (w) => w.update('template', id, patch));
}

/**
 * Deletes a template at once, with Undo (`restoreTemplate`). Lessons made from it don't change, and
 * a default that names it counts as none.
 */
export function deleteTemplate(id: string, db: LampDb = appDb): Promise<void> {
  return action(db, (w) => w.remove('template', id));
}

export function restoreTemplate(id: string, db: LampDb = appDb): Promise<void> {
  return action(db, (w) => w.restore('template', id));
}

/**
 * "Save as template…" (wireframes/thinking.md): the headings of a lesson's sections and replies,
 * not the text, as a new template. Null when no section has a heading, and nothing is saved.
 */
export function saveLessonAsTemplate(
  lessonId: string,
  name: string,
  db: LampDb = appDb,
): Promise<Template | null> {
  return action(db, async (w) => {
    const sections = (await w.db.section.where('lessonId').equals(lessonId).toArray()).filter(
      isLive,
    );
    const structure = structureOf(sections);
    return structure ? w.create('template', { name, structure }) : null;
  });
}
