import { type ActivityItem, groupActivity, groupVisitId } from '@lamp/domain';
import { db as appDb, type LampDb } from './db.ts';

/**
 * A group's activity on the device (F35, M13-11, wireframes/sharing.md "Notifications"): replies
 * and comments to the user's sections, and others' questions, from the group stores; the user's
 * own sections from their own tables, as the thread reads them.
 */

/** An activity row as the group page shows it. */
export interface ActivityEntry extends ActivityItem {
  /** The member's name in the group. */
  who: string;
  lessonTitle: string;
  /** Who the group lesson belongs to: its owner opens it as their own lesson. */
  lessonOwnerId: string | null;
  /** Added since the user last opened the group. */
  isNew: boolean;
}

export interface GroupActivity {
  items: ActivityEntry[];
  /** How many are new. */
  fresh: number;
}

const live = (row: { deletedAt: string | null }) => row.deletedAt === null;

/**
 * The revision the user has seen the group up to: their visit's, or before one, the rev they
 * joined at, so a group joined late doesn't open with everything new.
 */
async function seenRev(db: LampDb, groupId: string, me: string): Promise<number> {
  const visit = await db.groupVisit.get(await groupVisitId(me, groupId));
  if (visit && live(visit)) return visit.seenRev;
  const member = await db.groupMember
    .where({ groupId })
    .filter((m) => m.userId === me)
    .first();
  return member?.addedRev ?? 0;
}

/** Everything in the group's activity for the user, latest first. */
export async function groupActivityOf(
  groupId: string,
  me: string,
  db: LampDb = appDb,
): Promise<GroupActivity> {
  const [others, mine, questions, comments, members, seen] = await Promise.all([
    db.groupSection.where({ groupId }).toArray(),
    db.section
      .where('groupId')
      .equals(groupId)
      .filter((s) => live(s) && s.visibility === 'group')
      .toArray(),
    db.groupQuestion.where({ groupId }).toArray(),
    db.groupComment.where({ groupId }).toArray(),
    db.groupMember.where({ groupId }).toArray(),
    seenRev(db, groupId, me),
  ]);
  const lessons = new Map(
    (await db.lesson.bulkGet([...new Set(mine.map((s) => s.lessonId))]))
      .filter((l) => l !== undefined && live(l))
      .map((l) => [l!.id, l!]),
  );
  const items = groupActivity(me, {
    sections: [
      ...others.filter((s) => s.userId !== me),
      ...mine.flatMap((s) => {
        const lesson = lessons.get(s.lessonId);
        if (!lesson) return [];
        return [
          { ...s, userId: me, groupLessonId: lesson.groupLessonId ?? lesson.id, addedRev: 0 },
        ];
      }),
    ],
    questions,
    comments,
  });
  const names = new Map(members.map((m) => [m.userId, m.displayName]));
  const groupLessons = new Map(
    (await db.groupLesson.bulkGet([...new Set(items.map((i) => i.groupLessonId))]))
      .filter((l) => l !== undefined)
      .map((l) => [l!.id, l!]),
  );
  const entries = items.flatMap((item) => {
    const lesson = groupLessons.get(item.groupLessonId);
    if (!lesson) return [];
    return [
      {
        ...item,
        who: names.get(item.userId) ?? 'A former member',
        lessonTitle: lesson.title,
        lessonOwnerId: lesson.userId,
        isNew: item.addedRev > seen,
      },
    ];
  });
  return { items: entries, fresh: entries.filter((e) => e.isNew).length };
}

/** How many activity rows are new in each of the user's groups, for the group rows' "2 new". */
export async function freshByGroup(me: string, db: LampDb = appDb): Promise<Map<string, number>> {
  const groups = await db.group.toCollection().primaryKeys();
  const counts = await Promise.all(
    groups.map(async (id) => [id, (await groupActivityOf(id, me, db)).fresh] as const),
  );
  return new Map(counts);
}
