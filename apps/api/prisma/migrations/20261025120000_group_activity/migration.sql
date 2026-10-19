-- Group activity (F35, M13-11, M13-12, §17.12): when each feed row first reached its group, each
-- member's visit to a group, and the weekly email of group activity.

-- AlterTable: a row already in a feed reached it no later than its current rev.
ALTER TABLE "group_feed" ADD COLUMN "added_rev" BIGINT,
ADD COLUMN "added_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
UPDATE "group_feed" SET "added_rev" = "rev";
ALTER TABLE "group_feed" ALTER COLUMN "added_rev" SET NOT NULL;
CREATE INDEX "group_feed_group_id_added_at_idx" ON "group_feed"("group_id", "added_at");

-- AlterTable
ALTER TABLE "user" ADD COLUMN "group_digest" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "group_digest_sent_at" TIMESTAMPTZ(3);

-- CreateTable: the user's own synced row; no foreign key to the group (a visit outlives leaving).
CREATE TABLE "group_visit" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "group_id" UUID NOT NULL,
    "seen_rev" BIGINT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rev" BIGINT NOT NULL DEFAULT 0,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "group_visit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "group_visit_user_id_rev_idx" ON "group_visit"("user_id", "rev");

-- AddForeignKey
ALTER TABLE "group_visit" ADD CONSTRAINT "group_visit_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
