-- "Show verse text in notes" is on for a new account (wireframes/verses.md).
ALTER TABLE "user_settings" ALTER COLUMN "auto_preview_verses" SET DEFAULT true;

-- What 20261015120000_bsb_default meant to do: its update compared with 'BSB' instead of 'WEB'.
UPDATE "user_settings" SET "default_translation" = 'BSB' WHERE "default_translation" = 'WEB';
