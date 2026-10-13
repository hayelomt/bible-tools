import { z } from 'zod';
import { idSchema, lineSchema, revSchema, timestampSchema } from './common.ts';
import { ENTITY_SCHEMAS, type EntityName } from './entities.ts';

/**
 * Sync messages (TECH-DESIGN §6). A change is one outbox entry; the server applies each change
 * in its own transaction and answers with one result per change.
 */

export const MAX_CHANGES_PER_PUSH = 100;
export const MAX_PULL_LIMIT = 500;

const changeFields = {
  /** Makes the change idempotent: a replay gets the stored result (§6.2). */
  changeId: idSchema,
  /** The row's `rev` when the device last saw it; 0 for a row the server has never seen. */
  baseRev: revSchema,
  clientTime: timestampSchema,
};

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

/** Settings are one row per account: no id, and never deleted. */
const settingsChange = z.strictObject({
  ...changeFields,
  entity: z.literal('userSettings'),
  op: z.literal('upsert'),
  row: ENTITY_SCHEMAS.userSettings.omit({ rev: true }),
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
]);
export type Change = z.infer<typeof changeSchema>;

/** `POST /api/sync/push` (§6.2). The 1 MB body limit is enforced by the server, not here. */
export const pushRequestSchema = z.strictObject({
  /** The device's own id (`syncState.deviceId`). */
  deviceId: z.uuid(),
  /** Shown in the devices list ("Chrome on Android"). */
  deviceName: lineSchema(100),
  clientVersion: lineSchema(50),
  changes: z.array(changeSchema).min(1).max(MAX_CHANGES_PER_PUSH),
});
export type PushRequest = z.infer<typeof pushRequestSchema>;

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

/** `GET /api/sync/pull?cursor=<rev>&limit=500` (§6.3). Query values arrive as strings. */
export const pullQuerySchema = z.strictObject({
  cursor: z.coerce.number().pipe(revSchema),
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
]);
export type PulledRow = z.infer<typeof pulledRowSchema>;

export const pullResponseSchema = z.strictObject({
  rows: z.array(pulledRowSchema),
  nextCursor: revSchema,
  hasMore: z.boolean(),
  /** For the device's clock offset (§6.5). */
  serverTime: timestampSchema,
  /** Older clients get 426 and "Update required" (§6.6). */
  minClientVersion: z.string(),
});
export type PullResponse = z.infer<typeof pullResponseSchema>;
