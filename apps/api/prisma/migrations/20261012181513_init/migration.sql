-- citext (case-insensitive text) for user.email and tag.name. Trusted extension: the database
-- owner can create it without superuser rights.
CREATE EXTENSION IF NOT EXISTS citext;

-- CreateTable
CREATE TABLE "user" (
    "id" UUID NOT NULL,
    "email" CITEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "email_verified_at" TIMESTAMPTZ(3),
    "role" TEXT NOT NULL DEFAULT 'user',
    "sync_rev" BIGINT NOT NULL DEFAULT 0,
    "disabled_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "user_agent" TEXT,

    CONSTRAINT "session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_token" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "used_at" TIMESTAMPTZ(3),

    CONSTRAINT "email_token_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_settings" (
    "user_id" UUID NOT NULL,
    "theme_preset" TEXT NOT NULL DEFAULT 'parchment',
    "color_mode" TEXT NOT NULL DEFAULT 'system',
    "default_translation" TEXT NOT NULL DEFAULT 'WEB',
    "review_window_days" INTEGER NOT NULL DEFAULT 14,
    "rev" BIGINT NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_settings_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "series" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "kind" TEXT NOT NULL DEFAULT 'custom',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rev" BIGINT NOT NULL DEFAULT 0,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "series_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lesson" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "series_id" UUID,
    "title" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'sermon',
    "speaker" TEXT,
    "church" TEXT,
    "main_passages" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rev" BIGINT NOT NULL DEFAULT 0,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "lesson_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "section" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "lesson_id" UUID NOT NULL,
    "parent_id" UUID,
    "order_key" TEXT COLLATE "C" NOT NULL,
    "body" JSONB NOT NULL,
    "conflict_of" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rev" BIGINT NOT NULL DEFAULT 0,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "section_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tag" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "name" CITEXT NOT NULL,
    "is_seeded" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rev" BIGINT NOT NULL DEFAULT 0,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "tag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "section_tag" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "tag_id" UUID NOT NULL,
    "section_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rev" BIGINT NOT NULL DEFAULT 0,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "section_tag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lesson_tag" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "tag_id" UUID NOT NULL,
    "lesson_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rev" BIGINT NOT NULL DEFAULT 0,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "lesson_tag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "takeaway" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "lesson_id" UUID NOT NULL,
    "text" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rev" BIGINT NOT NULL DEFAULT 0,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "takeaway_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "question" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "lesson_id" UUID NOT NULL,
    "text" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "answer_section_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rev" BIGINT NOT NULL DEFAULT 0,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "question_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "highlight" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "ref" JSONB NOT NULL,
    "colour" TEXT NOT NULL,
    "note" TEXT,
    "promoted_section_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rev" BIGINT NOT NULL DEFAULT 0,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "highlight_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "memory_item" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "ref" JSONB NOT NULL,
    "ease" DOUBLE PRECISION NOT NULL DEFAULT 2.5,
    "interval" INTEGER NOT NULL DEFAULT 0,
    "next_review_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "review_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rev" BIGINT NOT NULL DEFAULT 0,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "memory_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "citation" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "source_type" TEXT NOT NULL,
    "source_id" UUID NOT NULL,
    "lesson_id" UUID,
    "book" TEXT NOT NULL,
    "start_ord" INTEGER NOT NULL,
    "end_ord" INTEGER NOT NULL,

    CONSTRAINT "citation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sync_change" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "device_id" UUID NOT NULL,
    "received_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL,
    "error" JSONB,
    "result_rev" BIGINT,

    CONSTRAINT "sync_change_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "device" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "client_version" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_sync_at" TIMESTAMPTZ(3),

    CONSTRAINT "device_pkey" PRIMARY KEY ("user_id","id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_email_key" ON "user"("email");

-- CreateIndex
CREATE UNIQUE INDEX "session_token_hash_key" ON "session"("token_hash");

-- CreateIndex
CREATE INDEX "session_user_id_idx" ON "session"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "email_token_token_hash_key" ON "email_token"("token_hash");

-- CreateIndex
CREATE INDEX "email_token_user_id_idx" ON "email_token"("user_id");

-- CreateIndex
CREATE INDEX "series_user_id_rev_idx" ON "series"("user_id", "rev");

-- CreateIndex
CREATE INDEX "lesson_user_id_rev_idx" ON "lesson"("user_id", "rev");

-- CreateIndex
CREATE INDEX "lesson_series_id_idx" ON "lesson"("series_id");

-- CreateIndex
CREATE INDEX "section_user_id_rev_idx" ON "section"("user_id", "rev");

-- CreateIndex
CREATE INDEX "section_lesson_id_parent_id_order_key_idx" ON "section"("lesson_id", "parent_id", "order_key");

-- CreateIndex
CREATE INDEX "tag_user_id_rev_idx" ON "tag"("user_id", "rev");

-- CreateIndex
CREATE INDEX "section_tag_user_id_rev_idx" ON "section_tag"("user_id", "rev");

-- CreateIndex
CREATE INDEX "section_tag_tag_id_idx" ON "section_tag"("tag_id");

-- CreateIndex
CREATE INDEX "lesson_tag_user_id_rev_idx" ON "lesson_tag"("user_id", "rev");

-- CreateIndex
CREATE INDEX "lesson_tag_tag_id_idx" ON "lesson_tag"("tag_id");

-- CreateIndex
CREATE INDEX "takeaway_user_id_rev_idx" ON "takeaway"("user_id", "rev");

-- CreateIndex
CREATE INDEX "takeaway_lesson_id_idx" ON "takeaway"("lesson_id");

-- CreateIndex
CREATE INDEX "question_user_id_rev_idx" ON "question"("user_id", "rev");

-- CreateIndex
CREATE INDEX "question_lesson_id_idx" ON "question"("lesson_id");

-- CreateIndex
CREATE INDEX "highlight_user_id_rev_idx" ON "highlight"("user_id", "rev");

-- CreateIndex
CREATE INDEX "memory_item_user_id_rev_idx" ON "memory_item"("user_id", "rev");

-- CreateIndex
CREATE INDEX "memory_item_user_id_next_review_at_idx" ON "memory_item"("user_id", "next_review_at");

-- CreateIndex
CREATE INDEX "citation_user_id_start_ord_end_ord_idx" ON "citation"("user_id", "start_ord", "end_ord");

-- CreateIndex
CREATE INDEX "citation_source_type_source_id_idx" ON "citation"("source_type", "source_id");

-- CreateIndex
CREATE INDEX "sync_change_user_id_received_at_idx" ON "sync_change"("user_id", "received_at");

-- AddForeignKey
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_token" ADD CONSTRAINT "email_token_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "series" ADD CONSTRAINT "series_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson" ADD CONSTRAINT "lesson_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson" ADD CONSTRAINT "lesson_series_id_fkey" FOREIGN KEY ("series_id") REFERENCES "series"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "section" ADD CONSTRAINT "section_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "section" ADD CONSTRAINT "section_lesson_id_fkey" FOREIGN KEY ("lesson_id") REFERENCES "lesson"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "section" ADD CONSTRAINT "section_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "section"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "section" ADD CONSTRAINT "section_conflict_of_fkey" FOREIGN KEY ("conflict_of") REFERENCES "section"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tag" ADD CONSTRAINT "tag_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "section_tag" ADD CONSTRAINT "section_tag_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "section_tag" ADD CONSTRAINT "section_tag_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "section_tag" ADD CONSTRAINT "section_tag_section_id_fkey" FOREIGN KEY ("section_id") REFERENCES "section"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_tag" ADD CONSTRAINT "lesson_tag_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_tag" ADD CONSTRAINT "lesson_tag_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_tag" ADD CONSTRAINT "lesson_tag_lesson_id_fkey" FOREIGN KEY ("lesson_id") REFERENCES "lesson"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "takeaway" ADD CONSTRAINT "takeaway_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "takeaway" ADD CONSTRAINT "takeaway_lesson_id_fkey" FOREIGN KEY ("lesson_id") REFERENCES "lesson"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question" ADD CONSTRAINT "question_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question" ADD CONSTRAINT "question_lesson_id_fkey" FOREIGN KEY ("lesson_id") REFERENCES "lesson"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question" ADD CONSTRAINT "question_answer_section_id_fkey" FOREIGN KEY ("answer_section_id") REFERENCES "section"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "highlight" ADD CONSTRAINT "highlight_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "highlight" ADD CONSTRAINT "highlight_promoted_section_id_fkey" FOREIGN KEY ("promoted_section_id") REFERENCES "section"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memory_item" ADD CONSTRAINT "memory_item_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "citation" ADD CONSTRAINT "citation_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "citation" ADD CONSTRAINT "citation_lesson_id_fkey" FOREIGN KEY ("lesson_id") REFERENCES "lesson"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sync_change" ADD CONSTRAINT "sync_change_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device" ADD CONSTRAINT "device_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Raw SQL that Prisma can't express (TECH-DESIGN §5.3) ---------------------------------------

-- Fractional order keys compare byte by byte, so order_key above uses the "C" collation.

-- Uniqueness among non-deleted rows: a deleted tag's name can be reused, and a tag can be
-- re-added to a section or lesson after it was removed.
CREATE UNIQUE INDEX "tag_user_id_name_live_key" ON "tag"("user_id", "name") WHERE "deleted_at" IS NULL;
CREATE UNIQUE INDEX "section_tag_section_id_tag_id_live_key" ON "section_tag"("section_id", "tag_id") WHERE "deleted_at" IS NULL;
CREATE UNIQUE INDEX "lesson_tag_lesson_id_tag_id_live_key" ON "lesson_tag"("lesson_id", "tag_id") WHERE "deleted_at" IS NULL;

-- Enum-like text columns. The values match the Zod schemas in packages/domain.
ALTER TABLE "user" ADD CONSTRAINT "user_role_check" CHECK ("role" IN ('user', 'admin'));
ALTER TABLE "email_token" ADD CONSTRAINT "email_token_kind_check" CHECK ("kind" IN ('verify', 'reset'));
ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_theme_preset_check"
  CHECK ("theme_preset" IN ('parchment', 'vellum', 'olive', 'slate', 'cedar', 'midnight'));
ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_color_mode_check"
  CHECK ("color_mode" IN ('light', 'dark', 'system'));
ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_review_window_days_check"
  CHECK ("review_window_days" BETWEEN 1 AND 365);
ALTER TABLE "series" ADD CONSTRAINT "series_kind_check" CHECK ("kind" IN ('sermon_series', 'book_study', 'custom'));
ALTER TABLE "lesson" ADD CONSTRAINT "lesson_source_check" CHECK ("source" IN ('sermon', 'personal', 'group'));
ALTER TABLE "lesson" ADD CONSTRAINT "lesson_main_passages_check" CHECK (jsonb_typeof("main_passages") = 'array');
ALTER TABLE "question" ADD CONSTRAINT "question_status_check" CHECK ("status" IN ('open', 'answered', 'parked'));
ALTER TABLE "highlight" ADD CONSTRAINT "highlight_colour_check" CHECK ("colour" IN ('yellow', 'green', 'blue', 'pink'));
ALTER TABLE "citation" ADD CONSTRAINT "citation_source_type_check"
  CHECK ("source_type" IN ('lesson', 'section', 'highlight', 'memory_item'));
ALTER TABLE "citation" ADD CONSTRAINT "citation_ord_check" CHECK ("start_ord" <= "end_ord");
ALTER TABLE "sync_change" ADD CONSTRAINT "sync_change_status_check" CHECK ("status" IN ('applied', 'conflict', 'rejected'));
