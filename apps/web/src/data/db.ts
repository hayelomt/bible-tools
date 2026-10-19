import type {
  Change,
  Citation,
  Comment,
  EntityName,
  EntityRow,
  GroupComment,
  GroupInfo,
  GroupLesson,
  GroupMember,
  GroupQuestion,
  GroupSection,
  GroupSeries,
  Highlight,
  InboxItem,
  InboxItemTag,
  Lesson,
  LessonTag,
  Link,
  MemoryItem,
  PassageVisit,
  Quarter,
  Question,
  QuestionEntry,
  QuestionEntryKind,
  ResurfaceDismissal,
  Section,
  SectionBody,
  SectionTag,
  Series,
  Tag,
  Takeaway,
  Template,
  UserSettings,
} from '@lamp/domain';
import {
  ALL_RESURFACING,
  chipsWithoutAppText,
  NO_DEFAULT_TEMPLATES,
  newId,
  NOT_IN_GROUP,
  OPEN_IN_TARGETS,
  withoutAppText,
} from '@lamp/domain';
import { Dexie, type DexieOptions, type Table, type Transaction } from 'dexie';

/** The entities stored one row per id; settings are one row per device. */
export type RowEntity = Exclude<EntityName, 'userSettings'>;

/**
 * A queued change (§6.1), in the order it was made. `seq` is assigned by IndexedDB. `sent` marks a
 * change that has gone out in a push, so it's never merged with a later one (the server may have
 * applied it); `rejected` is the server's reason for refusing it, which holds back later changes
 * to the same row (§6.2).
 */
export type OutboxEntry = Change & { seq?: number; sent?: boolean; rejected?: Rejection };

/** Why the server refused a change: its error code and message. */
export interface Rejection {
  errorCode: string;
  message: string;
}

/** What the device knows about its sync (§6.1, §6.6). One row, under `SYNC_STATE_KEY`. */
export interface SyncState {
  /** This device's own id, sent with every push. */
  deviceId: string;
  /** The highest server `rev` pulled so far; 0 before the first pull. */
  cursor: number;
  lastPushAt: string | null;
  lastPullAt: string | null;
  /** Server time minus device time, from the last pull (§6.5). */
  clockOffsetMs: number;
  /** The account the local data last synced with; null for a guest who never signed in. */
  ownerUserId: string | null;
  /**
   * That account's email, for the "notes from another account" dialog (§6.6). Missing on devices
   * that first synced before M3-10.
   */
  ownerEmail?: string | null;
}

/** Settings fields from before the app had one theme, removed in version 5. */
interface RetiredSettings {
  themePreset?: string;
  look?: string;
}

/**
 * A quarterly digest's draft (F32, M12-08), on this device only until it's kept as a lesson
 * (decided in M12-08): the synced `lastDigestQuarter` says it was drafted, so no other device
 * drafts it again. One row per quarter.
 */
export interface DigestDraft {
  quarter: Quarter;
  title: string;
  /** The draft's sections, in order; the last starts empty, for a note of one's own. */
  sections: { id: string; body: SectionBody }[];
  createdAt: string;
  updatedAt: string;
}

/**
 * Rows from a group's feed (§17.12): every member's, the user's own included, kept apart from the
 * user's notes. Nothing reads them as notes: they aren't cited, linked, searched, exported, copied
 * or pushed.
 */
export type InGroup<T> = T & { groupId: string };

/** How far the device has read a group's feed. */
export interface GroupSync {
  groupId: string;
  cursor: number;
}

export const SYNC_STATE_KEY = 'device';
export const SETTINGS_KEY = 'settings';

/**
 * The device's copy of the user's notes (TECH-DESIGN §6.1): one table per synced entity, named as
 * in sync changes, with the same fields as the server minus `userId`; the derived `citation` and
 * `link` indexes; the `outbox` of changes waiting to be pushed; and `syncState`.
 *
 * Screens read these tables with `useLiveQuery`. Only actions (`./action.ts`) write to them.
 */
export class LampDb extends Dexie {
  series!: Table<Series, string>;
  lesson!: Table<Lesson, string>;
  section!: Table<Section, string>;
  tag!: Table<Tag, string>;
  sectionTag!: Table<SectionTag, string>;
  lessonTag!: Table<LessonTag, string>;
  takeaway!: Table<Takeaway, string>;
  question!: Table<Question, string>;
  highlight!: Table<Highlight, string>;
  memoryItem!: Table<MemoryItem, string>;
  inboxItem!: Table<InboxItem, string>;
  inboxItemTag!: Table<InboxItemTag, string>;
  questionEntry!: Table<QuestionEntry, string>;
  template!: Table<Template, string>;
  passageVisit!: Table<PassageVisit, string>;
  resurfaceDismissal!: Table<ResurfaceDismissal, string>;
  comment!: Table<Comment, string>;
  /** One row, under `SETTINGS_KEY`. */
  userSettings!: Table<UserSettings, string>;
  citation!: Table<Citation, string>;
  link!: Table<Link, string>;
  outbox!: Table<OutboxEntry, number>;
  syncState!: Table<SyncState, string>;
  digestDraft!: Table<DigestDraft, string>;
  group!: Table<GroupInfo, string>;
  groupMember!: Table<InGroup<GroupMember>, string>;
  groupSeries!: Table<InGroup<GroupSeries>, string>;
  groupLesson!: Table<InGroup<GroupLesson>, string>;
  groupSection!: Table<InGroup<GroupSection>, string>;
  groupQuestion!: Table<InGroup<GroupQuestion>, string>;
  groupComment!: Table<InGroup<GroupComment>, string>;
  groupSync!: Table<GroupSync, string>;

  /** Tests pass fake-indexeddb in `options`. */
  constructor(name = 'lamp', options?: DexieOptions) {
    super(name, options);
    this.version(1).stores({
      series: 'id',
      lesson: 'id, seriesId, date',
      section: 'id, lessonId, parentId',
      tag: 'id, name',
      sectionTag: 'id, tagId, sectionId',
      lessonTag: 'id, tagId, lessonId',
      takeaway: 'id, lessonId',
      question: 'id, lessonId, status',
      highlight: 'id',
      memoryItem: 'id, nextReviewAt',
      userSettings: '',
      // The verse index (§8.4) is a range query on startOrd and endOrd.
      citation: 'id, sourceId, lessonId, startOrd, endOrd',
      outbox: '++seq, [entity+entityId]',
      syncState: '',
    });
    // `autoPreviewVerses` added; off until the user turns it on. Not queued: it's the default.
    this.version(2).upgrade((tx) =>
      tx
        .table('userSettings')
        .toCollection()
        .modify((settings: Partial<UserSettings>) => {
          settings.autoPreviewVerses ??= false;
        }),
    );
    // `look` added; Classic, the look every device had before. Not queued, like the above.
    // Dropped again in version 5.
    this.version(3).upgrade((tx) =>
      tx
        .table('userSettings')
        .toCollection()
        .modify((settings: RetiredSettings) => {
          settings.look ??= 'classic';
        }),
    );
    // `conflictDevice` added (§6.4), for queued section changes too: the server's schema needs it.
    // Conflicted copies are indexed, so a lesson can count its own.
    this.version(4)
      .stores({ section: 'id, lessonId, parentId, conflictOf' })
      .upgrade(async (tx) => {
        await tx
          .table('section')
          .toCollection()
          .modify((section: Partial<Section>) => {
            section.conflictDevice ??= null;
          });
        await tx
          .table('outbox')
          .filter((entry: OutboxEntry) => entry.entity === 'section' && entry.op === 'upsert')
          .modify((entry: OutboxEntry) => {
            (entry as { row: Partial<Section> }).row.conflictDevice ??= null;
          });
      });
    // One theme (Lamplight): `themePreset` and `look` dropped, from the row and from queued
    // settings changes, which the server's schema no longer has.
    this.version(5).upgrade(async (tx) => {
      await tx
        .table('userSettings')
        .toCollection()
        .modify((settings: RetiredSettings) => {
          delete settings.themePreset;
          delete settings.look;
        });
      await tx
        .table('outbox')
        .filter((entry: OutboxEntry) => entry.entity === 'userSettings')
        .modify((entry: OutboxEntry) => {
          const change = entry as { row?: RetiredSettings; changed?: string[] };
          delete change.row?.themePreset;
          delete change.row?.look;
          if (change.changed) {
            change.changed = change.changed.filter((f) => f !== 'themePreset' && f !== 'look');
          }
        });
    });
    // The inbox (F17, §17.2): sorted by when an item arrived, an import's items found together,
    // and an item found from the section it was placed in.
    this.version(6).stores({ inboxItem: 'id, receivedAt, importId, placedInSectionId' });
    // `pasteChips` (F19) and `openInTargets` (F20) added at their defaults, for queued settings
    // changes too: the server's schema needs them. Not queued themselves, like version 2.
    this.version(7).upgrade(async (tx) => {
      await tx.table('userSettings').toCollection().modify(withDefaults);
      await tx
        .table('outbox')
        .filter((entry: OutboxEntry) => entry.entity === 'userSettings')
        .modify((entry: OutboxEntry) => {
          const row = (entry as { row?: Partial<UserSettings> }).row;
          if (row) withDefaults(row);
        });
    });
    // M10: question entries (F24, §17.5), whose latest gives a question its status, and the link
    // index (F23, §17.4), found by the section a link is in and the row it points at. A
    // question's `status` and `answerSectionId` leave it, and its queued changes.
    this.version(8)
      .stores({
        question: 'id, lessonId',
        questionEntry: 'id, questionId, lessonId, sectionId',
        link: 'id, fromSectionId, fromLessonId, targetId',
      })
      .upgrade(threadsFromStatus);
    // `question.splitFromId` added (F24, M10-10), for queued question changes too: the server's
    // schema needs it. Not queued itself, like version 7.
    this.version(9).upgrade(async (tx) => {
      await tx.table('question').toCollection().modify(unsplit);
      await tx
        .table('outbox')
        .filter((entry: OutboxEntry) => entry.entity === 'question' && entry.op === 'upsert')
        .modify((entry: OutboxEntry) => unsplit((entry as { row: Partial<Question> }).row));
    });
    // The user's own templates (F25, M10-13), and `defaultTemplates` (M10-14) at its default.
    // A lesson's `source` is its `kind` (§17.7), in stored lessons and queued lesson changes,
    // `changed` lists too. Not queued themselves, like version 7.
    this.version(10)
      .stores({ template: 'id' })
      .upgrade(async (tx) => {
        await tx.table('userSettings').toCollection().modify(withNoDefaults);
        await tx.table('lesson').toCollection().modify(kindFromSource);
        await tx
          .table('outbox')
          .filter((entry: OutboxEntry) => entry.op === 'upsert')
          .modify((entry: OutboxEntry) => {
            const change = entry as unknown as { row?: object; changed?: string[] };
            if (entry.entity === 'userSettings' && change.row) withNoDefaults(change.row);
            if (entry.entity !== 'lesson' || !change.row) return;
            kindFromSource(change.row as SourceLesson);
            change.changed = change.changed?.map((f) => (f === 'source' ? 'kind' : f));
          });
      });
    // M11: tags on inbox items (F27, §17.2), found by tag and by item; a lesson's source and a
    // section's moment in it (F28, §17.7), null in stored rows and queued changes, which the
    // server's schema needs. Not queued themselves, like version 7.
    this.version(11)
      .stores({ inboxItemTag: 'id, tagId, inboxItemId' })
      .upgrade(async (tx) => {
        await tx.table('lesson').toCollection().modify(withoutSource);
        await tx.table('section').toCollection().modify(withoutMoment);
        await tx
          .table('outbox')
          .filter((entry: OutboxEntry) => entry.op === 'upsert')
          .modify((entry: OutboxEntry) => {
            const row = (entry as { row?: object }).row;
            if (entry.entity === 'lesson' && row) withoutSource(row);
            if (entry.entity === 'section' && row) withoutMoment(row);
          });
      });
    // M12: compile view visits, found by their range like citations, and resurface dismissals
    // (F30, §17.8); the `resurfacing` and `lastDigestQuarter` settings at their defaults, stored
    // and queued, which the server's schema needs. Not queued themselves, like version 7.
    this.version(12)
      .stores({ passageVisit: 'id, startOrd, endOrd', resurfaceDismissal: 'id, targetKey' })
      .upgrade(async (tx) => {
        await tx.table('userSettings').toCollection().modify(withReflection);
        await tx
          .table('outbox')
          .filter((entry: OutboxEntry) => entry.entity === 'userSettings')
          .modify((entry: OutboxEntry) => {
            const row = (entry as { row?: object }).row;
            if (row) withReflection(row);
          });
      });
    // M12-08: the digest draft, on the device only (not synced, so nothing to queue).
    this.version(13).stores({ digestDraft: 'quarter' });
    // Decision 97: a reference keeps no BSB or KJV translation or snapshot, in stored rows, queued
    // changes and digest drafts; the server's schema refuses them. Not queued themselves: the
    // server's rows are changed by its own migration.
    this.version(14).upgrade(async (tx) => {
      for (const entity of REF_ENTITIES) {
        await tx
          .table(entity)
          .toCollection()
          .modify((row: object) => withoutStoredText(row));
      }
      await tx
        .table('digestDraft')
        .toCollection()
        .modify((draft: { sections: object[] }) => {
          draft.sections = chipsWithoutAppText(draft.sections);
        });
      await tx
        .table('outbox')
        .filter((entry: OutboxEntry) => entry.op === 'upsert')
        .modify((entry: OutboxEntry) => {
          const row = (entry as { row?: object }).row;
          if (row && (REF_ENTITIES as readonly string[]).includes(entry.entity)) {
            withoutStoredText(row);
          }
        });
    });
    // Groups (M13-07, §17.12): other members' rows from each group's feed, and its cursor.
    this.version(15).stores({
      group: 'id',
      groupMember: 'id, groupId, userId',
      groupSeries: 'id, groupId',
      groupLesson: 'id, groupId, seriesId',
      groupSync: 'groupId',
    });
    // Group threads (M13-08 to M13-10, §17.12): a lesson's group lesson, a section's and a
    // question's group, comments, and the group stores for sections, questions and comments.
    // Every stored and queued row is private, outside any group, as the server's migration makes
    // them; not queued themselves, like version 7.
    this.version(16)
      .stores({
        lesson: 'id, seriesId, date, groupLessonId',
        section: 'id, lessonId, parentId, conflictOf, groupId',
        question: 'id, lessonId, groupId',
        comment: 'id, sectionId, groupId',
        groupSection: 'id, groupId, groupLessonId',
        groupQuestion: 'id, groupId, groupLessonId',
        groupComment: 'id, groupId, sectionId',
      })
      .upgrade(async (tx) => {
        for (const entity of ['lesson', 'section', 'question'] as const) {
          await tx
            .table(entity)
            .toCollection()
            .modify((row: object) => notInGroup(entity, row));
        }
        await tx
          .table('outbox')
          .filter((entry: OutboxEntry) => entry.op === 'upsert')
          .modify((entry: OutboxEntry) => {
            const row = (entry as { row?: object }).row;
            if (
              row &&
              (entry.entity === 'lesson' ||
                entry.entity === 'section' ||
                entry.entity === 'question')
            ) {
              notInGroup(entry.entity, row);
            }
          });
      });
  }

  rows<E extends RowEntity>(entity: E): Table<EntityRow<E>, string> {
    return this.table(entity);
  }
}

/** Version 16's group columns, private, on a stored or queued row made before them. */
function notInGroup(entity: keyof typeof NOT_IN_GROUP, row: object) {
  for (const [column, value] of Object.entries(NOT_IN_GROUP[entity])) {
    (row as Record<string, unknown>)[column] ??= value;
  }
}

/** The entities whose rows hold references: in a body, a `ref` or the main passages. */
const REF_ENTITIES = ['section', 'lesson', 'highlight', 'memoryItem', 'inboxItem'] as const;

/** Version 14: a row's references without the app's own text (decision 97), changed in place. */
function withoutStoredText(row: { body?: unknown; ref?: unknown; mainPassages?: unknown }) {
  if (row.body) row.body = chipsWithoutAppText(row.body);
  if (row.ref) row.ref = withoutAppText(row.ref);
  if (Array.isArray(row.mainPassages)) row.mainPassages = row.mainPassages.map(withoutAppText);
}

/** Version 12's settings at their defaults: every rule on, no digest yet. */
function withReflection(settings: Partial<UserSettings>) {
  settings.resurfacing ??= { ...ALL_RESURFACING };
  settings.lastDigestQuarter ??= null;
}

/** Version 11's source columns, none, on a stored or queued lesson. */
function withoutSource(lesson: Partial<Lesson>) {
  lesson.sourceType ??= null;
  lesson.sourceTitle ??= null;
  lesson.sourceAuthor ??= null;
  lesson.sourceUrl ??= null;
  lesson.sourceStartedAt ??= null;
}

/** Version 11's `sourceAt` and `sourcePage`, none, on a stored or queued section. */
function withoutMoment(section: Partial<Section>) {
  section.sourceAt ??= null;
  section.sourcePage ??= null;
}

/** A lesson as stored before version 10. */
type SourceLesson = Omit<Lesson, 'kind'> & { kind?: Lesson['kind']; source?: Lesson['kind'] };

/** Version 10's rename, on a stored or queued lesson. */
function kindFromSource(lesson: SourceLesson) {
  if (lesson.source === undefined) return;
  lesson.kind ??= lesson.source;
  delete lesson.source;
}

/** Version 10's `defaultTemplates`, none for each kind, on a stored or queued settings row. */
function withNoDefaults(settings: Partial<UserSettings>) {
  settings.defaultTemplates ??= { ...NO_DEFAULT_TEMPLATES };
}

/** Version 9's `splitFromId`, on a stored or queued question. */
function unsplit(question: Partial<Question>) {
  question.splitFromId ??= null;
}

/** Version 7's new settings at their defaults, on a stored or queued settings row. */
function withDefaults(settings: Partial<UserSettings>) {
  settings.pasteChips ??= true;
  settings.openInTargets ??= [...OPEN_IN_TARGETS];
}

/** A question as stored before version 8. */
type StatusQuestion = Question & { status?: string; answerSectionId?: string | null };

/**
 * Version 8: every question's status becomes entries, as the server's M10 migration does (§17.5):
 * `asked` when it was made, `answered` once it has an answer section (when that section was made,
 * so writing in it answers the question as before), and `parked` for a parked one. Only for
 * questions the server never had (`rev` 0, a guest's or not yet synced), queued; the server's
 * migration makes the rest, and they arrive in the pull. A synced question changed here since
 * (park, reopen, answer) and not yet pushed gets one queued entry for its state now, after
 * the server's. Then the two fields leave the stored questions and their queued changes.
 */
async function threadsFromStatus(tx: Transaction): Promise<void> {
  const questions: StatusQuestion[] = await tx.table('question').toArray();
  const outbox: OutboxEntry[] = await tx.table('outbox').toArray();
  const changedHere = new Set(
    outbox
      .filter(
        (entry) =>
          entry.entity === 'question' &&
          entry.op === 'upsert' &&
          (!entry.changed ||
            entry.changed.some((f) => (f as string) === 'status' || f === 'answerSectionId')),
      )
      .map((entry) => (entry as { entityId: string }).entityId),
  );
  const made = async (
    question: StatusQuestion,
    kind: QuestionEntryKind,
    at: string,
    sectionId: string | null = null,
  ) => {
    const row: QuestionEntry = {
      id: newId(),
      questionId: question.id,
      lessonId: question.lessonId,
      kind,
      sectionId,
      createdAt: at,
      updatedAt: at,
      rev: 0,
      deletedAt: null,
    };
    await tx.table('questionEntry').add(row);
    const { rev: _rev, ...sent } = row;
    await tx.table('outbox').add({
      changeId: newId(),
      baseRev: 0,
      clientTime: at,
      entity: 'questionEntry',
      entityId: row.id,
      op: 'upsert',
      row: sent,
    });
  };
  for (const question of questions) {
    const answer = question.answerSectionId
      ? ((await tx.table('section').get(question.answerSectionId)) as Section | undefined)
      : undefined;
    if (question.rev === 0) {
      await made(question, 'asked', question.createdAt);
      if (answer) await made(question, 'answered', answer.createdAt, answer.id);
      if (question.status === 'parked') await made(question, 'parked', question.updatedAt);
    } else if (changedHere.has(question.id)) {
      if (question.status === 'parked') await made(question, 'parked', question.updatedAt);
      else if (answer) await made(question, 'answered', question.updatedAt, answer.id);
      else await made(question, 'reopened', question.updatedAt);
    }
  }
  await tx
    .table('question')
    .toCollection()
    .modify((question: StatusQuestion) => {
      delete question.status;
      delete question.answerSectionId;
    });
  await tx
    .table('outbox')
    .filter((entry: OutboxEntry) => entry.entity === 'question' && entry.op === 'upsert')
    .modify((entry: OutboxEntry) => {
      const change = entry as unknown as { row: StatusQuestion; changed?: string[] };
      delete change.row.status;
      delete change.row.answerSectionId;
      if (change.changed) {
        change.changed = change.changed.filter((f) => f !== 'status' && f !== 'answerSectionId');
      }
    });
}

/** The app's database. Tests make their own with `new LampDb(name)`. */
export const db = new LampDb();
