import {
  citationsFor,
  ENTITY_SCHEMAS,
  type EntityRow,
  isCitingEntity,
  linksFor,
  newId,
  type UserSettings,
} from '@lamp/domain';
import { emitLocalWrite, emitRowsChanged, type RowRef } from './changes.ts';
import { type LampDb, type RowEntity, SETTINGS_KEY, SYNC_STATE_KEY } from './db.ts';

/** The fields every synced row carries, which the writer fills in. */
type Meta = 'id' | 'createdAt' | 'updatedAt' | 'rev' | 'deletedAt';
export type NewRow<E extends RowEntity> = Omit<EntityRow<E>, Meta> & { id?: string };
export type RowPatch<E extends RowEntity> = Partial<Omit<EntityRow<E>, Meta>>;
export type SettingsPatch = Partial<Omit<UserSettings, 'rev' | 'updatedAt'>>;

/**
 * What an action uses to change data. Every write also rebuilds citations and links and queues a
 * change.
 */
export interface Writer {
  /** For reads inside the action; they see the action's own writes. */
  readonly db: LampDb;
  /** The action's time: device time adjusted by the clock offset (§6.5), the same for each write. */
  readonly now: string;
  create<E extends RowEntity>(entity: E, fields: NewRow<E>): Promise<EntityRow<E>>;
  update<E extends RowEntity>(entity: E, id: string, patch: RowPatch<E>): Promise<EntityRow<E>>;
  /** Leaves a tombstone, so the delete syncs. Deleting a deleted row does nothing. */
  remove(entity: RowEntity, id: string): Promise<void>;
  /** Brings back a row `remove` left as a tombstone (Undo). Restoring a live row does nothing. */
  restore(entity: RowEntity, id: string): Promise<void>;
  updateSettings(patch: SettingsPatch): Promise<UserSettings>;
}

export class RowNotFoundError extends Error {
  constructor(entity: string, id: string) {
    super(`No ${entity} with id ${id}`);
    this.name = 'RowNotFoundError';
  }
}

/** Actions being written. */
const inFlight = new Set<Promise<unknown>>();

/**
 * Runs `run` as one user action (TECH-DESIGN §6.1, §8.2): a single Dexie transaction that writes
 * the entity tables, their derived citations and the outbox entries together. If anything throws,
 * including a row that fails its schema, nothing from the action is saved and nothing is queued.
 *
 * `run` must only await Dexie calls: awaiting anything else (fetch, timers) ends the transaction.
 */
export function action<T>(db: LampDb, run: (writer: Writer) => Promise<T>): Promise<T> {
  const changed: RowRef[] = [];
  const write = db
    .transaction('rw', db.tables, async () => {
      const state = await db.syncState.get(SYNC_STATE_KEY);
      const now = new Date(Date.now() + (state?.clockOffsetMs ?? 0)).toISOString();
      return run(new TransactionWriter(db, now, changed));
    })
    .then((result) => {
      emitRowsChanged(changed);
      emitLocalWrite();
      return result;
    });
  inFlight.add(write);
  const done = () => inFlight.delete(write);
  void write.then(done, done);
  return write;
}

/**
 * Resolves once no action is being written, including ones queued behind those running now (a
 * section's writes run one after another). The page waits for this before it reloads.
 */
export async function writesSettled(): Promise<void> {
  while (inFlight.size > 0) {
    await Promise.allSettled(inFlight);
    // A queued write starts once the one before it is done.
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

class TransactionWriter implements Writer {
  constructor(
    readonly db: LampDb,
    readonly now: string,
    /** Every row written, reported once the transaction commits. */
    private readonly changed: RowRef[],
  ) {}

  async create<E extends RowEntity>(entity: E, fields: NewRow<E>): Promise<EntityRow<E>> {
    const row = {
      ...fields,
      id: fields.id ?? newId(),
      createdAt: this.now,
      updatedAt: this.now,
      rev: 0,
      deletedAt: null,
    } as unknown as EntityRow<E>;
    return this.write(entity, row);
  }

  async update<E extends RowEntity>(
    entity: E,
    id: string,
    patch: RowPatch<E>,
  ): Promise<EntityRow<E>> {
    const current = await this.db.rows(entity).get(id);
    if (!current || current.deletedAt !== null) throw new RowNotFoundError(entity, id);
    return this.write(entity, { ...current, ...patch, updatedAt: this.now }, [
      ...Object.keys(patch),
      'updatedAt',
    ]);
  }

  async remove(entity: RowEntity, id: string): Promise<void> {
    const current = await this.db.rows(entity).get(id);
    if (!current) throw new RowNotFoundError(entity, id);
    if (current.deletedAt !== null) return;
    const row = { ...current, updatedAt: this.now, deletedAt: this.now };
    await this.db.rows(entity).put(row);
    this.changed.push({ entity, id });
    await this.reindex(entity, row);
    await this.db.outbox.add({
      changeId: newId(),
      baseRev: current.rev,
      clientTime: this.now,
      entity,
      entityId: id,
      op: 'delete',
    } as OutboxChange);
  }

  async restore(entity: RowEntity, id: string): Promise<void> {
    const current = await this.db.rows(entity).get(id);
    if (!current) throw new RowNotFoundError(entity, id);
    if (current.deletedAt === null) return;
    await this.write(entity, { ...current, updatedAt: this.now, deletedAt: null }, [
      'deletedAt',
      'updatedAt',
    ]);
  }

  async updateSettings(patch: SettingsPatch): Promise<UserSettings> {
    const current = await this.db.userSettings.get(SETTINGS_KEY);
    if (!current) throw new RowNotFoundError('userSettings', SETTINGS_KEY);
    const settings = ENTITY_SCHEMAS.userSettings.parse({
      ...current,
      ...patch,
      updatedAt: this.now,
    });
    await this.db.userSettings.put(settings, SETTINGS_KEY);
    const { rev, ...row } = settings;
    await this.db.outbox.add({
      changeId: newId(),
      baseRev: rev,
      clientTime: this.now,
      entity: 'userSettings',
      op: 'upsert',
      row,
      changed: [...Object.keys(patch), 'updatedAt'] as (keyof typeof row)[],
    });
    return settings;
  }

  /**
   * Validates and stores a row, rebuilds its citations and queues the upsert. `changed` names the
   * fields edited, so a conflict takes only those from this device (§6.4); a new row sends none.
   */
  private async write<E extends RowEntity>(
    entity: E,
    input: EntityRow<E>,
    changed?: string[],
  ): Promise<EntityRow<E>> {
    const row = ENTITY_SCHEMAS[entity].parse(input) as EntityRow<E>;
    await this.db.rows(entity).put(row);
    this.changed.push({ entity, id: row.id });
    await this.reindex(entity, row);
    const { rev, ...sent } = row;
    await this.db.outbox.add({
      changeId: newId(),
      baseRev: rev,
      clientTime: this.now,
      entity,
      entityId: row.id,
      op: 'upsert',
      row: sent,
      ...(changed ? { changed } : {}),
    } as unknown as OutboxChange);
    return row;
  }

  private reindex(entity: RowEntity, row: EntityRow<RowEntity>): Promise<void> {
    return reindex(this.db, entity, row);
  }
}

/**
 * Rebuilds a row's citations (§8.4), and a section's links (§17.4), inside the caller's
 * transaction; a tombstone has none.
 */
export async function reindex(
  db: LampDb,
  entity: RowEntity,
  row: EntityRow<RowEntity>,
): Promise<void> {
  if (entity === 'section') {
    await db.link.where('fromSectionId').equals(row.id).delete();
    const links = linksFor(row as EntityRow<'section'>);
    await db.link.bulkAdd(links.map((link) => ({ id: newId(), ...link })));
  }
  if (!isCitingEntity(entity)) return;
  await db.citation.where('sourceId').equals(row.id).delete();
  const entries = citationsFor(entity, row as EntityRow<typeof entity>);
  await db.citation.bulkAdd(entries.map((entry) => ({ id: newId(), ...entry })));
}

/** Drops a row's derived index entries: its citations, and a section's links. */
export async function unindex(db: LampDb, id: string): Promise<void> {
  await db.citation.where('sourceId').equals(id).delete();
  await db.link.where('fromSectionId').equals(id).delete();
}

/** The outbox's change union can't be narrowed from a generic entity, so writes assert it. */
type OutboxChange = Parameters<LampDb['outbox']['add']>[0];
