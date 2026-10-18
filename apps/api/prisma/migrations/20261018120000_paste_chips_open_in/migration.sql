-- AlterTable
ALTER TABLE "user_settings" ADD COLUMN     "open_in_targets" JSONB NOT NULL DEFAULT '["blueletterbible", "youversion", "biblehub", "logos"]',
ADD COLUMN     "paste_chips" BOOLEAN NOT NULL DEFAULT true;

-- A list of target keys; the app's schema checks each key.
ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_open_in_targets_check"
  CHECK (jsonb_typeof("open_in_targets") = 'array');
