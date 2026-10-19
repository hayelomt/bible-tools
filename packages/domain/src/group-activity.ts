/**
 * A group's activity for one member (F35, M13-11, M13-12; wireframes/sharing.md "Notifications"):
 * replies to their sections, comments on their sections, and questions others asked. The group
 * page lists it, and the weekly email (decided 2026-10-19) lists the same for its week.
 */

export const ACTIVITY_KINDS = ['reply', 'comment', 'question'] as const;
export type ActivityKind = (typeof ACTIVITY_KINDS)[number];

/** A group section, anyone's, as the activity needs it. */
export interface ActivitySection {
  id: string;
  userId: string;
  groupLessonId: string;
  replyToId: string | null;
  sharedAt: string | null;
  createdAt: string;
  /** The feed's revision when it reached the group; 0 for the member's own, never new to them. */
  addedRev: number;
}

export interface ActivityQuestion {
  id: string;
  userId: string;
  groupLessonId: string;
  text: string;
  createdAt: string;
  addedRev: number;
}

export interface ActivityComment {
  id: string;
  userId: string;
  sectionId: string;
  createdAt: string;
  addedRev: number;
}

export interface ActivityItem {
  kind: ActivityKind;
  /** The reply's, comment's or question's id. */
  id: string;
  /** Who replied, commented or asked: never the member. */
  userId: string;
  /** The group lesson whose thread it's in. */
  groupLessonId: string;
  /** The question's text; null for a reply or a comment. */
  text: string | null;
  /** When it was shared, posted or asked. */
  at: string;
  addedRev: number;
}

/**
 * What happened for `me` among the group's rows, latest first. `sections` must hold the member's
 * own group sections, since replies and comments are found through them.
 */
export function groupActivity(
  me: string,
  rows: {
    sections: readonly ActivitySection[];
    questions: readonly ActivityQuestion[];
    comments: readonly ActivityComment[];
  },
): ActivityItem[] {
  const mine = new Map(rows.sections.filter((s) => s.userId === me).map((s) => [s.id, s]));
  const items: ActivityItem[] = [];
  for (const s of rows.sections) {
    if (s.userId === me || !s.replyToId || !mine.has(s.replyToId)) continue;
    items.push({
      kind: 'reply',
      id: s.id,
      userId: s.userId,
      groupLessonId: s.groupLessonId,
      text: null,
      at: s.sharedAt ?? s.createdAt,
      addedRev: s.addedRev,
    });
  }
  for (const c of rows.comments) {
    const on = mine.get(c.sectionId);
    if (c.userId === me || !on) continue;
    items.push({
      kind: 'comment',
      id: c.id,
      userId: c.userId,
      groupLessonId: on.groupLessonId,
      text: null,
      at: c.createdAt,
      addedRev: c.addedRev,
    });
  }
  for (const q of rows.questions) {
    if (q.userId === me) continue;
    items.push({
      kind: 'question',
      id: q.id,
      userId: q.userId,
      groupLessonId: q.groupLessonId,
      text: q.text,
      at: q.createdAt,
      addedRev: q.addedRev,
    });
  }
  return items.toSorted(
    (a, b) => b.addedRev - a.addedRev || b.at.localeCompare(a.at) || a.id.localeCompare(b.id),
  );
}

/** "Ben replied to your section", as the group page and the email say it, without the lesson. */
export function activityLine(item: Pick<ActivityItem, 'kind' | 'text'>, who: string): string {
  switch (item.kind) {
    case 'reply':
      return `${who} replied to your section`;
    case 'comment':
      return `${who} commented on your section`;
    case 'question':
      return `${who} asked “${item.text ?? ''}”`;
  }
}
