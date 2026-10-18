import { normaliseTagName, type Tag, tagKey } from '@lamp/domain';
import { action, RowNotFoundError, type Writer } from '../action.ts';
import { db as appDb, type LampDb } from '../db.ts';

/** What a tag is put on: a section, a whole lesson (F4), or an inbox item (F27). */
export interface TagTarget {
  kind: 'section' | 'lesson' | 'inboxItem';
  id: string;
}

/** The join row that puts a tag on its target; Undo restores it by id. */
export interface TagLink {
  entity: 'sectionTag' | 'lessonTag' | 'inboxItemTag';
  id: string;
}

/** Each target's join entity, and the column naming the target. */
export const TAG_LINKS = {
  section: { entity: 'sectionTag', owner: 'sectionId' },
  lesson: { entity: 'lessonTag', owner: 'lessonId' },
  inboxItem: { entity: 'inboxItemTag', owner: 'inboxItemId' },
} as const satisfies Record<TagTarget['kind'], { entity: TagLink['entity']; owner: string }>;

/** The live links on a target, any tag. */
export function liveLinksOf(db: LampDb, target: TagTarget) {
  const { entity, owner } = TAG_LINKS[target.kind];
  return db
    .rows(entity)
    .where(owner)
    .equals(target.id)
    .filter((link) => link.deletedAt === null);
}

/** The live link between a target and a tag, if there is one. */
async function liveLink(w: Writer, target: TagTarget, tagId: string): Promise<TagLink | undefined> {
  const row = await liveLinksOf(w.db, target)
    .and((link) => link.tagId === tagId)
    .first();
  return row && { entity: TAG_LINKS[target.kind].entity, id: row.id };
}

/** The target a link row puts its tag on. */
function targetOf(row: Record<string, unknown>): TagTarget {
  for (const [kind, { owner }] of Object.entries(TAG_LINKS)) {
    if (typeof row[owner] === 'string') return { kind: kind as TagTarget['kind'], id: row[owner] };
  }
  throw new Error('A tag link names no target');
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
    if (!normaliseTagName(typed)) throw new Error('A tag needs a name');
    const item = await w.db.rows(target.kind).get(target.id);
    if (!item || item.deletedAt !== null) throw new RowNotFoundError(target.kind, target.id);
    const tag = await tagNamed(w, typed);

    const existing = await liveLink(w, target, tag.id);
    if (existing) return { tag, link: existing };
    return { tag, link: await linkTag(w, target, tag.id) };
  });
}

/** A new link putting the tag on the target. */
export async function linkTag(w: Writer, target: TagTarget, tagId: string): Promise<TagLink> {
  const { entity, owner } = TAG_LINKS[target.kind];
  const fields = { tagId, [owner]: target.id } as never;
  return { entity, id: (await w.create(entity, fields)).id };
}

/**
 * Puts the tag on the target unless it's on already; the link made, or null. Placing an inbox
 * item moves its tags onto the section this way (§17.2).
 */
export async function ensureTag(
  w: Writer,
  target: TagTarget,
  tagId: string,
): Promise<TagLink | null> {
  if (await liveLink(w, target, tagId)) return null;
  return linkTag(w, target, tagId);
}

/** The live tag of that name, in any case, or a new custom one. */
export async function tagNamed(w: Writer, typed: string): Promise<Tag> {
  const name = normaliseTagName(typed);
  if (!name) throw new Error('A tag needs a name');
  const key = tagKey(name);
  return (
    (await w.db.tag.filter((t) => t.deletedAt === null && tagKey(t.name) === key).first()) ??
    w.create('tag', { name, isSeeded: false })
  );
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
    if (await liveLink(w, targetOf(row), row.tagId)) return;
    await w.restore(link.entity, link.id);
  });
}

/** A rename to a name another tag already has, in any case; tags aren't merged. */
export class TagNameTakenError extends Error {
  constructor(readonly existing: Tag) {
    super(`There's already a tag named ${existing.name}`);
    this.name = 'TagNameTakenError';
  }
}

/**
 * Renames a tag, everywhere it's used: notes link to it by id. A change of case alone ("hope" to
 * "Hope") is a rename; a name another tag has throws `TagNameTakenError`.
 */
export function renameTag(id: string, typed: string, db: LampDb = appDb): Promise<Tag> {
  return action(db, async (w) => {
    const name = normaliseTagName(typed);
    if (!name) throw new Error('A tag needs a name');
    const key = tagKey(name);
    const other = await w.db.tag
      .filter((t) => t.deletedAt === null && t.id !== id && tagKey(t.name) === key)
      .first();
    if (other) throw new TagNameTakenError(other);
    return w.update('tag', id, { name });
  });
}

const live = (link: { deletedAt: string | null }) => link.deletedAt === null;

/** Deletes a tag and takes it off every section, lesson and inbox item (the tag page asks first). */
export function deleteTag(id: string, db: LampDb = appDb): Promise<void> {
  return action(db, async (w) => {
    for (const { entity } of Object.values(TAG_LINKS)) {
      const links = await w.db.rows(entity).where('tagId').equals(id).filter(live).primaryKeys();
      for (const link of links) await w.remove(entity, link);
    }
    await w.remove('tag', id);
  });
}
