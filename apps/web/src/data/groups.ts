import type { GroupInfo, GroupLesson, GroupMember, GroupSeries, Series } from '@lamp/domain';
import { db, type InGroup } from './db.ts';

/** A group as the Lessons home and the sidebar list it. */
export interface GroupSummary extends GroupInfo {
  members: number;
}

/** The groups this device has pulled, by name (§17.12). */
export async function allGroups(): Promise<GroupSummary[]> {
  const [groups, members] = await Promise.all([db.group.toArray(), db.groupMember.toArray()]);
  return groups
    .map((group) => ({
      ...group,
      members: members.filter((m) => m.groupId === group.id).length,
    }))
    .toSorted((a, b) => a.name.localeCompare(b.name));
}

export interface GroupView {
  group: GroupInfo;
  /** Owner first, then by when they joined. */
  members: InGroup<GroupMember>[];
  series: (InGroup<GroupSeries> & { lessons: number })[];
}

/** A group's page: null once the device doesn't have it (never pulled, left or removed). */
export async function groupView(groupId: string): Promise<GroupView | null> {
  const group = await db.group.get(groupId);
  if (!group) return null;
  const [members, series, lessons] = await Promise.all([
    db.groupMember.where({ groupId }).toArray(),
    db.groupSeries.where({ groupId }).toArray(),
    db.groupLesson.where({ groupId }).toArray(),
  ]);
  return {
    group,
    members: members.toSorted(
      (a, b) =>
        Number(b.role === 'owner') - Number(a.role === 'owner') ||
        a.joinedAt.localeCompare(b.joinedAt),
    ),
    series: series
      .map((s) => ({ ...s, lessons: lessons.filter((l) => l.seriesId === s.id).length }))
      .toSorted((a, b) => a.title.localeCompare(b.title)),
  };
}

/** A shared series and its lessons, oldest first, as the series screen orders them. */
export async function groupSeriesView(
  seriesId: string,
): Promise<{ series: InGroup<GroupSeries>; lessons: InGroup<GroupLesson>[] } | null> {
  const series = await db.groupSeries.get(seriesId);
  if (!series) return null;
  const lessons = await db.groupLesson.where({ seriesId }).toArray();
  return {
    series,
    lessons: lessons.toSorted(
      (a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title),
    ),
  };
}

/** The group a series of the user's is shared with, if any: its `⋯` opens it then. */
export async function groupOfSeries(seriesId: string): Promise<string | null> {
  return (await db.groupSeries.get(seriesId))?.groupId ?? null;
}

/** The user's live series that no group has yet: what a new group can study. */
export async function seriesForGroup(): Promise<Series[]> {
  const [series, shared] = await Promise.all([
    db.series.filter((s) => s.deletedAt === null).toArray(),
    db.groupSeries.toCollection().primaryKeys(),
  ]);
  const taken = new Set(shared);
  return series.filter((s) => !taken.has(s.id)).toSorted((a, b) => a.title.localeCompare(b.title));
}
