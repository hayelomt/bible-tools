-- A question split from another (F24, M10-10) names it: "Split from … on …".
-- AlterTable
ALTER TABLE "question" ADD COLUMN "split_from_id" UUID;

-- AddForeignKey
ALTER TABLE "question" ADD CONSTRAINT "question_split_from_id_fkey" FOREIGN KEY ("split_from_id") REFERENCES "question"("id") ON DELETE SET NULL ON UPDATE CASCADE;
