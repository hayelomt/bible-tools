-- CreateTable
CREATE TABLE "question_entry" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "question_id" UUID NOT NULL,
    "lesson_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "section_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rev" BIGINT NOT NULL DEFAULT 0,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "question_entry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "link" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "from_section_id" UUID NOT NULL,
    "from_lesson_id" UUID NOT NULL,
    "target_type" TEXT NOT NULL,
    "target_id" UUID NOT NULL,

    CONSTRAINT "link_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "question_entry_user_id_rev_idx" ON "question_entry"("user_id", "rev");

-- CreateIndex
CREATE INDEX "question_entry_question_id_idx" ON "question_entry"("question_id");

-- CreateIndex
CREATE INDEX "link_user_id_target_id_idx" ON "link"("user_id", "target_id");

-- CreateIndex
CREATE INDEX "link_from_section_id_idx" ON "link"("from_section_id");

-- AddForeignKey
ALTER TABLE "question_entry" ADD CONSTRAINT "question_entry_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_entry" ADD CONSTRAINT "question_entry_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "question"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_entry" ADD CONSTRAINT "question_entry_lesson_id_fkey" FOREIGN KEY ("lesson_id") REFERENCES "lesson"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_entry" ADD CONSTRAINT "question_entry_section_id_fkey" FOREIGN KEY ("section_id") REFERENCES "section"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "link" ADD CONSTRAINT "link_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "link" ADD CONSTRAINT "link_from_section_id_fkey" FOREIGN KEY ("from_section_id") REFERENCES "section"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "link" ADD CONSTRAINT "link_from_lesson_id_fkey" FOREIGN KEY ("from_lesson_id") REFERENCES "lesson"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Check constraints (not expressible in schema.prisma)
ALTER TABLE "question_entry" ADD CONSTRAINT "question_entry_kind_check"
  CHECK ("kind" IN ('asked', 'revisited', 'partial', 'answered', 'reopened', 'parked'));
ALTER TABLE "link" ADD CONSTRAINT "link_target_type_check"
  CHECK ("target_type" IN ('lesson', 'section'));

-- Every question gets its thread (TECH-DESIGN §17.5): `asked` in its lesson when it was made;
-- `answered` once it has an answer section, when that section was made, so writing in the section
-- answers it as before; and `parked` for a parked one, when it was last changed. Deleted questions
-- get theirs too, so an Undo brings back a question with a thread. Each entry takes a new rev from
-- its user's sync_rev, in the order they happened, so every device pulls them.
WITH entries AS (
  SELECT q.user_id, q.id AS question_id, q.lesson_id, 'asked' AS kind, NULL::uuid AS section_id,
         q.created_at AS at, 1 AS step
  FROM "question" q
  UNION ALL
  SELECT q.user_id, q.id, q.lesson_id, 'answered', q.answer_section_id, s.created_at, 2
  FROM "question" q JOIN "section" s ON s.id = q.answer_section_id
  UNION ALL
  SELECT q.user_id, q.id, q.lesson_id, 'parked', NULL, q.updated_at, 3
  FROM "question" q WHERE q.status = 'parked'
),
numbered AS (
  SELECT e.*, u.sync_rev + row_number() OVER (
           PARTITION BY e.user_id ORDER BY e.at, e.question_id, e.step) AS new_rev
  FROM entries e JOIN "user" u ON u.id = e.user_id
)
INSERT INTO "question_entry"
  ("id", "user_id", "question_id", "lesson_id", "kind", "section_id",
   "created_at", "updated_at", "rev", "deleted_at")
SELECT uuidv7(), user_id, question_id, lesson_id, kind, section_id, at, at, new_rev, NULL
FROM numbered;

UPDATE "user" u SET "sync_rev" = m.rev
FROM (SELECT "user_id", max("rev") AS rev FROM "question_entry" GROUP BY "user_id") m
WHERE m.user_id = u.id;
