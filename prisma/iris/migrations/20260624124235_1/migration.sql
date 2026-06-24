-- CreateEnum
CREATE TYPE "archive_status_enum" AS ENUM ('pending', 'exporting', 'uploading', 'uploaded', 'partition_dropped', 'completed', 'failed');

-- CreateTable
CREATE TABLE "chat_history" (
    "id" BIGSERIAL NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL,
    "message_id" BIGINT NOT NULL,
    "message_type" SMALLINT NOT NULL,
    "group_id" BIGINT,
    "user_id" BIGINT NOT NULL,
    "raw_message" TEXT NOT NULL DEFAULT '',
    "segments" JSONB NOT NULL,
    "sender_nickname" VARCHAR(64) NOT NULL DEFAULT '',
    "sender_card" VARCHAR(64),
    "sender_role" VARCHAR(10),
    "stored_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_history_pkey" PRIMARY KEY ("id","created_at")
);

-- CreateTable
CREATE TABLE "archived_message_index" (
    "id" BIGINT NOT NULL,
    "message_id" BIGINT NOT NULL,
    "group_id" BIGINT,
    "user_id" BIGINT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL,
    "sender_nickname" TEXT NOT NULL,
    "text_snippet" TEXT NOT NULL,
    "archive_ref" TEXT NOT NULL,

    CONSTRAINT "archived_message_index_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "archive_log" (
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

    CONSTRAINT "archive_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ix_chat_group_time" ON "chat_history"("group_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "ix_chat_user_time" ON "chat_history"("user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "ix_chat_message_id" ON "chat_history"("message_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "ix_chat_type_time" ON "chat_history"("message_type", "created_at" DESC);

-- CreateIndex
CREATE INDEX "archived_message_index_group_id_created_at_idx" ON "archived_message_index"("group_id", "created_at");

-- CreateIndex
CREATE INDEX "archived_message_index_user_id_created_at_idx" ON "archived_message_index"("user_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "archive_log_partition_name_key" ON "archive_log"("partition_name");

-- CreateIndex
CREATE INDEX "ix_archive_log_status" ON "archive_log"("status");

-- CreateIndex
CREATE INDEX "ix_archive_log_period" ON "archive_log"("period_start");
