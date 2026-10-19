-- Read-only share links (F34, M13-01, §17.10): server only, like session. Only the token's
-- SHA-256 is stored; a frozen link keeps what it shows in snapshot.
-- CreateTable
CREATE TABLE "share_link" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "target_type" TEXT NOT NULL,
    "target_id" UUID,
    "passage" JSONB,
    "token_hash" TEXT NOT NULL,
    "live" BOOLEAN NOT NULL,
    "snapshot" JSONB,
    "expires_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_opened_at" TIMESTAMPTZ(3),
    "revoked_at" TIMESTAMPTZ(3),

    CONSTRAINT "share_link_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "share_link_token_hash_key" ON "share_link"("token_hash");

-- CreateIndex
CREATE INDEX "share_link_user_id_created_at_idx" ON "share_link"("user_id", "created_at");

-- AddForeignKey
ALTER TABLE "share_link" ADD CONSTRAINT "share_link_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "share_link" ADD CONSTRAINT "share_link_target_type_check"
  CHECK ("target_type" IN ('lesson', 'series', 'compile', 'handout'));

-- A compile view names a passage; everything else names its lesson or series.
ALTER TABLE "share_link" ADD CONSTRAINT "share_link_target_check"
  CHECK (CASE WHEN "target_type" = 'compile'
    THEN "passage" IS NOT NULL AND "target_id" IS NULL
    ELSE "passage" IS NULL AND "target_id" IS NOT NULL END);

-- A frozen link has what it shows; a live one renders the rows. Only a compile view chooses.
ALTER TABLE "share_link" ADD CONSTRAINT "share_link_snapshot_check"
  CHECK (("snapshot" IS NULL) = "live"
    AND ("target_type" = 'compile' OR "live" = ("target_type" <> 'handout')));
