-- Group threads (F35, M13-08 to M13-10, §17.12): a member's own lesson for a group lesson, group
-- sections and questions, comments on group sections, and answers to group questions. Every row
-- stays its author's; the columns naming another user's row (a group lesson, a section replied to
-- or commented on, a question answered) and the group have no foreign key, so nothing of one user
-- changes when another's rows do. What exists today is private: the defaults.

ALTER TABLE "lesson" ADD COLUMN "group_lesson_id" UUID;

ALTER TABLE "section" ADD COLUMN "visibility" TEXT NOT NULL DEFAULT 'private',
ADD COLUMN "group_id" UUID,
ADD COLUMN "shared_at" TIMESTAMPTZ(3),
ADD COLUMN "reply_to_id" UUID,
ADD COLUMN "answers_question_id" UUID,
ADD COLUMN "answer_kind" TEXT;

ALTER TABLE "question" ADD COLUMN "visibility" TEXT NOT NULL DEFAULT 'private',
ADD COLUMN "group_id" UUID;

-- CreateTable
CREATE TABLE "comment" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "section_id" UUID NOT NULL,
    "group_id" UUID NOT NULL,
    "body" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rev" BIGINT NOT NULL DEFAULT 0,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "comment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "lesson_group_lesson_id_idx" ON "lesson"("group_lesson_id");

-- CreateIndex
CREATE INDEX "section_group_id_idx" ON "section"("group_id");

-- CreateIndex
CREATE INDEX "question_group_id_idx" ON "question"("group_id");

-- CreateIndex
CREATE INDEX "comment_user_id_rev_idx" ON "comment"("user_id", "rev");

-- CreateIndex
CREATE INDEX "comment_section_id_idx" ON "comment"("section_id");

-- CreateIndex
CREATE INDEX "comment_group_id_idx" ON "comment"("group_id");

-- AddForeignKey
ALTER TABLE "comment" ADD CONSTRAINT "comment_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;


ALTER TABLE "section" ADD CONSTRAINT "section_visibility_check"
  CHECK ("visibility" IN ('private', 'group'));
-- In a group exactly when visible to it.
ALTER TABLE "section" ADD CONSTRAINT "section_group_check"
  CHECK (("visibility" = 'group') = ("group_id" IS NOT NULL));
ALTER TABLE "section" ADD CONSTRAINT "section_answer_kind_check"
  CHECK ("answer_kind" IN ('partial', 'full'));
-- An answer names its question and how much it answers, or neither.
ALTER TABLE "section" ADD CONSTRAINT "section_answer_check"
  CHECK (("answers_question_id" IS NULL) = ("answer_kind" IS NULL));

ALTER TABLE "question" ADD CONSTRAINT "question_visibility_check"
  CHECK ("visibility" IN ('private', 'group'));
ALTER TABLE "question" ADD CONSTRAINT "question_group_check"
  CHECK (("visibility" = 'group') = ("group_id" IS NOT NULL));

ALTER TABLE "comment" ADD CONSTRAINT "comment_body_check" CHECK (jsonb_typeof("body") = 'object');

ALTER TABLE "group_feed" DROP CONSTRAINT "group_feed_entity_check";
ALTER TABLE "group_feed" ADD CONSTRAINT "group_feed_entity_check"
  CHECK ("entity" IN ('group', 'member', 'series', 'lesson', 'section', 'question', 'comment'));
