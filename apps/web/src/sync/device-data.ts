import {
  ENTITY_NAMES,
  type EntityRow,
  type InlineNode,
  newId,
  type Section,
  type SectionBody,
  SEED_TAGS,
} from '@lamp/domain';
import { reindex } from '@/data/action.ts';
import { emitRowsChanged, type RowRef } from '@/data/changes.ts';
import {
  type LampDb,
  type OutboxEntry,
  type RowEntity,
  SETTINGS_KEY,
  SYNC_STATE_KEY,
  type SyncState,
} from '@/data/db.ts';
import { rowKey } from './outbox.ts';

/** The account the device's notes are being given to. */
export interface Owner {
  id: string;
  email: string;
}

/** The row entities, in an order where a row comes after the rows it names. */
const ROW_ENTITIES = ENTITY_NAMES.filter((name): name is RowEntity => name !== 'userSettings');

/**
 * The columns that name another row, and that row's entity; the same as the server's checks
 * (`apps/api/src/sync/entity-tables.ts`). An optional reference to a row that isn't copied is
 * cleared; any other means the row isn't copied either.
 */
const REFS: Readonly<Record<RowEntity, Readonly<Record<string, RowEntity>>>> = {
  series: {},
  lesson: { seriesId: 'series' },
  section: { lessonId: 'lesson', parentId: 'section', conflictOf: 'section' },
  tag: {},
  sectionTag: { tagId: 'tag', sectionId: 'section' },
  lessonTag: { tagId: 'tag', lessonId: 'lesson' },
  takeaway: { lessonId: 'lesson' },
  question: { lessonId: 'lesson', splitFromId: 'question' },
  highlight: { promotedSectionId: 'section' },
  memoryItem: {},
  inboxItem: { placedInSectionId: 'section' },
  inboxItemTag: { tagId: 'tag', inboxItemId: 'inboxItem' },
  questionEntry: { questionId: 'question', lessonId: 'lesson', sectionId: 'section' },
  template: {},
  passageVisit: {},
  resurfaceDismissal: {},
};
const OPTIONAL_REFS = new Set([
  'lesson.seriesId',
  'section.conflictOf',
  'highlight.promotedSectionId',
  'inboxItem.placedInSectionId',
  'questionEntry.sectionId',
  'question.splitFromId',
]);

type AnyRow = EntityRow<RowEntity> & Record<string, unknown>;

const live = (row: { deletedAt: string | null }) => row.deletedAt === null;

/**
 * How many rows have changes that never synced, which dialogs warn about (wireframes/account.md).
 * The seeded tags a device makes for itself aren't the user's changes, so they don't count.
 */
export async function unsyncedCount(db: LampDb): Promise<number> {
  const seeded = new Set(await db.tag.filter((tag) => tag.isSeeded && tag.rev === 0).primaryKeys());
  const entries = await db.outbox.toArray();
  const ours = entries.filter((entry) => !(entry.entity === 'tag' && seeded.has(entry.entityId)));
  return new Set(ours.map(rowKey)).size;
}

/** The notes on the device, as the removal dialogs count them. */
export async function noteCounts(db: LampDb) {
  return {
    lessons: await db.lesson.filter(live).count(),
    highlights: await db.highlight.filter(live).count(),
    memoryItems: await db.memoryItem.filter(live).count(),
    inboxItems: await db.inboxItem.filter(live).count(),
  };
}

/**
 * Deletes every note on the device, unsynced changes included, and starts again as a new device
 * would: the 24 seeded tags and the settings at rev 0, so the account's settings win (§6.6).
 *
 * With `owner`, the device then belongs to that account and pulls it ("Remove them from this
 * device"). Without, it's a guest that never signed in, with a new device id (Settings → "Remove
 * notes from this device"). The settings are kept either way; they're how the device looks,
 * not notes.
 */
export async function removeNotes(db: LampDb, owner: Owner | null): Promise<void> {
  const removed: RowRef[] = [];
  await db.transaction('rw', db.tables, async () => {
    for (const entity of ROW_ENTITIES) {
      for (const id of await db.rows(entity).toCollection().primaryKeys()) {
        removed.push({ entity, id });
      }
      await db.rows(entity).clear();
    }
    await db.citation.clear();
    await db.link.clear();
    await db.outbox.clear();
    await db.digestDraft.clear();
    await resetSettings(db);
    const now = new Date().toISOString();
    for (const name of SEED_TAGS) {
      await queueCreate(db, 'tag', {
        id: newId(),
        name,
        isSeeded: true,
        createdAt: now,
        updatedAt: now,
        rev: 0,
        deletedAt: null,
      } as AnyRow);
    }
    await handOver(db, owner, owner ? undefined : newId());
  });
  emitRowsChanged(removed);
}

/**
 * Copies every note on the device into `owner`'s account ("Add them to this account", §6.6). The
 * notes' ids belong to another account on the server, so each live row gets a new id, with every
 * reference remapped, and the outbox becomes the copies' creates: unsynced changes from the other
 * account go to this one, never to that one. Deleted rows aren't copied. Tags are matched to the
 * account's by name on the first sync (`matchTagsByName`).
 */
export async function copyNotes(db: LampDb, owner: Owner): Promise<void> {
  const changed: RowRef[] = [];
  await db.transaction('rw', db.tables, async () => {
    const rows = new Map<RowEntity, AnyRow[]>();
    for (const entity of ROW_ENTITIES) {
      const all = (await db.rows(entity).toArray()) as AnyRow[];
      for (const row of all) changed.push({ entity, id: row.id });
      rows.set(entity, all.filter(live));
    }
    rows.set('section', parentsFirst(rows.get('section')!));

    // A row is copied when every row it must name is copied, which can take a few passes.
    const kept = new Set<string>();
    for (let again = true; again;) {
      again = false;
      for (const entity of ROW_ENTITIES) {
        for (const row of rows.get(entity)!) {
          if (kept.has(row.id)) continue;
          const missing = Object.keys(REFS[entity]).some(
            (column) =>
              !OPTIONAL_REFS.has(`${entity}.${column}`) &&
              row[column] != null &&
              !kept.has(row[column] as string),
          );
          if (missing) continue;
          kept.add(row.id);
          again = true;
        }
      }
    }

    const ids = new Map([...kept].map((id) => [id, newId()]));
    const copies: Array<[RowEntity, AnyRow]> = [];
    for (const entity of ROW_ENTITIES) {
      for (const row of rows.get(entity)!) {
        if (!kept.has(row.id)) continue;
        const copy: AnyRow = { ...row, id: ids.get(row.id)!, rev: 0 };
        for (const column of Object.keys(REFS[entity])) {
          const id = row[column] as string | null | undefined;
          if (id != null) copy[column] = ids.get(id) ?? null;
        }
        // Links in a body point at the copies too; one to a row that isn't copied stays broken.
        if (entity === 'section') copy.body = relinked((row as Section).body, ids);
        // A dismissal's target is a lesson or question id (or a passage, kept as it is).
        if (entity === 'resurfaceDismissal') {
          copy.targetKey = ids.get(row.targetKey as string) ?? row.targetKey;
        }
        copies.push([entity, copy]);
      }
    }

    for (const entity of ROW_ENTITIES) await db.rows(entity).clear();
    await db.citation.clear();
    await db.link.clear();
    await db.outbox.clear();
    for (const [entity, copy] of copies) {
      await queueCreate(db, entity, copy);
      changed.push({ entity, id: copy.id });
    }
    // A digest draft's link chips point at the copies too.
    await db.digestDraft.toCollection().modify((draft) => {
      draft.sections = draft.sections.map((s) => ({ ...s, body: relinked(s.body, ids) }));
    });
    await resetSettings(db);
    await handOver(db, owner);
  });
  emitRowsChanged(changed);
}

/** A body with each link chip's target swapped for its copy, where it has one. */
function relinked(body: SectionBody, ids: ReadonlyMap<string, string>): SectionBody {
  const inline = (nodes: InlineNode[]) =>
    nodes.map((node) =>
      node.type === 'noteLink' && ids.has(node.attrs.targetId)
        ? { ...node, attrs: { ...node.attrs, targetId: ids.get(node.attrs.targetId)! } }
        : node,
    );
  const walk = <T>(value: T): T => {
    if (Array.isArray(value)) return value.map(walk) as T;
    if (typeof value !== 'object' || value === null) return value;
    const node = value as { type?: string; content?: unknown[] };
    if ((node.type === 'paragraph' || node.type === 'heading') && node.content) {
      return { ...node, content: inline(node.content as InlineNode[]) } as T;
    }
    return node.content ? ({ ...node, content: walk(node.content) } as T) : value;
  };
  return walk(body);
}

/** Stores a row with its citations and links, and queues its create. */
async function queueCreate(db: LampDb, entity: RowEntity, row: AnyRow): Promise<void> {
  await db.rows(entity).put(row as never);
  await reindex(db, entity, row);
  const { rev, ...sent } = row;
  await db.outbox.add({
    changeId: newId(),
    baseRev: rev,
    clientTime: row.updatedAt,
    entity,
    entityId: row.id,
    op: 'upsert',
    row: sent,
  } as unknown as OutboxEntry);
}

/** Keeps the device's settings, at rev 0 and unqueued, so the account's take their place. */
async function resetSettings(db: LampDb): Promise<void> {
  const settings = await db.userSettings.get(SETTINGS_KEY);
  if (settings) await db.userSettings.put({ ...settings, rev: 0 }, SETTINGS_KEY);
}

/** The device starts over with `owner`, pulling from the beginning. */
async function handOver(db: LampDb, owner: Owner | null, deviceId?: string): Promise<void> {
  const patch: Partial<SyncState> = {
    ownerUserId: owner?.id ?? null,
    ownerEmail: owner?.email ?? null,
    cursor: 0,
    lastPushAt: null,
    lastPullAt: null,
  };
  if (deviceId) patch.deviceId = deviceId;
  await db.syncState.update(SYNC_STATE_KEY, patch);
}

/** Sections ordered so a parent comes before its children (a child's create names its parent). */
function parentsFirst(sections: AnyRow[]): AnyRow[] {
  const byId = new Map(sections.map((section) => [section.id, section]));
  const depth = (section: AnyRow, seen = 0): number => {
    const parent = byId.get(section.parentId as string);
    return parent && seen < sections.length ? 1 + depth(parent, seen + 1) : 0;
  };
  return sections
    .map((section) => [depth(section), section] as const)
    .toSorted((a, b) => a[0] - b[0])
    .map(([, section]) => section);
}
