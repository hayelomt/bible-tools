import {
  type Change,
  type CitingEntity,
  type ConflictResolution,
  changeSchema,
  citationsFor,
  conflictedCopy,
  type EntityRow,
  isCitingEntity,
  keyBetween,
  linksFor,
  newId,
  type Outcome,
  type SectionBody,
  PARENT_COLUMNS,
  type PushEnvelope,
  type PushResponse,
  type PushResult,
  resolveDelete,
  resolveUpsert,
  sameJson,
  type SyncRow,
} from '@lamp/domain';
import { Injectable } from '@nestjs/common';
import type { z } from 'zod';
import { Prisma, type User } from '../generated/prisma/client.js';
import { groupOfSeries, inFeed, isFeedEntity, refreshFeed } from '../groups/feed.js';
// A value import, not `import type`: Nest resolves the constructor parameter from its class.
import { PrismaService } from '../prisma/prisma.service.js';
import {
  ENTITY_TABLES,
  type RowEntity,
  type StoredRow,
  toColumns,
  toRow,
  type Tx,
} from './entity-tables.js';
import { assertSupportedClient, assertVerified } from './sync-access.js';
import { SyncErrorCode } from './sync.errors.js';

type RowChange = Exclude<Change, { entity: 'userSettings' }>;
type RowUpsert = Extract<RowChange, { op: 'upsert' }>;
type SettingsChange = Extract<Change, { entity: 'userSettings' }>;
type Rejected = Extract<PushResult, { status: 'rejected' }>;

/** The pushing device: its id is recorded with each change, its name with each body it writes. */
interface Device {
  id: string;
  name: string;
}

/** Prisma's codes for a unique, foreign key, check or not-null violation. */
const CONSTRAINT_ERRORS = new Set(['P2002', 'P2003', 'P2004', 'P2011']);

/**
 * An earlier change of this batch to the same row, applied at `rev`. A later change with the same
 * `baseRev` was made on top of it on the device, so it builds on `rev` instead.
 */
interface Chain {
  baseRev: number;
  rev: number;
}

@Injectable()
export class PushService {
  constructor(private readonly prisma: PrismaService) {}

  /** Applies the changes in order, each in its own transaction, with one result per change (§6.2). */
  async push(user: User, request: PushEnvelope): Promise<PushResponse> {
    assertSupportedClient(request.clientVersion);
    assertVerified(user);
    const chains = new Map<string, Chain>();
    const device = { id: request.deviceId, name: request.deviceName };
    const results: PushResult[] = [];
    for (const change of request.changes) {
      const key = `${String(change.entity)}:${String(change.entityId ?? '')}`;
      const result = await this.pushOne(user.id, device, change, chains.get(key));
      if (result.status === 'applied' && typeof change.baseRev === 'number') {
        chains.set(key, { baseRev: change.baseRev, rev: result.rev });
      } else {
        chains.delete(key);
      }
      results.push(result);
    }
    return { results };
  }

  private async pushOne(
    userId: string,
    device: Device,
    raw: { changeId: string },
    chain: Chain | undefined,
  ): Promise<PushResult> {
    try {
      return await this.prisma.$transaction((tx) => this.apply(tx, userId, device, raw, chain));
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError)) throw error;
      if (!CONSTRAINT_ERRORS.has(error.code)) throw error;
      // Either a push of the same change committed first (the change id is the primary key of
      // `sync_change`), or the row broke a rule only the database checks.
      const rejection =
        error.code === 'P2002'
          ? reject(raw.changeId, SyncErrorCode.DUPLICATE, 'Another row already has this value')
          : reject(raw.changeId, SyncErrorCode.CONSTRAINT_VIOLATION, 'The row is not allowed');
      return this.prisma.$transaction(
        async (tx) =>
          (await this.stored(tx, userId, raw.changeId)) ??
          this.record(tx, userId, device.id, rejection),
      );
    }
  }

  private async apply(
    tx: Tx,
    userId: string,
    device: Device,
    raw: { changeId: string },
    chain: Chain | undefined,
  ): Promise<PushResult> {
    // Every push of this user waits here, so the rows read below can't change before the write,
    // and revisions commit in order (§6.3).
    await tx.$queryRaw`SELECT 1 FROM "user" WHERE id = ${userId}::uuid FOR UPDATE`;

    const stored = await this.stored(tx, userId, raw.changeId);
    if (stored) return stored;

    const parsed = changeSchema.safeParse(raw);
    if (!parsed.success) {
      return this.record(
        tx,
        userId,
        device.id,
        reject(raw.changeId, SyncErrorCode.INVALID_CHANGE, describeIssues(parsed.error)),
      );
    }
    const change = parsed.data;
    const baseRev = chain?.baseRev === change.baseRev ? chain.rev : change.baseRev;
    const result =
      change.entity === 'userSettings'
        ? await this.applySettings(tx, userId, change, baseRev)
        : await this.applyRow(tx, userId, device.name, change, baseRev);
    return this.record(tx, userId, device.id, result);
  }

  private async applyRow(
    tx: Tx,
    userId: string,
    deviceName: string,
    change: RowChange,
    baseRev: number,
  ): Promise<PushResult> {
    const { changeId, entity, entityId } = change;
    const current = await ENTITY_TABLES[entity].model(tx).findUnique({ where: { id: entityId } });
    if (current && current.userId !== userId) {
      return reject(changeId, SyncErrorCode.ID_TAKEN, 'This id belongs to another account');
    }
    let incoming: SyncRow<RowEntity> | undefined;
    if (change.op === 'upsert') {
      const problem = await this.checkReferences(tx, userId, entity, change.row);
      if (problem) return reject(changeId, SyncErrorCode.REFERENCE_NOT_FOUND, problem);
      const grouped = await this.groupColumns(tx, userId, change, current);
      if (typeof grouped === 'string') {
        return reject(changeId, SyncErrorCode.REFERENCE_NOT_FOUND, grouped);
      }
      incoming = grouped;
    }
    const shared = await this.checkShared(tx, change, current);
    if (shared) return reject(changeId, SyncErrorCode.IN_GROUP, shared);

    const server = current ? toRow<RowEntity>(entity, current) : null;
    const serverRev = Number(current?.rev ?? 0);
    let outcome: Outcome<SyncRow<RowEntity>>;
    if (change.op === 'upsert') {
      outcome = resolveUpsert<SyncRow<RowEntity>>({
        server,
        serverRev,
        baseRev,
        incoming: incoming!,
        changed: change.changed,
        serverBodyChanged:
          current !== null && ((current.bodyRev as bigint | undefined) ?? 0n) > baseRev,
      });
    } else if (server) {
      outcome = resolveDelete({ server, serverRev, baseRev, time: change.clientTime });
    } else {
      return reject(changeId, SyncErrorCode.NOT_FOUND, `There is no ${entity} with this id`);
    }

    const rev = await this.nextRev(tx, userId);
    await this.writeRow(tx, userId, entity, current, outcome.row, rev, deviceName);
    const copyId = outcome.copy
      ? await this.writeCopy(tx, userId, outcome.row as SyncRow<'section'>, rev, {
          ...outcome.copy,
          // The stored body was written by the device that last changed it.
          device:
            outcome.copy.from === 'device'
              ? deviceName
              : ((current?.bodyDevice as string | null | undefined) ?? null),
        })
      : undefined;
    const written: Written[] = [{ entity, id: entityId }];
    if (copyId) written.push({ entity: 'section', id: copyId });
    const restored =
      outcome.keepsClientEdit && outcome.row.deletedAt === null
        ? await this.restoreParents(tx, entity, outcome.row, rev, written)
        : false;
    // What's shared with a group shows the group what it now is (§17.12).
    await refreshFeed(tx, written.filter(isGroupVisible));
    return resultOf(
      changeId,
      rev,
      outcome.resolution ?? (restored ? 'parent-restored' : null),
      copyId,
    );
  }

  private async applySettings(
    tx: Tx,
    userId: string,
    change: SettingsChange,
    baseRev: number,
  ): Promise<PushResult> {
    const current = await tx.userSettings.findUnique({ where: { userId } });
    const outcome = resolveUpsert({
      server: current ? toRow('userSettings', current) : null,
      serverRev: Number(current?.rev ?? 0),
      baseRev,
      incoming: change.row,
      changed: change.changed,
    });
    const rev = await this.nextRev(tx, userId);
    const data = { ...outcome.row, updatedAt: new Date(outcome.row.updatedAt), rev };
    await tx.userSettings.upsert({ where: { userId }, create: { ...data, userId }, update: data });
    return resultOf(change.changeId, rev, outcome.resolution);
  }

  /** Stores a row at `rev`, written by `device`, and rebuilds its citations and links. */
  private async writeRow(
    tx: Tx,
    userId: string,
    entity: RowEntity,
    current: StoredRow | null,
    row: SyncRow<RowEntity>,
    rev: bigint,
    device: string | null,
  ): Promise<void> {
    const model = ENTITY_TABLES[entity].model(tx);
    const { id, ...columns } = toColumns(entity, row);
    const data: Record<string, unknown> = { ...columns, rev };
    if (entity === 'section') {
      const sameBody = current !== null && sameJson(current.body, (row as SyncRow<'section'>).body);
      data.bodyRev = sameBody ? current.bodyRev : rev;
      data.bodyDevice = sameBody ? current.bodyDevice : device;
    }
    if (current) await model.update({ where: { id: row.id }, data });
    else await model.create({ data: { ...data, id, userId } });
    if (isCitingEntity(entity)) await this.reindex(tx, userId, entity, row);
    if (entity === 'section') await this.relink(tx, userId, row as SyncRow<'section'>);
  }

  /** Saves a body that lost as a new sibling right after the section (§6.4); returns its id. */
  private async writeCopy(
    tx: Tx,
    userId: string,
    section: SyncRow<'section'>,
    rev: bigint,
    copy: { body: SectionBody; time: string; device: string | null },
  ): Promise<string> {
    const next = await tx.section.findFirst({
      where: {
        userId,
        lessonId: section.lessonId,
        parentId: section.parentId,
        deletedAt: null,
        orderKey: { gt: section.orderKey },
      },
      orderBy: { orderKey: 'asc' },
      select: { orderKey: true },
    });
    const orderKey = keyBetween(section.orderKey, next?.orderKey ?? null);
    const row = conflictedCopy(section, copy, newId(), orderKey);
    await this.writeRow(tx, userId, 'section', null, row, rev, copy.device);
    return row.id;
  }

  /**
   * Brings back the deleted rows `row` sits under, and theirs in turn, so a kept edit is never
   * orphaned (§6.4). Whether anything was restored.
   */
  private async restoreParents(
    tx: Tx,
    entity: RowEntity,
    row: SyncRow<RowEntity>,
    rev: bigint,
    written: Written[],
  ): Promise<boolean> {
    const values = row as unknown as Record<string, string | null>;
    let restored = false;
    for (const column of PARENT_COLUMNS[entity]) {
      const id = values[column];
      const target = ENTITY_TABLES[entity].refs[column];
      if (!id || !target) continue;
      const model = ENTITY_TABLES[target].model(tx);
      const parent = await model.findUnique({ where: { id } });
      if (!parent || parent.deletedAt === null) continue;
      await model.update({ where: { id }, data: { deletedAt: null, rev } });
      const parentRow = { ...toRow<RowEntity>(target, parent), deletedAt: null };
      if (isCitingEntity(target)) await this.reindex(tx, parent.userId, target, parentRow);
      if (target === 'section') {
        await this.relink(tx, parent.userId, parentRow as SyncRow<'section'>);
      }
      written.push({ entity: target, id });
      await this.restoreParents(tx, target, parentRow, rev, written);
      restored = true;
    }
    return restored;
  }

  /**
   * Why a change would take a shared series or one of its lessons out of its group, which only the
   * group's endpoints do (§17.12): a lesson can't move to another series, and a shared series
   * can't be deleted. Undefined when it doesn't.
   */
  private async checkShared(
    tx: Tx,
    change: RowChange,
    current: StoredRow | null,
  ): Promise<string | undefined> {
    if (!current || current.deletedAt !== null) return undefined;
    if (change.entity === 'series') {
      const deleting = change.op === 'delete' || change.row.deletedAt !== null;
      if (deleting && (await groupOfSeries(tx, current.id))) {
        return 'The series is shared with a group: take it out of the group first';
      }
    } else if (change.entity === 'lesson' && change.op === 'upsert') {
      const from = current.seriesId as string | null;
      if (change.row.seriesId !== from && (await groupOfSeries(tx, from))) {
        return "The lesson's series is shared with a group, so it can't move to another";
      }
    }
    return undefined;
  }

  /**
   * The group columns as they may be stored (§17.12), or why the change is refused. Membership is
   * checked, never trusted, and never refuses a change, so nothing typed is lost: a section or
   * question shared with a group the pusher isn't in, or in a lesson that isn't that group's, is
   * stored private; a comment is kept, and the group never sees it. The columns naming another
   * member's row must name one the group sees when they're set, and the ones set at creation (a
   * lesson's group lesson, a comment's section and group) never change.
   */
  private async groupColumns(
    tx: Tx,
    userId: string,
    change: RowUpsert,
    current: StoredRow | null,
  ): Promise<SyncRow<RowEntity> | string> {
    const row = { ...change.row } as Record<string, unknown>;
    const stored = current as Record<string, unknown> | null;
    const ids = (column: string) => row[column] as string | null;
    switch (change.entity) {
      case 'lesson': {
        if (stored) row.groupLessonId = stored.groupLessonId ?? null;
        else if (
          ids('groupLessonId') &&
          !(await this.joinsGroupLesson(tx, userId, ids('groupLessonId')!))
        ) {
          row.groupLessonId = null;
        }
        break;
      }
      case 'section':
      case 'question': {
        const claimed = row.visibility === 'group' ? ids('groupId') : null;
        const shared =
          claimed !== null && (await this.inThread(tx, userId, claimed, row.lessonId as string));
        if (!shared) Object.assign(row, { visibility: 'private', groupId: null });
        if (change.entity === 'question') break;
        if (!shared) row.sharedAt = null;
        else row.sharedAt ??= change.clientTime;
        if (row.answersQuestionId === null) row.answerKind = null;
        else row.answerKind ??= 'full';
        for (const [column, entity] of [
          ['replyToId', 'section'],
          ['answersQuestionId', 'question'],
        ] as const) {
          const id = ids(column);
          if (id === null || id === ((stored?.[column] as string | null | undefined) ?? null)) {
            continue;
          }
          // Shared with a group the pusher has left: kept, and never shown.
          if (claimed !== null && !shared) continue;
          if (!shared || !(await inFeed(tx, claimed, entity, id))) {
            return `${column} names no ${entity} of the group`;
          }
        }
        break;
      }
      case 'comment': {
        if (stored) {
          row.sectionId = stored.sectionId;
          row.groupId = stored.groupId;
        } else if (
          (await this.isMember(tx, userId, ids('groupId')!)) &&
          !(await inFeed(tx, ids('groupId')!, 'section', ids('sectionId')!))
        ) {
          return 'sectionId names no section of the group';
        }
        break;
      }
      default:
        break;
    }
    return row as unknown as SyncRow<RowEntity>;
  }

  private async isMember(tx: Tx, userId: string, groupId: string): Promise<boolean> {
    const member = await tx.groupMember.findUnique({
      where: { groupId_userId: { groupId, userId } },
      select: { id: true },
    });
    return member !== null;
  }

  /**
   * Whether the user's lesson is in one of the group's threads: the group's lesson, or the user's
   * own lesson for one, and the user a member.
   */
  private async inThread(
    tx: Tx,
    userId: string,
    groupId: string,
    lessonId: string,
  ): Promise<boolean> {
    if (!(await this.isMember(tx, userId, groupId))) return false;
    const lesson = await tx.lesson.findUnique({
      where: { id: lessonId },
      select: { userId: true, seriesId: true, groupLessonId: true },
    });
    if (lesson?.userId !== userId) return false;
    if (lesson.groupLessonId === null)
      return (await groupOfSeries(tx, lesson.seriesId)) === groupId;
    const groupLesson = await tx.lesson.findUnique({
      where: { id: lesson.groupLessonId },
      select: { userId: true, seriesId: true },
    });
    return (
      groupLesson !== null &&
      groupLesson.userId !== userId &&
      (await groupOfSeries(tx, groupLesson.seriesId)) === groupId
    );
  }

  /** Whether the user may make their own lesson for this one: a live lesson of a group of theirs. */
  private async joinsGroupLesson(tx: Tx, userId: string, groupLessonId: string): Promise<boolean> {
    const lesson = await tx.lesson.findUnique({
      where: { id: groupLessonId },
      select: { userId: true, seriesId: true, deletedAt: true },
    });
    if (!lesson || lesson.deletedAt !== null || lesson.userId === userId) return false;
    const groupId = await groupOfSeries(tx, lesson.seriesId);
    return groupId !== null && (await this.isMember(tx, userId, groupId));
  }

  /** Why the row can't name the rows it references, or undefined when it can. */
  private async checkReferences(
    tx: Tx,
    userId: string,
    entity: RowEntity,
    row: SyncRow<RowEntity>,
  ): Promise<string | undefined> {
    const values = row as unknown as Record<string, string | null>;
    for (const [column, target] of Object.entries(ENTITY_TABLES[entity].refs)) {
      const id = values[column];
      if (id === null || id === undefined) continue;
      if (id === row.id) return `${column} names the row itself`;
      const referenced = await ENTITY_TABLES[target].model(tx).findUnique({ where: { id } });
      if (!referenced || referenced.userId !== userId) {
        return `${column} names no ${target} of this account`;
      }
      if (
        entity === 'section' &&
        column === 'parentId' &&
        referenced.lessonId !== values.lessonId
      ) {
        return 'The parent section is in another lesson';
      }
    }
    return undefined;
  }

  /** Rebuilds the row's citations with the same function the device uses (§5.2). */
  private async reindex(
    tx: Tx,
    userId: string,
    entity: CitingEntity,
    row: SyncRow<RowEntity>,
  ): Promise<void> {
    await tx.citation.deleteMany({ where: { userId, sourceId: row.id } });
    const entries = citationsFor(entity, { ...row, rev: 0 } as EntityRow<CitingEntity>);
    if (entries.length > 0) {
      await tx.citation.createMany({ data: entries.map((entry) => ({ ...entry, userId })) });
    }
  }

  /** Rebuilds a section's links with the same function the device uses (§17.4). */
  private async relink(tx: Tx, userId: string, section: SyncRow<'section'>): Promise<void> {
    await tx.link.deleteMany({ where: { userId, fromSectionId: section.id } });
    const entries = linksFor(section);
    if (entries.length > 0) {
      await tx.link.createMany({ data: entries.map((entry) => ({ ...entry, userId })) });
    }
  }

  /** Takes the user's next revision; the user row is already locked. */
  private async nextRev(tx: Tx, userId: string): Promise<bigint> {
    const [row] = await tx.$queryRaw<{ sync_rev: bigint }[]>`
      UPDATE "user" SET sync_rev = sync_rev + 1 WHERE id = ${userId}::uuid RETURNING sync_rev`;
    if (!row) throw new Error(`No user ${userId}`);
    return row.sync_rev;
  }

  /** The result of a change already processed, so a replay returns it unchanged. */
  private async stored(tx: Tx, userId: string, changeId: string): Promise<PushResult | undefined> {
    const found = await tx.syncChange.findUnique({ where: { id: changeId } });
    if (!found) return undefined;
    if (found.userId !== userId) {
      return reject(changeId, SyncErrorCode.CHANGE_ID_TAKEN, 'This change id is already used');
    }
    switch (found.status) {
      case 'applied':
        return { changeId, status: 'applied', rev: Number(found.resultRev) };
      case 'conflict':
        return resultOf(
          changeId,
          found.resultRev ?? 0n,
          found.resolution as ConflictResolution,
          found.copyId ?? undefined,
        );
      case 'rejected': {
        const { errorCode, message } = found.error as { errorCode: string; message: string };
        return reject(changeId, errorCode, message);
      }
      default:
        throw new Error(`Unknown sync change status ${found.status}`);
    }
  }

  private async record(
    tx: Tx,
    userId: string,
    deviceId: string,
    result: PushResult,
  ): Promise<PushResult> {
    const outcome =
      result.status === 'rejected'
        ? { error: { errorCode: result.errorCode, message: result.message } }
        : result.status === 'conflict'
          ? { resultRev: BigInt(result.rev), resolution: result.resolution, copyId: result.copyId }
          : { resultRev: BigInt(result.rev) };
    await tx.syncChange.create({
      data: { id: result.changeId, userId, deviceId, status: result.status, ...outcome },
    });
    return result;
  }
}

/** A row a change wrote, itself or a parent it restored. */
interface Written {
  entity: RowEntity;
  id: string;
}

/** The rows a group's feed may show (§17.12). */
const isGroupVisible = (
  row: Written,
): row is { entity: 'series' | 'lesson' | 'section' | 'question' | 'comment'; id: string } =>
  isFeedEntity(row.entity);

function resultOf(
  changeId: string,
  rev: bigint,
  resolution: ConflictResolution | null,
  copyId?: string,
): PushResult {
  if (!resolution) return { changeId, status: 'applied', rev: Number(rev) };
  return {
    changeId,
    status: 'conflict',
    rev: Number(rev),
    resolution,
    ...(copyId === undefined ? {} : { copyId }),
  };
}

function reject(changeId: string, errorCode: string, message: string): Rejected {
  return { changeId, status: 'rejected', errorCode, message };
}

/** The fields that failed and why, never their values (they hold note text). */
function describeIssues(error: z.ZodError): string {
  return error.issues
    .slice(0, 5)
    .map((issue) => `${issue.path.map(String).join('.') || 'change'}: ${issue.message}`)
    .join('; ');
}
