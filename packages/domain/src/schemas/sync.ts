import { z } from 'zod';
import { idSchema, lineSchema, revSchema, timestampSchema } from './common.ts';
import { ENTITY_SCHEMAS, type EntityName, inboxItemChangeRow } from './entities.ts';

/**
 * Sync messages (TECH-DESIGN §6). A change is one outbox entry; the server applies each change
 * in its own transaction and answers with one result per change.
 */

export const MAX_CHANGES_PER_PUSH = 100;
export const MAX_PULL_LIMIT = 500;

/** The web app's version, from its package.json: `major.minor.patch`, perhaps with a suffix. */
export const clientVersionSchema = z
  .string()
  .max(50)
  .regex(/^\d+\.\d+\.\d+(?:[-+][\w.-]+)?$/, 'Expected a version like 1.2.3');

const changeFields = {
  /** Makes the change idempotent: a replay gets the stored result (§6.2). */
  changeId: idSchema,
  /** The row's `rev` when the device last saw it; 0 for a row the server has never seen. */
  baseRev: revSchema,
  clientTime: timestampSchema,
};

/**
 * The fields of the row this device edited since `baseRev`. In a conflict, only these are taken
 * from the change (§6.4). Missing means every field, as for a new row.
 */
const changedOf = (row: z.ZodObject) =>
  z.array(row.keyof()).max(Object.keys(row.shape).length).optional();

/** Upsert sends the whole row without `rev`, which the server assigns. Delete sends no row. */
function changeOf<const E extends Exclude<EntityName, 'userSettings'>, R extends z.ZodObject>(
  entity: E,
  row: R,
) {
  return z.discriminatedUnion('op', [
    z
      .strictObject({
        ...changeFields,
        entity: z.literal(entity),
        entityId: idSchema,
        op: z.literal('upsert'),
        row,
        changed: changedOf(row),
      })
      .refine((change) => sameId(change as unknown as { entityId: string; row: { id: string } }), {
        message: 'The row id must match entityId',
        path: ['row', 'id'],
      }),
    z.strictObject({
      ...changeFields,
      entity: z.literal(entity),
      entityId: idSchema,
      op: z.literal('delete'),
    }),
  ]);
}

const sameId = (change: { entityId: string; row: { id: string } }) =>
  change.row.id === change.entityId;

/** Settings fields dropped when the app went to one theme, still sent by an older app. */
const RETIRED_SETTINGS_FIELDS: readonly string[] = ['themePreset', 'look'];

/**
 * Settings are one row per account: no id, and never deleted. An older app's retired fields are
 * dropped rather than rejected, so its other settings still sync.
 */
const settingsRow = z.object(ENTITY_SCHEMAS.userSettings.omit({ rev: true }).shape);
const settingsChange = z.strictObject({
  ...changeFields,
  entity: z.literal('userSettings'),
  op: z.literal('upsert'),
  row: settingsRow,
  changed: z.preprocess(
    (fields) =>
      Array.isArray(fields)
        ? fields.filter((field) => !RETIRED_SETTINGS_FIELDS.includes(field as string))
        : fields,
    changedOf(settingsRow),
  ),
});

export const changeSchema = z.discriminatedUnion('entity', [
  settingsChange,
  changeOf('series', ENTITY_SCHEMAS.series.omit({ rev: true })),
  changeOf('lesson', ENTITY_SCHEMAS.lesson.omit({ rev: true })),
  changeOf('section', ENTITY_SCHEMAS.section.omit({ rev: true })),
  changeOf('tag', ENTITY_SCHEMAS.tag.omit({ rev: true })),
  changeOf('sectionTag', ENTITY_SCHEMAS.sectionTag.omit({ rev: true })),
  changeOf('lessonTag', ENTITY_SCHEMAS.lessonTag.omit({ rev: true })),
  changeOf('takeaway', ENTITY_SCHEMAS.takeaway.omit({ rev: true })),
  changeOf('question', ENTITY_SCHEMAS.question.omit({ rev: true })),
  changeOf('highlight', ENTITY_SCHEMAS.highlight.omit({ rev: true })),
  changeOf('memoryItem', ENTITY_SCHEMAS.memoryItem.omit({ rev: true })),
  changeOf('inboxItem', inboxItemChangeRow),
  changeOf('inboxItemTag', ENTITY_SCHEMAS.inboxItemTag.omit({ rev: true })),
  changeOf('questionEntry', ENTITY_SCHEMAS.questionEntry.omit({ rev: true })),
  changeOf('template', ENTITY_SCHEMAS.template.omit({ rev: true })),
  changeOf('passageVisit', ENTITY_SCHEMAS.passageVisit.omit({ rev: true })),
  changeOf('resurfaceDismissal', ENTITY_SCHEMAS.resurfaceDismissal.omit({ rev: true })),
  changeOf('comment', ENTITY_SCHEMAS.comment.omit({ rev: true })),
]);
export type Change = z.infer<typeof changeSchema>;

/** `POST /api/sync/push` (§6.2). The 1 MB body limit is enforced by the server, not here. */
export const pushRequestSchema = z.strictObject({
  /** The device's own id (`syncState.deviceId`). */
  deviceId: z.uuid(),
  /** Shown in the devices list ("Chrome on Android"). */
  deviceName: lineSchema(100),
  /** Older than `MIN_CLIENT_VERSION` gets `426` before anything is applied (§6.6). */
  clientVersion: clientVersionSchema,
  changes: z.array(changeSchema).min(1).max(MAX_CHANGES_PER_PUSH),
});
export type PushRequest = z.infer<typeof pushRequestSchema>;

/**
 * What the server checks of a push as a whole. Each change only needs its `changeId` here and is
 * validated on its own with `changeSchema`, so one bad change is rejected without failing the
 * others (§6.2).
 */
export const pushEnvelopeSchema = pushRequestSchema.extend({
  changes: z
    .array(z.looseObject({ changeId: idSchema }))
    .min(1)
    .max(MAX_CHANGES_PER_PUSH),
});
export type PushEnvelope = z.infer<typeof pushEnvelopeSchema>;

/** How a conflict was settled (§6.4). */
export const CONFLICT_RESOLUTIONS = [
  /** Last write wins, and this change was the later write. */
  'client-won',
  /** Last write wins, and the server's row was later; this change was discarded. */
  'server-won',
  /** Both sides changed a section body: the older body became a new section (`copyId`). */
  'conflicted-copy',
  /** One side deleted and the other edited: the row is restored with the edit. */
  'edit-won',
  /** Both sides deleted the row. */
  'already-deleted',
  /** The row's parent had been deleted and was restored. */
  'parent-restored',
] as const;
export type ConflictResolution = (typeof CONFLICT_RESOLUTIONS)[number];

export const pushResultSchema = z.discriminatedUnion('status', [
  z.strictObject({ changeId: idSchema, status: z.literal('applied'), rev: revSchema }),
  z.strictObject({
    changeId: idSchema,
    status: z.literal('conflict'),
    rev: revSchema,
    resolution: z.enum(CONFLICT_RESOLUTIONS),
    /** The conflicted copy's id, for `conflicted-copy`. */
    copyId: idSchema.optional(),
  }),
  z.strictObject({
    changeId: idSchema,
    status: z.literal('rejected'),
    errorCode: z.string(),
    message: z.string(),
  }),
]);
export type PushResult = z.infer<typeof pushResultSchema>;

export const pushResponseSchema = z.strictObject({ results: z.array(pushResultSchema) });
export type PushResponse = z.infer<typeof pushResponseSchema>;

/**
 * `GET /api/sync/pull?cursor=<rev>&limit=500&deviceId=…&deviceName=…&clientVersion=1.2.3` (§6.3). Query values arrive as
 * strings.
 */
export const pullQuerySchema = z.strictObject({
  cursor: z.coerce.number().pipe(revSchema),
  /** As in a push: the device is recorded on its first sync, and its session linked to it (§6.6). */
  deviceId: z.uuid(),
  deviceName: lineSchema(100),
  /** As in a push: older than `MIN_CLIENT_VERSION` gets `426`. */
  clientVersion: clientVersionSchema,
  limit: z.coerce.number().pipe(z.int().min(1).max(MAX_PULL_LIMIT)).default(MAX_PULL_LIMIT),
});
export type PullQuery = z.infer<typeof pullQuerySchema>;

function pulledRowOf<const E extends EntityName>(entity: E) {
  return z.strictObject({ entity: z.literal(entity), row: ENTITY_SCHEMAS[entity] });
}

/** A row changed since the cursor, tombstones included. */
export const pulledRowSchema = z.discriminatedUnion('entity', [
  pulledRowOf('userSettings'),
  pulledRowOf('series'),
  pulledRowOf('lesson'),
  pulledRowOf('section'),
  pulledRowOf('tag'),
  pulledRowOf('sectionTag'),
  pulledRowOf('lessonTag'),
  pulledRowOf('takeaway'),
  pulledRowOf('question'),
  pulledRowOf('highlight'),
  pulledRowOf('memoryItem'),
  pulledRowOf('inboxItem'),
  pulledRowOf('inboxItemTag'),
  pulledRowOf('questionEntry'),
  pulledRowOf('template'),
  pulledRowOf('passageVisit'),
  pulledRowOf('resurfaceDismissal'),
  pulledRowOf('comment'),
]);
export type PulledRow = z.infer<typeof pulledRowSchema>;

export const pullResponseSchema = z.strictObject({
  rows: z.array(pulledRowSchema),
  nextCursor: revSchema,
  hasMore: z.boolean(),
  /**
   * Rows after the request's cursor, this page's included, counted in the same snapshot: the
   * total for first-sync progress ("1,240 of 3,000").
   */
  remaining: z.int().min(0),
  /** For the device's clock offset (§6.5). */
  serverTime: timestampSchema,
  /** Older clients get 426 and "Update required" (§6.6). */
  minClientVersion: clientVersionSchema,
  /**
   * The user's groups and each one's feed revision (§17.12), from the same snapshot: the device
   * pulls the groups that moved, and drops one that's gone from the list.
   */
  groups: z.array(z.strictObject({ id: idSchema, rev: revSchema })),
});
export type PullResponse = z.infer<typeof pullResponseSchema>;
/** One of the user's groups in a pull, with its feed revision (§17.12). */
export type PulledGroup = PullResponse['groups'][number];
