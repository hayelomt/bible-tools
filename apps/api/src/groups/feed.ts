import type { GroupEntity } from '@lamp/domain';
import { Prisma } from '../generated/prisma/client.js';

type Tx = Prisma.TransactionClient;

/** One thing a group's members see, as it now stands for them. */
export interface FeedEntry {
  entity: GroupEntity;
  entityId: string;
  gone: boolean;
}

/** A row a group's feed may hold. */
export interface FeedRef {
  entity: GroupEntity;
  id: string;
}

export const feedKey = (entity: GroupEntity, id: string): string => `${entity}:${id}`;

const unique = (ids: Iterable<string | null>): string[] =>
  [...new Set(ids)].filter((id): id is string => id !== null);

/**
 * Takes the group's next feed revision (§17.12), locking the group's row until the transaction
 * ends, so one group's revisions commit in order, as a user's do (§6.3). Callers lock any user rows
 * first. Null when the group doesn't exist.
 */
export async function nextGroupRev(tx: Tx, groupId: string): Promise<bigint | null> {
  const [row] = await tx.$queryRaw<{ sync_rev: bigint }[]>`
    UPDATE "group" SET sync_rev = sync_rev + 1, updated_at = now()
    WHERE id = ${groupId}::uuid RETURNING sync_rev`;
  return row?.sync_rev ?? null;
}

/**
 * Locks the group's row until the transaction ends without taking a revision, for a push that may
 * change nothing members see (§17.12). False when the group doesn't exist.
 */
export async function lockGroup(tx: Tx, groupId: string): Promise<boolean> {
  const rows = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM "group" WHERE id = ${groupId}::uuid FOR UPDATE`;
  return rows.length > 0;
}

/**
 * Writes the entries at `rev`, each replacing what the group had for that row. A row new to the
 * group is added at `rev`, and keeps that (`added_rev`, `added_at`) through later changes.
 */
export async function writeFeed(
  tx: Tx,
  groupId: string,
  rev: bigint,
  entries: readonly FeedEntry[],
): Promise<void> {
  if (entries.length === 0) return;
  await tx.$executeRaw`
    INSERT INTO group_feed (group_id, entity, entity_id, rev, gone, added_rev)
    SELECT ${groupId}::uuid, t.entity, t.entity_id, ${rev}, t.gone, ${rev}
    FROM unnest(
      ${entries.map((e) => e.entity)}::text[],
      ${entries.map((e) => e.entityId)}::uuid[],
      ${entries.map((e) => e.gone)}::boolean[]
    ) AS t(entity, entity_id, gone)
    ON CONFLICT (group_id, entity, entity_id)
    DO UPDATE SET rev = EXCLUDED.rev, gone = EXCLUDED.gone`;
}

/** The group a series is shared into, if any. */
export async function groupOfSeries(tx: Tx, seriesId: string | null): Promise<string | null> {
  if (!seriesId) return null;
  const shared = await tx.groupSeries.findUnique({
    where: { seriesId },
    select: { groupId: true },
  });
  return shared?.groupId ?? null;
}

/** Whether the group's feed shows this row now, live. */
export async function inFeed(
  tx: Tx,
  groupId: string,
  entity: GroupEntity,
  id: string,
): Promise<boolean> {
  const entry = await tx.groupFeed.findUnique({
    where: { groupId_entity_entityId: { groupId, entity, entityId: id } },
    select: { gone: true },
  });
  return entry !== null && !entry.gone;
}

/** What the group may see of the rows asked about (§17.12), from committed rows. */
export interface Visibility {
  /** `feedKey`s of the rows it may see. */
  visible: Set<string>;
  /** For each visible section and question, the group lesson whose thread it's in. */
  threads: Map<string, string>;
}

const LESSON_FACTS = {
  id: true,
  userId: true,
  seriesId: true,
  groupLessonId: true,
  deletedAt: true,
} as const;
const SECTION_FACTS = {
  id: true,
  userId: true,
  lessonId: true,
  parentId: true,
  visibility: true,
  groupId: true,
  deletedAt: true,
} as const;

/** What the rule needs of a row someone may have shared. */
interface Shared {
  userId: string;
  visibility: string;
  groupId: string | null;
  deletedAt: Date | null;
}

/**
 * The group's rules (§17.12), worked out for these rows from what's committed:
 * - the group, its members and its live shared series;
 * - a lesson that's live, in one of those series;
 * - a section or question that's live, shared with this group, by a member, in a lesson of the
 *   group or in the author's own lesson for one, and (a reply) under a section the group sees;
 * - a live comment by a member, on a section the group sees.
 * Everything else, private rows above all, it can't see. The pull and the feed's upkeep both ask
 * here, so they can't disagree.
 */
export async function visibility(
  tx: Tx,
  groupId: string,
  refs: readonly FeedRef[],
): Promise<Visibility> {
  const ids = (entity: GroupEntity) =>
    unique(refs.filter((r) => r.entity === entity).map((r) => r.id));
  const visible = new Set<string>();
  const threads = new Map<string, string>();
  const group = await tx.group.findUnique({ where: { id: groupId }, select: { id: true } });
  if (!group) return { visible, threads };

  const members = await tx.groupMember.findMany({
    where: { groupId },
    select: { id: true, userId: true },
  });
  const shared = await tx.groupSeries.findMany({
    where: { groupId, series: { deletedAt: null } },
    select: { seriesId: true },
  });
  const memberIds = new Set(members.map((m) => m.id));
  const users = new Set(members.map((m) => m.userId));
  const series = new Set(shared.map((s) => s.seriesId));
  if (ids('group').includes(groupId)) visible.add(feedKey('group', groupId));
  for (const id of ids('member')) if (memberIds.has(id)) visible.add(feedKey('member', id));
  for (const id of ids('series')) if (series.has(id)) visible.add(feedKey('series', id));

  const commentIds = ids('comment');
  const comments =
    commentIds.length === 0
      ? []
      : await tx.comment.findMany({
          where: { id: { in: commentIds } },
          select: { id: true, userId: true, sectionId: true, groupId: true, deletedAt: true },
        });
  // The sections asked about and commented on, then the sections they reply under.
  const sections = new Map<string, Prisma.SectionGetPayload<{ select: typeof SECTION_FACTS }>>();
  let wanted = unique([...ids('section'), ...comments.map((c) => c.sectionId)]);
  for (let depth = 0; wanted.length > 0 && depth < 3; depth++) {
    const found = await tx.section.findMany({
      where: { id: { in: wanted } },
      select: SECTION_FACTS,
    });
    for (const section of found) sections.set(section.id, section);
    wanted = unique(found.map((s) => s.parentId)).filter((id) => !sections.has(id));
  }
  const questionIds = ids('question');
  const questions =
    questionIds.length === 0
      ? []
      : await tx.question.findMany({
          where: { id: { in: questionIds } },
          select: {
            id: true,
            userId: true,
            lessonId: true,
            visibility: true,
            groupId: true,
            deletedAt: true,
          },
        });
  // Their lessons, then the group lessons any of those are a member's own lesson for.
  const lessons = new Map<string, Prisma.LessonGetPayload<{ select: typeof LESSON_FACTS }>>();
  let lessonIds = unique([
    ...ids('lesson'),
    ...[...sections.values()].map((s) => s.lessonId),
    ...questions.map((q) => q.lessonId),
  ]);
  for (let depth = 0; lessonIds.length > 0 && depth < 2; depth++) {
    const found = await tx.lesson.findMany({
      where: { id: { in: lessonIds } },
      select: LESSON_FACTS,
    });
    for (const lesson of found) lessons.set(lesson.id, lesson);
    lessonIds = unique(found.map((l) => l.groupLessonId)).filter((id) => !lessons.has(id));
  }

  const inGroup = (id: string | null) => {
    const lesson = id ? lessons.get(id) : undefined;
    return lesson?.deletedAt === null && lesson.seriesId !== null && series.has(lesson.seriesId);
  };
  for (const id of ids('lesson')) if (inGroup(id)) visible.add(feedKey('lesson', id));

  /** The group lesson whose thread an author's row in this lesson is in, if the group has it. */
  const threadOf = (lessonId: string, authorId: string): string | null => {
    const lesson = lessons.get(lessonId);
    if (!lesson || lesson.deletedAt !== null || lesson.userId !== authorId) return null;
    if (lesson.groupLessonId === null) return inGroup(lesson.id) ? lesson.id : null;
    const groupLesson = lessons.get(lesson.groupLessonId);
    return groupLesson && groupLesson.userId !== authorId && inGroup(groupLesson.id)
      ? groupLesson.id
      : null;
  };
  const isShared = (row: Shared) =>
    row.deletedAt === null &&
    row.visibility === 'group' &&
    row.groupId === groupId &&
    users.has(row.userId);
  const sectionThread = (id: string, depth = 0): string | null => {
    const section = sections.get(id);
    if (!section || depth > 2 || !isShared(section)) return null;
    const thread = threadOf(section.lessonId, section.userId);
    if (thread === null || section.parentId === null) return thread;
    return sectionThread(section.parentId, depth + 1) === thread ? thread : null;
  };

  for (const id of ids('section')) {
    const thread = sectionThread(id);
    if (thread === null) continue;
    visible.add(feedKey('section', id));
    threads.set(feedKey('section', id), thread);
  }
  for (const question of questions) {
    const thread = isShared(question) ? threadOf(question.lessonId, question.userId) : null;
    if (thread === null) continue;
    visible.add(feedKey('question', question.id));
    threads.set(feedKey('question', question.id), thread);
  }
  for (const comment of comments) {
    const shows =
      comment.deletedAt === null &&
      comment.groupId === groupId &&
      users.has(comment.userId) &&
      sectionThread(comment.sectionId) !== null;
    if (shows) visible.add(feedKey('comment', comment.id));
  }
  return { visible, threads };
}

/** The feed's live entries among these rows. */
async function liveInFeed(tx: Tx, groupId: string, refs: readonly FeedRef[]): Promise<Set<string>> {
  if (refs.length === 0) return new Set();
  const entries = await tx.groupFeed.findMany({
    where: { groupId, gone: false, entityId: { in: unique(refs.map((r) => r.id)) } },
    select: { entity: true, entityId: true },
  });
  return new Set(entries.map((e) => feedKey(e.entity as GroupEntity, e.entityId)));
}

/**
 * Brings the group's feed up to date at `rev`, the group already locked (§17.12), or with no `rev`
 * at the next one, taken only if anything changes, so a push members can't see (a former member's)
 * doesn't move the group on: each of
 * `changed` goes out as it now is, or as gone once the group can't see it; each of `others` only
 * when whether the group can see it changed (a lesson's sections when it's deleted, everything of a
 * member who leaves). A row the group never saw never enters its feed, not even as gone.
 */
export async function settle(
  tx: Tx,
  groupId: string,
  rev: bigint | null,
  changed: readonly FeedRef[],
  others: readonly FeedRef[] = [],
): Promise<void> {
  const all = new Map<string, FeedRef>();
  for (const ref of [...changed, ...others]) all.set(feedKey(ref.entity, ref.id), ref);
  const refs = [...all.values()];
  const { visible } = await visibility(tx, groupId, refs);
  const live = await liveInFeed(tx, groupId, refs);
  const fresh = new Set(changed.map((ref) => feedKey(ref.entity, ref.id)));
  const entries: FeedEntry[] = [];
  for (const [key, { entity, id }] of all) {
    if (visible.has(key) && (fresh.has(key) || !live.has(key))) {
      entries.push({ entity, entityId: id, gone: false });
    } else if (!visible.has(key) && live.has(key)) {
      entries.push({ entity, entityId: id, gone: true });
    }
  }
  if (entries.length === 0) return;
  const at = rev ?? (await nextGroupRev(tx, groupId));
  if (at !== null) await writeFeed(tx, groupId, at, entries);
}

/**
 * Every row the group could see or has seen: its series and their lessons, every section, question
 * and comment shared with it, and what its feed shows now. For a change to who is in the group or
 * what it studies, which can take in or out any of them.
 */
async function groupRefs(tx: Tx, groupId: string): Promise<FeedRef[]> {
  const shared = await tx.groupSeries.findMany({ where: { groupId }, select: { seriesId: true } });
  const seriesIds = shared.map((s) => s.seriesId);
  const lessons = await tx.lesson.findMany({
    where: { seriesId: { in: seriesIds } },
    select: { id: true },
  });
  const where = { groupId };
  const [sections, questions, comments, feed] = [
    await tx.section.findMany({ where, select: { id: true } }),
    await tx.question.findMany({ where, select: { id: true } }),
    await tx.comment.findMany({ where, select: { id: true } }),
    await tx.groupFeed.findMany({
      where: { groupId, gone: false },
      select: { entity: true, entityId: true },
    }),
  ];
  return [
    { entity: 'group', id: groupId },
    ...seriesIds.map((id): FeedRef => ({ entity: 'series', id })),
    ...lessons.map((l): FeedRef => ({ entity: 'lesson', id: l.id })),
    ...sections.map((s): FeedRef => ({ entity: 'section', id: s.id })),
    ...questions.map((q): FeedRef => ({ entity: 'question', id: q.id })),
    ...comments.map((c): FeedRef => ({ entity: 'comment', id: c.id })),
    ...feed.map((e): FeedRef => ({ entity: e.entity as GroupEntity, id: e.entityId })),
  ];
}

/**
 * After a change to who is in the group or what it studies (§17.12): `changed` as it now is, and
 * everything else the change took in or out, at one rev.
 */
export async function settleGroup(
  tx: Tx,
  groupId: string,
  rev: bigint,
  changed: readonly FeedRef[] = [],
): Promise<void> {
  await settle(tx, groupId, rev, changed, await groupRefs(tx, groupId));
}

/** The pushed rows a group's feed may hold. */
export type FeedEntity = Exclude<GroupEntity, 'group' | 'member'>;
const FEED_ENTITIES: ReadonlySet<string> = new Set([
  'series',
  'lesson',
  'section',
  'question',
  'comment',
]);
export const isFeedEntity = (entity: string): entity is FeedEntity => FEED_ENTITIES.has(entity);

/** The groups a pushed row is in, or was in: its own, and any whose feed shows it now. */
async function groupsOf(tx: Tx, entity: FeedEntity, id: string): Promise<string[]> {
  let own: string | null = null;
  if (entity === 'series') own = await groupOfSeries(tx, id);
  else if (entity === 'lesson') {
    const lesson = await tx.lesson.findUnique({
      where: { id },
      select: { seriesId: true, groupLessonId: true },
    });
    const groupLesson = lesson?.groupLessonId
      ? await tx.lesson.findUnique({
          where: { id: lesson.groupLessonId },
          select: { seriesId: true },
        })
      : null;
    own = await groupOfSeries(tx, groupLesson?.seriesId ?? lesson?.seriesId ?? null);
  } else {
    const model = { section: tx.section, question: tx.question, comment: tx.comment }[entity] as {
      findUnique(args: object): Promise<{ groupId: string | null } | null>;
    };
    own = (await model.findUnique({ where: { id }, select: { groupId: true } }))?.groupId ?? null;
  }
  const feed = await tx.groupFeed.findMany({
    where: { entity, entityId: id, gone: false },
    select: { groupId: true },
  });
  return unique([own, ...feed.map((e) => e.groupId)]);
}

/**
 * The rows whose place in a group follows a pushed row's: a lesson's (and members' own lessons'
 * for it) sections, questions and comments; a section's replies and comments.
 */
async function dependents(tx: Tx, entity: FeedEntity, id: string): Promise<FeedRef[]> {
  let sectionIds: string[] = [];
  let questionIds: string[] = [];
  if (entity === 'lesson') {
    const own = await tx.lesson.findMany({ where: { groupLessonId: id }, select: { id: true } });
    const where = { lessonId: { in: [id, ...own.map((l) => l.id)] }, groupId: { not: null } };
    sectionIds = (await tx.section.findMany({ where, select: { id: true } })).map((s) => s.id);
    questionIds = (await tx.question.findMany({ where, select: { id: true } })).map((q) => q.id);
  } else if (entity === 'section') {
    const replies = await tx.section.findMany({ where: { parentId: id }, select: { id: true } });
    sectionIds = replies.map((s) => s.id);
  } else {
    return [];
  }
  const commented = entity === 'section' ? [id, ...sectionIds] : sectionIds;
  const comments =
    commented.length === 0
      ? []
      : await tx.comment.findMany({
          where: { sectionId: { in: commented } },
          select: { id: true },
        });
  return [
    ...sectionIds.map((s): FeedRef => ({ entity: 'section', id: s })),
    ...questionIds.map((q): FeedRef => ({ entity: 'question', id: q })),
    ...comments.map((c): FeedRef => ({ entity: 'comment', id: c.id })),
  ];
}

/**
 * After a push wrote these rows (§17.12): each group that has or had one shows it as it now is,
 * or drops it, with the rows that follow it. The pushing user's row is already locked; the groups
 * are locked in id order.
 */
export async function refreshFeed(
  tx: Tx,
  written: readonly { entity: FeedEntity; id: string }[],
): Promise<void> {
  const byGroup = new Map<string, { changed: FeedRef[]; others: FeedRef[] }>();
  for (const { entity, id } of written) {
    const groups = await groupsOf(tx, entity, id);
    if (groups.length === 0) continue;
    const others = await dependents(tx, entity, id);
    for (const groupId of groups) {
      const refs = byGroup.get(groupId) ?? { changed: [], others: [] };
      refs.changed.push({ entity, id });
      refs.others.push(...others);
      byGroup.set(groupId, refs);
    }
  }
  for (const [groupId, refs] of [...byGroup].toSorted(([a], [b]) => a.localeCompare(b))) {
    if (await lockGroup(tx, groupId)) await settle(tx, groupId, null, refs.changed, refs.others);
  }
}
