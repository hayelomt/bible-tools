-- The Berean Standard Bible replaces the World English Bible as the default translation; the KJV
-- is the other one (TECH-DESIGN §9).
ALTER TABLE "user_settings" ALTER COLUMN "default_translation" SET DEFAULT 'BSB';

UPDATE "user_settings" SET "default_translation" = 'BSB' WHERE "default_translation" = 'BSB';
