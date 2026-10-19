import { z } from 'zod';
import { idSchema, lineSchema, revSchema, timestampSchema } from './common.ts';
import {
  commentSchema,
  lessonSchema,
  questionSchema,
  sectionSchema,
  seriesSchema,
} from './entities.ts';
import { clientVersionSchema } from './sync.ts';

/**
 * Groups (F35, TECH-DESIGN §17.12). Every row keeps one owner, who alone writes it; members read
 * each other through a feed per group, as projections (only the columns below). The group, its
 * members and its series are the server's, changed online through `/api/groups`, never pushed.
 */

export const GROUP_ROLES = ['owner', 'member'] as const;
export type GroupRole = (typeof GROUP_ROLES)[number];

/** Members a group can have (decision 100). */
export const MAX_GROUP_MEMBERS = 50;

export const groupNameSchema = lineSchema(80);
/** What the group calls a member: chosen per group, never the email (decision 100). */
export const displayNameSchema = lineSchema(40);

/** An invite's token, as in `/join?token=…`: base64url of an HMAC-SHA256. */
export const inviteTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);

// --- Endpoints -------------------------------------------------------------------------------

/** `POST /api/groups`: a group around one of the caller's series, with the caller as owner. */
export const createGroupRequestSchema = z.strictObject({
  name: groupNameSchema,
  seriesId: idSchema,
  displayName: displayNameSchema,
});
export type CreateGroupRequest = z.infer<typeof createGroupRequestSchema>;

/** The group an endpoint made or joined; its rows come in its feed. */
export const groupIdResponseSchema = z.strictObject({ groupId: idSchema });
export type GroupIdResponse = z.infer<typeof groupIdResponseSchema>;

/** `PATCH /api/groups/:id` (owner). */
export const renameGroupRequestSchema = z.strictObject({ name: groupNameSchema });
export type RenameGroupRequest = z.infer<typeof renameGroupRequestSchema>;

/** `GET` and `POST /api/groups/:id/invite` (owner): the address to send, `<APP_URL>/join?token=…`. */
export const inviteResponseSchema = z.strictObject({ url: z.url() });
export type InviteResponse = z.infer<typeof inviteResponseSchema>;

/** `POST /api/invites/preview` and the start of `…/join`: the token in the body, never the path. */
export const inviteRequestSchema = z.strictObject({ token: inviteTokenSchema });
export type InviteRequest = z.infer<typeof inviteRequestSchema>;

/** What the join screen shows before joining. */
export const invitePreviewSchema = z.strictObject({
  groupId: idSchema,
  name: z.string(),
  /** The owner's name in the group: "Ann invited you…". */
  ownerName: z.string(),
  /** The titles of its series, in the order they were added. */
  series: z.array(z.string()),
  members: z.int().min(1),
});
export type InvitePreview = z.infer<typeof invitePreviewSchema>;

/** `POST /api/invites/join`. */
export const joinGroupRequestSchema = z.strictObject({
  token: inviteTokenSchema,
  displayName: displayNameSchema,
});
export type JoinGroupRequest = z.infer<typeof joinGroupRequestSchema>;

/** `POST /api/groups/:id/series` (owner, one of their own series). */
export const addGroupSeriesRequestSchema = z.strictObject({ seriesId: idSchema });
export type AddGroupSeriesRequest = z.infer<typeof addGroupSeriesRequestSchema>;

/** `POST /api/groups/:id/owner` (owner): hands the group to another member. */
export const groupOwnerRequestSchema = z.strictObject({ userId: idSchema });
export type GroupOwnerRequest = z.infer<typeof groupOwnerRequestSchema>;

export const groupParamsSchema = z.strictObject({ id: z.uuid() });
export type GroupParams = z.infer<typeof groupParamsSchema>;
export const groupMemberParamsSchema = z.strictObject({ id: z.uuid(), userId: z.uuid() });
export type GroupMemberParams = z.infer<typeof groupMemberParamsSchema>;
export const groupSeriesParamsSchema = z.strictObject({ id: z.uuid(), seriesId: z.uuid() });
export type GroupSeriesParams = z.infer<typeof groupSeriesParamsSchema>;

// --- The weekly email (M13-12) ----------------------------------------------------------------

/** `PUT /api/account/group-digest`: the weekly email of group activity on or off. */
export const groupDigestRequestSchema = z.strictObject({ on: z.boolean() });
export type GroupDigestRequest = z.infer<typeof groupDigestRequestSchema>;

/**
 * An unsubscribe link's token: the user's id and an HMAC of it, base64url, so the link works
 * signed out and only turns off that user's email.
 */
export const unsubscribeTokenSchema = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[A-Za-z0-9_-]{43}$/);

/** `POST /api/email/unsubscribe?token=…`: from the app's page, or a mail app's one-click. */
export const unsubscribeQuerySchema = z.object({ token: unsubscribeTokenSchema });
export type UnsubscribeQuery = z.infer<typeof unsubscribeQuerySchema>;

// --- The feed --------------------------------------------------------------------------------

export const groupInfoSchema = z.strictObject({
  id: idSchema,
  name: groupNameSchema,
  createdAt: timestampSchema,
});

export const groupMemberSchema = z.strictObject({
  /** The membership's id. */
  id: idSchema,
  userId: idSchema,
  displayName: displayNameSchema,
  role: z.enum(GROUP_ROLES),
  joinedAt: timestampSchema,
});

/** A series shared into the group, as its members see it. */
export const groupSeriesSchema = seriesSchema
  .pick({ id: true, title: true, description: true, kind: true })
  .extend({ userId: idSchema });

/** A lesson of a shared series: its details, never its owner's notes, tags or takeaways. */
export const groupLessonSchema = lessonSchema
  .pick({
    id: true,
    seriesId: true,
    title: true,
    date: true,
    kind: true,
    speaker: true,
    church: true,
    mainPassages: true,
    sourceType: true,
    sourceTitle: true,
    sourceAuthor: true,
    sourceUrl: true,
    sourceStartedAt: true,
    createdAt: true,
    updatedAt: true,
  })
  .extend({ userId: idSchema });

/**
 * A section in the group's thread (M13-08): the author's, in the group lesson or in their own lesson
 * for it, so `groupLessonId` is worked out from its lesson. Never its tags, conflicts or order.
 */
export const groupSectionSchema = sectionSchema
  .pick({
    id: true,
    parentId: true,
    replyToId: true,
    sharedAt: true,
    body: true,
    sourceAt: true,
    sourcePage: true,
    answersQuestionId: true,
    answerKind: true,
    createdAt: true,
    updatedAt: true,
  })
  .extend({ userId: idSchema, groupLessonId: idSchema });

/** A question asked in the group's thread (M13-08), for its queue (M13-10); never its entries. */
export const groupQuestionSchema = questionSchema
  .pick({ id: true, text: true, createdAt: true, updatedAt: true })
  .extend({ userId: idSchema, groupLessonId: idSchema });

/** A comment on a group section (M13-09). */
export const groupCommentSchema = commentSchema
  .pick({ id: true, sectionId: true, body: true, createdAt: true, updatedAt: true })
  .extend({ userId: idSchema });

export type GroupInfo = z.infer<typeof groupInfoSchema>;
export type GroupMember = z.infer<typeof groupMemberSchema>;
export type GroupSeries = z.infer<typeof groupSeriesSchema>;
export type GroupLesson = z.infer<typeof groupLessonSchema>;
export type GroupSection = z.infer<typeof groupSectionSchema>;
export type GroupQuestion = z.infer<typeof groupQuestionSchema>;
export type GroupComment = z.infer<typeof groupCommentSchema>;

/** What a feed carries, parents first: the order of a page within one rev. */
export const GROUP_ENTITIES = [
  'group',
  'member',
  'series',
  'lesson',
  'section',
  'question',
  'comment',
] as const;
export type GroupEntity = (typeof GROUP_ENTITIES)[number];

/**
 * A row of the feed changed since the cursor, or one members must drop. `addedRev` is the feed's
 * revision when the row first reached the group (M13-11): what's new to a member is what was added
 * after their last visit, so an edit doesn't bring an old reply back.
 */
const pulled = <E extends GroupEntity, S extends z.ZodType>(entity: E, row: S) =>
  z.strictObject({ entity: z.literal(entity), row, addedRev: revSchema });

export const groupPulledRowSchema = z.union([
  z.discriminatedUnion('entity', [
    pulled('group', groupInfoSchema),
    pulled('member', groupMemberSchema),
    pulled('series', groupSeriesSchema),
    pulled('lesson', groupLessonSchema),
    pulled('section', groupSectionSchema),
    pulled('question', groupQuestionSchema),
    pulled('comment', groupCommentSchema),
  ]),
  z.strictObject({ entity: z.enum(GROUP_ENTITIES), id: idSchema, gone: z.literal(true) }),
]);
export type GroupPulledRow = z.infer<typeof groupPulledRowSchema>;

/** `GET /api/groups/:id/pull?cursor=<rev>&limit=500&clientVersion=…`. */
export const groupPullQuerySchema = z.strictObject({
  cursor: z.coerce.number().pipe(revSchema),
  clientVersion: clientVersionSchema,
  limit: z.coerce.number().pipe(z.int().min(1).max(500)).default(500),
});
export type GroupPullQuery = z.infer<typeof groupPullQuerySchema>;

export const groupPullResponseSchema = z.strictObject({
  rows: z.array(groupPulledRowSchema),
  nextCursor: revSchema,
  hasMore: z.boolean(),
  remaining: z.int().min(0),
});
export type GroupPullResponse = z.infer<typeof groupPullResponseSchema>;
