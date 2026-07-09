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
CREATE TYPE "like_source" AS ENUM ('manual', 'scheduled');

-- CreateEnum
CREATE TYPE "llm_provider_type_enum" AS ENUM ('openai', 'anthropic', 'gemini');

-- CreateEnum
CREATE TYPE "setting_type" AS ENUM ('boolean', 'number', 'string', 'enum');

-- CreateTable
CREATE TABLE "users" (
    "qq" TEXT NOT NULL,
    "nickname" TEXT NOT NULL DEFAULT '',
    "relation" "user_relation_enum" NOT NULL DEFAULT 'stranger',
    "last_synced" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("qq")
);

-- CreateTable
CREATE TABLE "groups" (
    "group_id" TEXT NOT NULL,
    "group_name" TEXT NOT NULL DEFAULT '',
    "member_count" INTEGER NOT NULL DEFAULT 0,
    "max_member_count" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_synced" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "groups_pkey" PRIMARY KEY ("group_id")
);

-- CreateTable
CREATE TABLE "group_memberships" (
    "id" UUID NOT NULL,
    "user_id" TEXT NOT NULL,
    "group_id" TEXT NOT NULL,
    "card" TEXT NOT NULL DEFAULT '',
    "role" "group_role_enum" NOT NULL DEFAULT 'member',
    "join_time" BIGINT NOT NULL DEFAULT 0,
    "last_active_time" BIGINT NOT NULL DEFAULT 0,
    "title" TEXT NOT NULL DEFAULT '',
    "title_expire_time" BIGINT NOT NULL DEFAULT 0,
    "level" TEXT NOT NULL DEFAULT '',
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "group_memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "llm_providers" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "type" "llm_provider_type_enum" NOT NULL,
    "api_base" TEXT NOT NULL,
    "api_key" TEXT NOT NULL,
    "max_retries" INTEGER NOT NULL DEFAULT 2,
    "timeout" INTEGER NOT NULL DEFAULT 60,
    "retry_interval" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "llm_providers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "llm_models" (
    "id" UUID NOT NULL,
    "provider_id" UUID NOT NULL,
    "model_name" TEXT NOT NULL,
    "display_name" TEXT,
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
    "user_id" TEXT NOT NULL,
    "feedback_type" "feedback_type_enum",
    "content" TEXT NOT NULL,
    "status" "feedback_status_enum" NOT NULL DEFAULT 'pending',
    "admin_reply" TEXT,
    "source" "feedback_source_enum" NOT NULL,
    "group_id" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMPTZ,

    CONSTRAINT "feedbacks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mailbox" (
    "id" UUID NOT NULL,
    "recipient_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "read_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mailbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "checkin" (
    "id" UUID NOT NULL,
    "group_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "checkin_date" DATE NOT NULL,
    "checkin_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "checkin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "jrlp" (
    "id" UUID NOT NULL,
    "group_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "wife_qq" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "drawn_at" TIMESTAMPTZ,

    CONSTRAINT "jrlp_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "like_tasks" (
    "id" UUID NOT NULL,
    "qq" TEXT NOT NULL,
    "registered_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "registered_group_id" TEXT,

    CONSTRAINT "like_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "like_history" (
    "id" UUID NOT NULL,
    "qq" TEXT NOT NULL,
    "times" SMALLINT NOT NULL,
    "triggered_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source" "like_source" NOT NULL,
    "success" BOOLEAN NOT NULL,

    CONSTRAINT "like_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "drift_bottle_pools" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "drift_bottle_pools_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "drift_bottle_group_pools" (
    "group_id" TEXT NOT NULL,
    "pool_id" UUID NOT NULL,

    CONSTRAINT "drift_bottle_group_pools_pkey" PRIMARY KEY ("group_id")
);

-- CreateTable
CREATE TABLE "drift_bottles" (
    "id" UUID NOT NULL,
    "pool_id" UUID NOT NULL,
    "sender_id" TEXT NOT NULL,
    "sender_group_id" TEXT NOT NULL,
    "content" JSONB NOT NULL,
    "is_picked" BOOLEAN NOT NULL DEFAULT false,
    "picked_by" TEXT,
    "picked_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "drift_bottles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settings" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "value_type" "setting_type" NOT NULL,

    CONSTRAINT "settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounts" (
    "qq" TEXT NOT NULL,
    "nickname" TEXT,
    "role" TEXT NOT NULL,
    "transport" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "token" TEXT,
    "is_enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("qq")
);

-- CreateIndex
CREATE INDEX "users_relation_idx" ON "users"("relation");

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
CREATE INDEX "mailbox_recipient_id_is_read_idx" ON "mailbox"("recipient_id", "is_read");

-- CreateIndex
CREATE INDEX "mailbox_recipient_id_created_at_idx" ON "mailbox"("recipient_id", "created_at");

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
CREATE INDEX "ix_drift_bottles_pool_is_picked" ON "drift_bottles"("pool_id", "is_picked");

-- CreateIndex
CREATE INDEX "drift_bottles_sender_id_idx" ON "drift_bottles"("sender_id");

-- CreateIndex
CREATE INDEX "settings_scope_key_idx" ON "settings"("scope", "key");

-- CreateIndex
CREATE UNIQUE INDEX "settings_key_scope_key" ON "settings"("key", "scope");

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
ALTER TABLE "mailbox" ADD CONSTRAINT "mailbox_recipient_id_fkey" FOREIGN KEY ("recipient_id") REFERENCES "users"("qq") ON DELETE CASCADE ON UPDATE CASCADE;

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
ALTER TABLE "drift_bottles" ADD CONSTRAINT "drift_bottles_pool_id_fkey" FOREIGN KEY ("pool_id") REFERENCES "drift_bottle_pools"("id") ON DELETE CASCADE ON UPDATE CASCADE;
