-- The user's own study-method templates (F25, M10-13); the built-ins are code.
-- CreateTable
CREATE TABLE "template" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "structure" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rev" BIGINT NOT NULL DEFAULT 0,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "template_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "template_user_id_rev_idx" ON "template"("user_id", "rev");

-- AddForeignKey
ALTER TABLE "template" ADD CONSTRAINT "template_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- A list of sections; the app's schema checks each one.
ALTER TABLE "template" ADD CONSTRAINT "template_structure_check"
  CHECK (jsonb_typeof("structure") = 'array');

-- The template each kind of new lesson starts with (M10-14).
-- AlterTable
ALTER TABLE "user_settings" ADD COLUMN "default_templates" JSONB NOT NULL DEFAULT '{"sermon": null, "personal": null, "group": null}';

ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_default_templates_check"
  CHECK (jsonb_typeof("default_templates") = 'object');

-- A lesson's source is its kind (§17.7, decision 60). `source` stays, unwritten, for a release.
-- AlterTable
ALTER TABLE "lesson" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'sermon';
UPDATE "lesson" SET "kind" = "source";
ALTER TABLE "lesson" ADD CONSTRAINT "lesson_kind_check" CHECK ("kind" IN ('sermon', 'personal', 'group'));
