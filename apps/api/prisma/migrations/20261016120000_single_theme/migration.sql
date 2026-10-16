-- One theme (Lamplight): the preset and look choices are gone; only the colour mode remains.
ALTER TABLE "user_settings" DROP CONSTRAINT "user_settings_theme_preset_check";
ALTER TABLE "user_settings" DROP COLUMN "theme_preset",
DROP COLUMN "look";
