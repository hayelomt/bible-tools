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

/**
 * Deletes a section with no replies, and its tags. The editor uses it for a section emptied with
 * Backspace; deleting a section with replies asks first and is M2-08's.
 */
export function removeSection(id: string, db: LampDb = appDb): Promise<void> {
  return action(db, async (w) => {
    const replies = await w.db.section
      .where('parentId')
      .equals(id)
      .filter((s) => s.deletedAt === null)
      .count();
    if (replies > 0) throw new Error(`Section ${id} has replies`);
    const tags = await w.db.sectionTag
      .where('sectionId')
      .equals(id)
      .filter((t) => t.deletedAt === null)
      .toArray();
    for (const t of tags) await w.remove('sectionTag', t.id);
    await w.remove('section', id);
  });
}
