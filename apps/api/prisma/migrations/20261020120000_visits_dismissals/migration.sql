-- Which resurfacing rules feed the review queue (F30, M12-01), and the last quarter a digest was
-- drafted for (F32, M12-08), once per account.
-- AlterTable
ALTER TABLE "user_settings" ADD COLUMN "last_digest_quarter" TEXT,
ADD COLUMN "resurfacing" JSONB NOT NULL DEFAULT '{"yearAgo": true, "repeatedVerse": true, "staleQuestion": true}';

ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_resurfacing_check"
  CHECK (jsonb_typeof("resurfacing") = 'object');

ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_last_digest_quarter_check"
  CHECK ("last_digest_quarter" ~ '^\d{4}-Q[1-4]$');

-- Compile view visits (F30, M12-02, §17.8): append-only, a new one deletes its scope's older ones.
-- CreateTable
CREATE TABLE "passage_visit" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "book" TEXT NOT NULL,
    "start_ord" INTEGER NOT NULL,
    "end_ord" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rev" BIGINT NOT NULL DEFAULT 0,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "passage_visit_pkey" PRIMARY KEY ("id")
);

-- Resurfaced items dismissed for a year (F30, M12-02, §17.8); never edited.
-- CreateTable
CREATE TABLE "resurface_dismissal" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "rule" TEXT NOT NULL,
    "target_key" TEXT NOT NULL,
    "until" DATE NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rev" BIGINT NOT NULL DEFAULT 0,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "resurface_dismissal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "passage_visit_user_id_rev_idx" ON "passage_visit"("user_id", "rev");

-- CreateIndex
CREATE INDEX "passage_visit_user_id_start_ord_end_ord_idx" ON "passage_visit"("user_id", "start_ord", "end_ord");

-- CreateIndex
CREATE INDEX "resurface_dismissal_user_id_rev_idx" ON "resurface_dismissal"("user_id", "rev");

-- AddForeignKey
ALTER TABLE "passage_visit" ADD CONSTRAINT "passage_visit_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resurface_dismissal" ADD CONSTRAINT "resurface_dismissal_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "resurface_dismissal" ADD CONSTRAINT "resurface_dismissal_rule_check"
  CHECK ("rule" IN ('year_ago', 'repeated_verse', 'stale_question'));
