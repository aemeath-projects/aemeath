-- CreateEnum
CREATE TYPE "user_relation_enum" AS ENUM ('stranger', 'group_member', 'friend', 'admin');

-- CreateEnum
CREATE TYPE "group_role_enum" AS ENUM ('owner', 'admin', 'member');

-- CreateEnum
CREATE TYPE "feedback_type_enum" AS ENUM ('bug', 'suggestion', 'complaint', 'other');

-- CreateEnum
CREATE TYPE "feedback_status_enum" AS ENUM ('pending', 'done');

-- CreateEnum
CREATE TYPE "feedback_source_enum" AS ENUM ('group', 'private');

-- CreateEnum
CREATE TYPE "likesource" AS ENUM ('manual', 'scheduled');

-- CreateEnum
CREATE TYPE "archive_status_enum" AS ENUM ('pending', 'exporting', 'uploading', 'uploaded', 'partition_dropped', 'completed', 'failed');

-- CreateTable
CREATE TABLE "users" (
    "qq" BIGINT NOT NULL,
    "nickname" VARCHAR(64) NOT NULL DEFAULT '',
    "relation" "user_relation_enum" NOT NULL DEFAULT 'stranger',
    "last_synced" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("qq")
);

-- CreateTable
CREATE TABLE "groups" (
    "group_id" BIGINT NOT NULL,
    "group_name" VARCHAR(128) NOT NULL DEFAULT '',
    "member_count" INTEGER NOT NULL DEFAULT 0,
    "max_member_count" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "bot_enabled" BOOLEAN NOT NULL DEFAULT true,
    "last_synced" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "groups_pkey" PRIMARY KEY ("group_id")
);

-- CreateTable
CREATE TABLE "group_memberships" (
    "id" UUID NOT NULL,
    "user_id" BIGINT NOT NULL,
    "group_id" BIGINT NOT NULL,
    "card" VARCHAR(64) NOT NULL DEFAULT '',
    "role" "group_role_enum" NOT NULL DEFAULT 'member',
    "join_time" BIGINT NOT NULL DEFAULT 0,
    "last_active_time" BIGINT NOT NULL DEFAULT 0,
    "title" VARCHAR(64) NOT NULL DEFAULT '',
    "title_expire_time" BIGINT NOT NULL DEFAULT 0,
    "level" VARCHAR(10) NOT NULL DEFAULT '',
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "group_memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "llm_providers" (
    "id" UUID NOT NULL,
    "name" VARCHAR(64) NOT NULL,
    "api_base" VARCHAR(512) NOT NULL,
    "api_key" VARCHAR(512) NOT NULL,
    "max_retries" INTEGER NOT NULL DEFAULT 2,
    "timeout" INTEGER NOT NULL DEFAULT 60,
    "retry_interval" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "llm_providers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "llm_models" (
    "id" UUID NOT NULL,
    "provider_id" UUID NOT NULL,
    "model_name" VARCHAR(128) NOT NULL,
    "display_name" VARCHAR(128),
    "input_price" DECIMAL(12,6) NOT NULL DEFAULT 0,
    "output_price" DECIMAL(12,6) NOT NULL DEFAULT 0,
    "temperature" DOUBLE PRECISION NOT NULL DEFAULT 0.7,
    "max_tokens" INTEGER,
    "force_stream" BOOLEAN NOT NULL DEFAULT false,
    "extra_params" JSONB NOT NULL DEFAULT '{}',
    "is_enabled" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "llm_models_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feedbacks" (
    "id" UUID NOT NULL,
    "user_id" BIGINT NOT NULL,
    "feedback_type" "feedback_type_enum",
    "content" TEXT NOT NULL,
    "status" "feedback_status_enum" NOT NULL DEFAULT 'pending',
    "admin_reply" TEXT,
    "source" "feedback_source_enum" NOT NULL,
    "group_id" BIGINT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMPTZ,

    CONSTRAINT "feedbacks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "checkin" (
    "id" SERIAL NOT NULL,
    "group_id" BIGINT NOT NULL,
    "user_id" BIGINT NOT NULL,
    "checkin_date" DATE NOT NULL,
    "checkin_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "checkin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "jrlp" (
    "id" SERIAL NOT NULL,
    "group_id" BIGINT NOT NULL,
    "user_id" BIGINT NOT NULL,
    "wife_qq" BIGINT NOT NULL,
    "date" DATE NOT NULL,
    "drawn_at" TIMESTAMPTZ,

    CONSTRAINT "jrlp_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "like_tasks" (
    "id" SERIAL NOT NULL,
    "qq" BIGINT NOT NULL,
    "registered_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "registered_group_id" BIGINT,

    CONSTRAINT "like_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "like_history" (
    "id" SERIAL NOT NULL,
    "qq" BIGINT NOT NULL,
    "times" SMALLINT NOT NULL,
    "triggered_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source" "likesource" NOT NULL,
    "success" BOOLEAN NOT NULL,

    CONSTRAINT "like_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "drift_bottle_pools" (
    "id" INTEGER NOT NULL,
    "name" VARCHAR(64) NOT NULL,

    CONSTRAINT "drift_bottle_pools_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "drift_bottle_group_pools" (
    "group_id" BIGINT NOT NULL,
    "pool_id" INTEGER NOT NULL,

    CONSTRAINT "drift_bottle_group_pools_pkey" PRIMARY KEY ("group_id")
);

-- CreateTable
CREATE TABLE "drift_bottle_items" (
    "id" SERIAL NOT NULL,
    "pool_id" INTEGER NOT NULL,
    "sender_id" BIGINT NOT NULL,
    "sender_group_id" BIGINT NOT NULL,
    "content" JSONB NOT NULL,
    "is_picked" BOOLEAN NOT NULL DEFAULT false,
    "picked_by" BIGINT,
    "picked_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "drift_bottle_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permission_group" (
    "id" UUID NOT NULL,
    "group_id" BIGINT NOT NULL,
    "feature_name" VARCHAR(64) NOT NULL,
    "enabled" BOOLEAN NOT NULL,

    CONSTRAINT "permission_group_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permission_private" (
    "id" UUID NOT NULL,
    "feature_name" VARCHAR(64) NOT NULL,
    "user_qq" BIGINT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "permission_private_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_archive_log" (
    "id" UUID NOT NULL,
    "partition_name" VARCHAR(64) NOT NULL,
    "period_start" DATE NOT NULL,
    "period_end" DATE NOT NULL,
    "total_rows" BIGINT NOT NULL DEFAULT 0,
    "original_bytes" BIGINT NOT NULL DEFAULT 0,
    "compressed_bytes" BIGINT NOT NULL DEFAULT 0,
    "s3_bucket" VARCHAR(128) NOT NULL DEFAULT '',
    "s3_key" VARCHAR(512) NOT NULL DEFAULT '',
    "s3_sha256" VARCHAR(64) NOT NULL DEFAULT '',
    "status" "archive_status_enum" NOT NULL DEFAULT 'pending',
    "error_message" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ,

    CONSTRAINT "chat_archive_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "groups_is_active_idx" ON "groups"("is_active");

-- CreateIndex
CREATE INDEX "group_memberships_user_id_idx" ON "group_memberships"("user_id");

-- CreateIndex
CREATE INDEX "group_memberships_group_id_idx" ON "group_memberships"("group_id");

-- CreateIndex
CREATE INDEX "group_memberships_is_active_idx" ON "group_memberships"("is_active");

-- CreateIndex
CREATE UNIQUE INDEX "uq_user_group" ON "group_memberships"("user_id", "group_id");

-- CreateIndex
CREATE UNIQUE INDEX "llm_providers_name_key" ON "llm_providers"("name");

-- CreateIndex
CREATE INDEX "llm_models_provider_id_idx" ON "llm_models"("provider_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_provider_model" ON "llm_models"("provider_id", "model_name");

-- CreateIndex
CREATE INDEX "feedbacks_user_id_idx" ON "feedbacks"("user_id");

-- CreateIndex
CREATE INDEX "feedbacks_feedback_type_idx" ON "feedbacks"("feedback_type");

-- CreateIndex
CREATE INDEX "feedbacks_status_idx" ON "feedbacks"("status");

-- CreateIndex
CREATE INDEX "feedbacks_group_id_idx" ON "feedbacks"("group_id");

-- CreateIndex
CREATE INDEX "checkin_group_id_idx" ON "checkin"("group_id");

-- CreateIndex
CREATE INDEX "checkin_checkin_date_idx" ON "checkin"("checkin_date");

-- CreateIndex
CREATE INDEX "idx_checkin_user_group" ON "checkin"("user_id", "group_id", "checkin_date");

-- CreateIndex
CREATE UNIQUE INDEX "uq_checkin_group_user_date" ON "checkin"("group_id", "user_id", "checkin_date");

-- CreateIndex
CREATE INDEX "jrlp_group_id_idx" ON "jrlp"("group_id");

-- CreateIndex
CREATE INDEX "jrlp_user_id_idx" ON "jrlp"("user_id");

-- CreateIndex
CREATE INDEX "jrlp_date_idx" ON "jrlp"("date");

-- CreateIndex
CREATE UNIQUE INDEX "uq_jrlp_group_user_date" ON "jrlp"("group_id", "user_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "like_tasks_qq_key" ON "like_tasks"("qq");

-- CreateIndex
CREATE INDEX "ix_like_history_qq_triggered_at" ON "like_history"("qq", "triggered_at");

-- CreateIndex
CREATE INDEX "ix_like_history_source_triggered_at" ON "like_history"("source", "triggered_at");

-- CreateIndex
CREATE UNIQUE INDEX "drift_bottle_pools_name_key" ON "drift_bottle_pools"("name");

-- CreateIndex
CREATE INDEX "ix_drift_bottle_items_pool_is_picked" ON "drift_bottle_items"("pool_id", "is_picked");

-- CreateIndex
CREATE INDEX "drift_bottle_items_sender_id_idx" ON "drift_bottle_items"("sender_id");

-- CreateIndex
CREATE INDEX "permission_group_group_id_idx" ON "permission_group"("group_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_group_feature" ON "permission_group"("group_id", "feature_name");

-- CreateIndex
CREATE INDEX "ix_permission_private_feature_name" ON "permission_private"("feature_name");

-- CreateIndex
CREATE UNIQUE INDEX "uq_private_feature_user" ON "permission_private"("feature_name", "user_qq");

-- CreateIndex
CREATE UNIQUE INDEX "chat_archive_log_partition_name_key" ON "chat_archive_log"("partition_name");

-- CreateIndex
CREATE INDEX "ix_archive_log_status" ON "chat_archive_log"("status");

-- CreateIndex
CREATE INDEX "ix_archive_log_period" ON "chat_archive_log"("period_start");

-- AddForeignKey
ALTER TABLE "group_memberships" ADD CONSTRAINT "group_memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("qq") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_memberships" ADD CONSTRAINT "group_memberships_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("group_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "llm_models" ADD CONSTRAINT "llm_models_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "llm_providers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feedbacks" ADD CONSTRAINT "feedbacks_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("qq") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feedbacks" ADD CONSTRAINT "feedbacks_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("group_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checkin" ADD CONSTRAINT "checkin_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("group_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checkin" ADD CONSTRAINT "checkin_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("qq") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jrlp" ADD CONSTRAINT "jrlp_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("group_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jrlp" ADD CONSTRAINT "jrlp_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("qq") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jrlp" ADD CONSTRAINT "jrlp_wife_qq_fkey" FOREIGN KEY ("wife_qq") REFERENCES "users"("qq") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drift_bottle_group_pools" ADD CONSTRAINT "drift_bottle_group_pools_pool_id_fkey" FOREIGN KEY ("pool_id") REFERENCES "drift_bottle_pools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drift_bottle_items" ADD CONSTRAINT "drift_bottle_items_pool_id_fkey" FOREIGN KEY ("pool_id") REFERENCES "drift_bottle_pools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "permission_private" ADD CONSTRAINT "permission_private_user_qq_fkey" FOREIGN KEY ("user_qq") REFERENCES "users"("qq") ON DELETE CASCADE ON UPDATE CASCADE;
