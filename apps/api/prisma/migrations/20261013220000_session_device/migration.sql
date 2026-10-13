-- A session belongs to the device it syncs from, so a device can be signed out (§6.6).
ALTER TABLE "session" ADD COLUMN "device_id" UUID;

DROP INDEX "session_user_id_idx";

CREATE INDEX "session_user_id_device_id_idx" ON "session"("user_id", "device_id");
