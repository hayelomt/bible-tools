-- A lesson's source (F28, §17.7): columns rather than an entity, since a lesson has at most one.
-- AlterTable
ALTER TABLE "lesson" ADD COLUMN "source_author" TEXT,
ADD COLUMN "source_started_at" TIMESTAMPTZ(3),
ADD COLUMN "source_title" TEXT,
ADD COLUMN "source_type" TEXT,
ADD COLUMN "source_url" TEXT;

ALTER TABLE "lesson" ADD CONSTRAINT "lesson_source_type_check"
  CHECK ("source_type" IN ('sermon', 'book', 'podcast', 'other'));

-- A section's moment in that source, stamped by capture mode (M11-01), or a page in a book.
-- AlterTable
ALTER TABLE "section" ADD COLUMN "source_at" TIMESTAMPTZ(3),
ADD COLUMN "source_page" TEXT;

-- Tags on inbox items (F27, M11-02), one live link per item and tag like section_tag.
-- CreateTable
CREATE TABLE "inbox_item_tag" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "tag_id" UUID NOT NULL,
    "inbox_item_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rev" BIGINT NOT NULL DEFAULT 0,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "inbox_item_tag_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "inbox_item_tag_user_id_rev_idx" ON "inbox_item_tag"("user_id", "rev");

-- CreateIndex
CREATE INDEX "inbox_item_tag_tag_id_idx" ON "inbox_item_tag"("tag_id");

-- CreateIndex
CREATE INDEX "inbox_item_tag_inbox_item_id_idx" ON "inbox_item_tag"("inbox_item_id");

-- AddForeignKey
ALTER TABLE "inbox_item_tag" ADD CONSTRAINT "inbox_item_tag_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inbox_item_tag" ADD CONSTRAINT "inbox_item_tag_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inbox_item_tag" ADD CONSTRAINT "inbox_item_tag_inbox_item_id_fkey" FOREIGN KEY ("inbox_item_id") REFERENCES "inbox_item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- One live link per item and tag; a push that would make a second is refused as DUPLICATE.
CREATE UNIQUE INDEX "inbox_item_tag_inbox_item_id_tag_id_live_key" ON "inbox_item_tag"("inbox_item_id", "tag_id") WHERE "deleted_at" IS NULL;
