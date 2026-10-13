-- AlterTable
ALTER TABLE "section" ADD COLUMN     "body_rev" BIGINT NOT NULL DEFAULT 0;

-- Rows already stored count their body as changed at their current rev.
UPDATE "section" SET "body_rev" = "rev";

-- AlterTable
ALTER TABLE "sync_change" ADD COLUMN     "copy_id" UUID,
ADD COLUMN     "resolution" TEXT;

ALTER TABLE "sync_change" ADD CONSTRAINT "sync_change_resolution_check"
  CHECK ("resolution" IN ('client-won', 'server-won', 'conflicted-copy', 'edit-won', 'already-deleted', 'parent-restored'));
