import type { GroupPullResponse } from '@lamp/domain';
import { IDBKeyRange, indexedDB } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LampDb } from '@/data/db.ts';
import { ApiRequestError } from '@/lib/api.ts';
import { clearGroups, syncGroups } from './groups.ts';

const GROUP = '0199e0a0-0000-7000-8000-00000000a001';
const OTHER = '0199e0a0-0000-7000-8000-00000000a002';
const SERIES = '0199e0a0-0000-7000-8000-00000000b001';
const LESSON = '0199e0a0-0000-7000-8000-00000000c001';
const USER = '0199e0a0-0000-7000-8000-00000000d001';
const MEMBER = '0199e0a0-0000-7000-8000-00000000e001';
const NOW = '2026-10-19T09:00:00.000Z';

const group = (id = GROUP, name = 'Thursday group') => ({
  entity: 'group' as const,
  row: { id, name, createdAt: NOW },
});
const member = {
  entity: 'member' as const,
  row: { id: MEMBER, userId: USER, displayName: 'Ann', role: 'owner' as const, joinedAt: NOW },
};
const series = {
  entity: 'series' as const,
  row: { id: SERIES, userId: USER, title: 'John', description: '', kind: 'book_study' as const },
};
const lesson = {
  entity: 'lesson' as const,
  row: {
    id: LESSON,
    userId: USER,
    seriesId: SERIES,
    title: 'The Good Shepherd',
    date: '2026-10-12',
    kind: 'sermon' as const,
    speaker: null,
    church: null,
    mainPassages: [],
    sourceType: null,
    sourceTitle: null,
    sourceAuthor: null,
    sourceUrl: null,
    sourceStartedAt: null,
    createdAt: NOW,
    updatedAt: NOW,
  },
};

const page = (
  rows: GroupPullResponse['rows'],
  nextCursor: number,
  hasMore = false,
): GroupPullResponse => ({ rows, nextCursor, hasMore, remaining: rows.length });

/** A group's first page: the group and a member of its own. */
const firstPage = async (id: string) =>
  page([group(id), { ...member, row: { ...member.row, id: `${id.slice(0, -1)}9` } }], 1);

let db: LampDb;
let count = 0;

beforeEach(async () => {
  db = new LampDb(`groups-${++count}`, { indexedDB, IDBKeyRange });
  await db.open();
});

afterEach(async () => {
  db.close();
  await db.delete();
});

describe('syncGroups', () => {
  it('pulls a group that moved, page by page, and stores its rows with the group', async () => {
    const asked: number[] = [];
    const pages = [page([group(), member, series], 1, true), page([lesson], 2)];
    await syncGroups(db, [{ id: GROUP, rev: 2 }], async (id, cursor) => {
      expect(id).toBe(GROUP);
      asked.push(cursor);
      return pages.shift()!;
    });
    expect(asked).toEqual([0, 1]);
    expect(await db.group.get(GROUP)).toEqual(group().row);
    expect(await db.groupMember.get(MEMBER)).toEqual({ ...member.row, groupId: GROUP });
    expect(await db.groupLesson.where({ seriesId: SERIES }).count()).toBe(1);
    expect(await db.groupSync.get(GROUP)).toEqual({ groupId: GROUP, cursor: 2 });

    // Nothing moved: nothing asked.
    await syncGroups(db, [{ id: GROUP, rev: 2 }], () => {
      throw new Error('not asked');
    });

    // A lesson gone and the group renamed.
    await syncGroups(db, [{ id: GROUP, rev: 3 }], async (_, cursor) => {
      expect(cursor).toBe(2);
      return page([group(GROUP, 'Friday group'), { entity: 'lesson', id: LESSON, gone: true }], 3);
    });
    expect((await db.group.get(GROUP))?.name).toBe('Friday group');
    expect(await db.groupLesson.count()).toBe(0);
  });

  it('drops a group the user is no longer in, or whose pull answers 404, and only that', async () => {
    await syncGroups(
      db,
      [
        { id: GROUP, rev: 1 },
        { id: OTHER, rev: 1 },
      ],
      firstPage,
    );
    expect(await db.group.count()).toBe(2);

    await syncGroups(db, [{ id: OTHER, rev: 1 }], firstPage);
    expect(await db.group.toCollection().primaryKeys()).toEqual([OTHER]);
    expect(await db.groupMember.where({ groupId: GROUP }).count()).toBe(0);
    expect(await db.groupSync.get(GROUP)).toBeUndefined();

    await syncGroups(db, [{ id: OTHER, rev: 2 }], async () => {
      throw new ApiRequestError(404, 'NOT_FOUND', 'No such group');
    });
    expect(await db.group.count()).toBe(0);
    expect(await db.groupMember.count()).toBe(0);
  });

  it('passes on other failures, keeping what it had', async () => {
    await syncGroups(db, [{ id: GROUP, rev: 1 }], async () => page([group()], 1));
    await expect(
      syncGroups(db, [{ id: GROUP, rev: 2 }], async () => {
        throw new ApiRequestError(500, 'INTERNAL_ERROR', 'Oops');
      }),
    ).rejects.toThrow('Oops');
    expect(await db.groupSync.get(GROUP)).toEqual({ groupId: GROUP, cursor: 1 });
  });

  it('clearGroups empties every group store', async () => {
    await syncGroups(db, [{ id: GROUP, rev: 1 }], async () =>
      page([group(), member, series, lesson], 1),
    );
    await clearGroups(db);
    for (const table of [db.group, db.groupMember, db.groupSeries, db.groupLesson, db.groupSync]) {
      expect(await table.count()).toBe(0);
    }
  });
});
