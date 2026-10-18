import { headedBody, keysBetween, newId, type TemplateSection } from '@lamp/domain';
import { action } from '../action.ts';
import { db as appDb, type LampDb } from '../db.ts';

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
  { after, before, firstId }: TemplatePlace,
  db: LampDb = appDb,
): Promise<string[]> {
  return action(db, async (w) => {
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
        });
      }
    }
    return ids;
  });
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
