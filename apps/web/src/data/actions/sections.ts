import type { Section } from '@lamp/domain';
import { action, type NewRow, type RowPatch } from '../action.ts';
import { db as appDb, type LampDb } from '../db.ts';

export type SectionFields = NewRow<'section'>;

/** Stores a new section. The id comes from the editor, which showed it as a draft until it had text. */
export function createSection(fields: SectionFields, db: LampDb = appDb): Promise<Section> {
  return action(db, (w) => w.create('section', fields));
}

/** Changes a section's body, or moves it (a new `parentId` and `orderKey`). */
export function updateSection(
  id: string,
  patch: RowPatch<'section'>,
  db: LampDb = appDb,
): Promise<Section> {
  return action(db, (w) => w.update('section', id, patch));
}

/** What a delete removed, so Undo can bring exactly that back. */
export interface RemovedSections {
  sections: string[];
  sectionTags: string[];
}

/**
 * Deletes a section and its tags. A section with replies is only deleted with `withReplies`,
 * which deletes them too (the section menu asks first); otherwise it throws, so Backspace in an
 * emptied section can never take replies with it.
 */
export function removeSection(
  id: string,
  { withReplies = false } = {},
  db: LampDb = appDb,
): Promise<RemovedSections> {
  return action(db, async (w) => {
    const replies = await w.db.section
      .where('parentId')
      .equals(id)
      .filter((s) => s.deletedAt === null)
      .primaryKeys();
    if (replies.length > 0 && !withReplies) throw new Error(`Section ${id} has replies`);
    const removed: RemovedSections = { sections: [...replies, id], sectionTags: [] };
    for (const sectionId of removed.sections) {
      const tags = await w.db.sectionTag
        .where('sectionId')
        .equals(sectionId)
        .filter((t) => t.deletedAt === null)
        .primaryKeys();
      for (const tagId of tags) await w.remove('sectionTag', tagId);
      await w.remove('section', sectionId);
      removed.sectionTags.push(...tags);
    }
    return removed;
  });
}

/** Undoes `removeSection`: the sections come back where they were, with their tags. */
export function restoreSections(removed: RemovedSections, db: LampDb = appDb): Promise<void> {
  return action(db, async (w) => {
    // A parent before its replies, which `removeSection` lists last.
    for (const id of removed.sections.toReversed()) await w.restore('section', id);
    for (const id of removed.sectionTags) await w.restore('sectionTag', id);
  });
}
