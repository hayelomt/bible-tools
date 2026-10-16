import type {
  Change,
  Citation,
  EntityName,
  EntityRow,
  Highlight,
  Lesson,
  LessonTag,
  MemoryItem,
  Question,
  Section,
  SectionTag,
  Series,
  Tag,
  Takeaway,
  UserSettings,
} from '@lamp/domain';
import { Dexie, type DexieOptions, type Table } from 'dexie';

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

export const SYNC_STATE_KEY = 'device';
export const SETTINGS_KEY = 'settings';

/**
 * The device's copy of the user's notes (TECH-DESIGN §6.1): one table per synced entity, named as
 * in sync changes, with the same fields as the server minus `userId`; the derived `citation`
 * index; the `outbox` of changes waiting to be pushed; and `syncState`.
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
  /** One row, under `SETTINGS_KEY`. */
  userSettings!: Table<UserSettings, string>;
  citation!: Table<Citation, string>;
  outbox!: Table<OutboxEntry, number>;
  syncState!: Table<SyncState, string>;

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
  }

  rows<E extends RowEntity>(entity: E): Table<EntityRow<E>, string> {
    return this.table(entity);
  }
}

/** The app's database. Tests make their own with `new LampDb(name)`. */
export const db = new LampDb();
