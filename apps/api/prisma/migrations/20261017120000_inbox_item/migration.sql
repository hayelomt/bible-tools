-- CreateTable
CREATE TABLE "inbox_item" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "origin" TEXT NOT NULL,
    "ref" JSONB,
    "text" TEXT,
    "source_url" TEXT,
    "received_at" TIMESTAMPTZ(3) NOT NULL,
    "colour" TEXT,
    "import_id" UUID,
    "snoozed_until" DATE,
    "placed_in_section_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rev" BIGINT NOT NULL DEFAULT 0,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "inbox_item_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "inbox_item_user_id_rev_idx" ON "inbox_item"("user_id", "rev");

-- AddForeignKey
ALTER TABLE "inbox_item" ADD CONSTRAINT "inbox_item_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inbox_item" ADD CONSTRAINT "inbox_item_placed_in_section_id_fkey" FOREIGN KEY ("placed_in_section_id") REFERENCES "section"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Check constraints (not expressible in schema.prisma)
ALTER TABLE "inbox_item" ADD CONSTRAINT "inbox_item_origin_check"
  CHECK ("origin" IN ('share', 'paste', 'typed', 'import', 'capture'));
ALTER TABLE "inbox_item" ADD CONSTRAINT "inbox_item_colour_check"
  CHECK ("colour" IN ('yellow', 'green', 'blue', 'pink'));
ALTER TABLE "inbox_item" ADD CONSTRAINT "inbox_item_ref_or_text_check"
  CHECK ("ref" IS NOT NULL OR "text" IS NOT NULL);
