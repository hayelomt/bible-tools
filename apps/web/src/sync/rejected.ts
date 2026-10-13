import type { EntityName } from '@lamp/domain';
import { type LampDb, type OutboxEntry } from '@/data/db.ts';

/** Where "Open" takes the user for a refused change; null when there's nowhere to show it. */
export type RejectedTarget =
  | {
      kind: 'lesson';
      lessonId: string;
      search: { section?: string; takeaway?: string; question?: string };
    }
  | { kind: 'series'; seriesId: string }
  | { kind: 'tag'; tagId: string }
  | { kind: 'settings' }
  | null;

/** A change the server refused (§6.2), as the sync panel lists it. */
export interface RejectedChange {
  seq: number;
  /** What it was a change to: `Section in "The Good Shepherd"`. */
  what: string;
  /** Why, in words: "The server refused it: another tag already has this name." */
  reason: string;
  /** The server's code and message, for a bug report. */
  details: string;
  target: RejectedTarget;
}

/** Each refusal code in words, finishing "The server refused it: …". */
const REASONS: Record<string, string> = {
  INVALID_CHANGE: "something in it isn't valid",
  REFERENCE_NOT_FOUND: "it belongs to something this account doesn't have",
  DUPLICATE: 'another one already has the same name',
  ID_TAKEN: 'its id belongs to another account',
  CHANGE_ID_TAKEN: 'its change id belongs to another account',
  NOT_FOUND: "the server doesn't have it",
  CONSTRAINT_VIOLATION: "the server doesn't allow it",
};

const NOUNS: Record<EntityName, string> = {
  userSettings: 'Settings',
  series: 'Series',
  lesson: 'Lesson',
  section: 'Section',
  tag: 'Tag',
  sectionTag: 'Tag on a section',
  lessonTag: 'Tag',
  takeaway: 'Takeaway',
  question: 'Question',
  highlight: 'Highlight',
  memoryItem: 'Memory verse',
};

/** The outbox's refused changes, oldest first, described for the sync panel. */
export async function rejectedChanges(db: LampDb): Promise<RejectedChange[]> {
  const entries = await db.outbox.filter((entry) => !!entry.rejected).toArray();
  return Promise.all(entries.map((entry) => describe(db, entry)));
}

async function describe(db: LampDb, entry: OutboxEntry): Promise<RejectedChange> {
  const { errorCode, message } = entry.rejected!;
  const words = REASONS[errorCode];
  const base = {
    seq: entry.seq!,
    reason: words ? `The server refused it: ${words}.` : 'The server refused it.',
    details: `${errorCode}: ${message}`,
  };
  const noun = NOUNS[entry.entity];
  if (entry.entity === 'userSettings') {
    return { ...base, what: noun, target: { kind: 'settings' } };
  }

  const stored = await db.rows(entry.entity).get(entry.entityId);
  const row = (stored ?? (entry.op === 'upsert' ? entry.row : undefined)) as
    Record<string, unknown> | undefined;
  const id = entry.entityId;
  const field = (name: string) => (typeof row?.[name] === 'string' ? (row[name] as string) : null);

  switch (entry.entity) {
    case 'series': {
      const title = field('title');
      return { ...base, what: named(noun, title), target: { kind: 'series', seriesId: id } };
    }
    case 'lesson': {
      const title = field('title');
      return { ...base, what: named(noun, title), target: lessonTarget(id) };
    }
    case 'tag': {
      const name = field('name');
      return {
        ...base,
        what: named(noun, name),
        target: stored ? { kind: 'tag', tagId: id } : null,
      };
    }
    case 'section':
    case 'takeaway':
    case 'question':
    case 'lessonTag':
    case 'sectionTag': {
      let lessonId = field('lessonId');
      if (entry.entity === 'sectionTag') {
        const sectionId = field('sectionId');
        lessonId = sectionId ? ((await db.section.get(sectionId))?.lessonId ?? null) : null;
      }
      const lesson = lessonId ? await db.lesson.get(lessonId) : undefined;
      const what = lesson ? `${noun} in "${lesson.title}"` : noun;
      if (!lesson) return { ...base, what, target: null };
      const search =
        entry.entity === 'section' || entry.entity === 'takeaway' || entry.entity === 'question'
          ? { [entry.entity]: id }
          : {};
      return { ...base, what, target: lessonTarget(lesson.id, search) };
    }
    case 'highlight':
    case 'memoryItem':
      // Their screens come in M5 and M6.
      return { ...base, what: `A ${noun.toLowerCase()}`, target: null };
  }
}

const named = (noun: string, name: string | null) => (name ? `${noun} "${name}"` : noun);

function lessonTarget(
  lessonId: string,
  search: { section?: string; takeaway?: string; question?: string } = {},
): RejectedTarget {
  return { kind: 'lesson', lessonId, search };
}
