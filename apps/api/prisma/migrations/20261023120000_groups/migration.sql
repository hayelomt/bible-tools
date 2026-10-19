-- Groups (F35, M13-07, §17.12): server only, like share_link. Members read each other through
-- group_feed at the group's own revision; private rows never enter it.
-- CreateTable
CREATE TABLE "group" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "sync_rev" BIGINT NOT NULL DEFAULT 0,
    "invite_version" INTEGER NOT NULL DEFAULT 1,
    "invite_token_hash" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "group_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "group_member" (
    "id" UUID NOT NULL,
    "group_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "joined_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "group_member_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "group_series" (
    "id" UUID NOT NULL,
    "group_id" UUID NOT NULL,
    "series_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "group_series_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "group_feed" (
    "group_id" UUID NOT NULL,
    "entity" TEXT NOT NULL,
    "entity_id" UUID NOT NULL,
    "rev" BIGINT NOT NULL,
    "gone" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "group_feed_pkey" PRIMARY KEY ("group_id","entity","entity_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "group_invite_token_hash_key" ON "group"("invite_token_hash");

-- CreateIndex
CREATE INDEX "group_member_user_id_idx" ON "group_member"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "group_member_group_id_user_id_key" ON "group_member"("group_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "group_series_series_id_key" ON "group_series"("series_id");

-- CreateIndex
CREATE INDEX "group_series_group_id_idx" ON "group_series"("group_id");

-- CreateIndex
CREATE INDEX "group_feed_group_id_rev_idx" ON "group_feed"("group_id", "rev");

-- CreateIndex
CREATE INDEX "group_feed_entity_entity_id_idx" ON "group_feed"("entity", "entity_id");

-- AddForeignKey
ALTER TABLE "group_member" ADD CONSTRAINT "group_member_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_member" ADD CONSTRAINT "group_member_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_series" ADD CONSTRAINT "group_series_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_series" ADD CONSTRAINT "group_series_series_id_fkey" FOREIGN KEY ("series_id") REFERENCES "series"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_feed" ADD CONSTRAINT "group_feed_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "group"("id") ON DELETE CASCADE ON UPDATE CASCADE;


ALTER TABLE "group_member" ADD CONSTRAINT "group_member_role_check"
  CHECK ("role" IN ('owner', 'member'));

-- One owner per group.
CREATE UNIQUE INDEX "group_member_one_owner" ON "group_member"("group_id") WHERE "role" = 'owner';

ALTER TABLE "group_feed" ADD CONSTRAINT "group_feed_entity_check"
  CHECK ("entity" IN ('group', 'member', 'series', 'lesson'));
