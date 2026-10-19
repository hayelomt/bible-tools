import { z } from 'zod';
import { idSchema, lineSchema, textSchema, timestampSchema } from './common.ts';
import { QUESTION_STATUSES } from './entities.ts';
import { passageSchema } from './verse-ref.ts';

/**
 * Read-only share links (F34, TECH-DESIGN §17.10): made, listed and revoked online through
 * `/api/share-links`, never through sync. The page a link opens is served by the API at `/s/…`.
 */

/** What a link shows: a lesson, a series and its lessons, a compile view, or a lesson's handout. */
export const SHARE_TARGET_TYPES = ['lesson', 'series', 'compile', 'handout'] as const;
export type ShareTargetType = (typeof SHARE_TARGET_TYPES)[number];

/** When the link stops working; null for never. */
const expiresAtSchema = timestampSchema.nullable();

/**
 * A handout as the app lays it out (M12-05), frozen when its link is made (M13-03). The device
 * builds it, since the main passages' text comes from its Bible and the server has none.
 */
export const handoutSnapshotSchema = z.strictObject({
  title: lineSchema(500),
  /** "Sunday 12 October 2026 · Sermon · Pastor Ann", then the source. */
  details: z.array(textSchema(1000)).max(5),
  passages: z
    .array(
      z.strictObject({
        /** "John 10:1–18 (BSB)". */
        label: lineSchema(300),
        verses: z
          .array(z.strictObject({ label: lineSchema(20), text: textSchema(2000) }))
          .max(200)
          .nullable(),
      }),
    )
    .max(20),
  /** Each top-level section's first line. */
  notes: z.array(textSchema(2000)).max(500),
  takeaways: z.array(textSchema(2000)).max(500),
  questions: z
    .array(z.strictObject({ text: textSchema(2000), status: z.enum(QUESTION_STATUSES) }))
    .max(500),
  credit: textSchema(500),
});
export type HandoutSnapshot = z.infer<typeof handoutSnapshotSchema>;

/**
 * `POST /api/share-links`. A lesson and a series are live; a compile view is frozen at creation
 * unless `live`; a handout is always frozen, as the device sends it.
 */
export const createShareLinkRequestSchema = z.discriminatedUnion('targetType', [
  z.strictObject({
    targetType: z.enum(['lesson', 'series']),
    targetId: idSchema,
    expiresAt: expiresAtSchema,
  }),
  z.strictObject({
    targetType: z.literal('compile'),
    passage: passageSchema,
    live: z.boolean(),
    expiresAt: expiresAtSchema,
  }),
  z.strictObject({
    targetType: z.literal('handout'),
    targetId: idSchema,
    handout: handoutSnapshotSchema,
    expiresAt: expiresAtSchema,
  }),
]);
export type CreateShareLinkRequest = z.infer<typeof createShareLinkRequestSchema>;

/** A link as its owner sees it, in Settings → Shared links and the Share dialog. */
export const shareLinkSchema = z.strictObject({
  id: idSchema,
  /** The address to hand out: `<APP_URL>/s/<token>`. */
  url: z.url(),
  targetType: z.enum(SHARE_TARGET_TYPES),
  /** The lesson or series; null for a compile view. */
  targetId: idSchema.nullable(),
  /** A compile view's scope; null otherwise. */
  passage: passageSchema.nullable(),
  /** The target's title now ("The Good Shepherd", "Romans 8"); its last one once it's deleted. */
  title: z.string(),
  /** False for a link frozen when it was made (a handout, or a compile view as it was). */
  live: z.boolean(),
  /** The target was deleted: the link shows nothing until it's back. */
  gone: z.boolean(),
  expiresAt: expiresAtSchema,
  createdAt: timestampSchema,
  lastOpenedAt: timestampSchema.nullable(),
});
export type ShareLink = z.infer<typeof shareLinkSchema>;

/** `GET /api/share-links`: the owner's links, revoked ones left out, newest first. */
export const shareLinksResponseSchema = z.strictObject({ links: z.array(shareLinkSchema) });
export type ShareLinksResponse = z.infer<typeof shareLinksResponseSchema>;

/** `DELETE /api/share-links/:id`: revokes the link. */
export const shareLinkParamsSchema = z.strictObject({ id: z.uuid() });
export type ShareLinkParams = z.infer<typeof shareLinkParamsSchema>;
