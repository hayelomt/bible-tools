import { normaliseTagName, type Tag, tagKey } from '@lamp/domain';
import { action, RowNotFoundError, type Writer } from '../action.ts';
import { db as appDb, type LampDb } from '../db.ts';

/** What a tag is put on: a section or a whole lesson (F4). */
export interface TagTarget {
  kind: 'section' | 'lesson';
  id: string;
}

/** The join row that puts a tag on its target; Undo restores it by id. */
export interface TagLink {
  entity: 'sectionTag' | 'lessonTag';
  id: string;
}

/** The live link between a target and a tag, if there is one. */
async function liveLink(w: Writer, target: TagTarget, tagId: string): Promise<TagLink | undefined> {
  const live = (link: { deletedAt: string | null; tagId: string }) =>
    link.deletedAt === null && link.tagId === tagId;
  const row =
    target.kind === 'section'
      ? await w.db.sectionTag.where('sectionId').equals(target.id).filter(live).first()
      : await w.db.lessonTag.where('lessonId').equals(target.id).filter(live).first();
  return row && { entity: target.kind === 'section' ? 'sectionTag' : 'lessonTag', id: row.id };
}

/**
 * Tags a section or lesson by name. A name that's already a tag, in any case, is that tag ("Grace"
 * picks "grace"); any other name makes a new custom tag. Tagging twice with the same tag does
 * nothing more. One transaction, so two tabs can't both create the same name.
 */
export function addTag(
  target: TagTarget,
  typed: string,
  db: LampDb = appDb,
): Promise<{ tag: Tag; link: TagLink }> {
  return action(db, async (w) => {
    const name = normaliseTagName(typed);
    if (!name) throw new Error('A tag needs a name');
    const item = await w.db.rows(target.kind).get(target.id);
    if (!item || item.deletedAt !== null) throw new RowNotFoundError(target.kind, target.id);

    const key = tagKey(name);
    const tag =
      (await w.db.tag.filter((t) => t.deletedAt === null && tagKey(t.name) === key).first()) ??
      (await w.create('tag', { name, isSeeded: false }));

    const existing = await liveLink(w, target, tag.id);
    if (existing) return { tag, link: existing };
    const link: TagLink =
      target.kind === 'section'
        ? {
            entity: 'sectionTag',
            id: (await w.create('sectionTag', { tagId: tag.id, sectionId: target.id })).id,
          }
        : {
            entity: 'lessonTag',
            id: (await w.create('lessonTag', { tagId: tag.id, lessonId: target.id })).id,
          };
    return { tag, link };
  });
}

/** Takes a tag off its section or lesson. The tag itself stays, for other notes and autocomplete. */
export function removeTag(link: TagLink, db: LampDb = appDb): Promise<void> {
  return action(db, (w) => w.remove(link.entity, link.id));
}

/** Undoes `removeTag`, unless the same tag was put back on meanwhile. */
export function restoreTag(link: TagLink, db: LampDb = appDb): Promise<void> {
  return action(db, async (w) => {
    const row = await w.db.rows(link.entity).get(link.id);
    if (!row) throw new RowNotFoundError(link.entity, link.id);
    const target: TagTarget =
      'sectionId' in row
        ? { kind: 'section', id: row.sectionId }
        : { kind: 'lesson', id: row.lessonId };
    if (await liveLink(w, target, row.tagId)) return;
    await w.restore(link.entity, link.id);
  });
}
