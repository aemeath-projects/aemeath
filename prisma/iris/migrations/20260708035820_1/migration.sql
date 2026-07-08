-- CreateEnum
CREATE TYPE "archive_status_enum" AS ENUM ('pending', 'exporting', 'uploading', 'uploaded', 'deleting', 'completed', 'failed');

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
    "sender_nickname" TEXT NOT NULL DEFAULT '',
    "sender_card" TEXT,
    "sender_role" TEXT,
    "stored_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "archive_log" (
    "id" UUID NOT NULL,
    "group_id" BIGINT,
    "seq" INTEGER NOT NULL DEFAULT 0,
    "period_start" TIMESTAMPTZ NOT NULL,
    "period_end" TIMESTAMPTZ NOT NULL,
    "total_rows" BIGINT NOT NULL DEFAULT 0,
    "original_bytes" BIGINT NOT NULL DEFAULT 0,
    "compressed_bytes" BIGINT NOT NULL DEFAULT 0,
    "s3_key" TEXT NOT NULL DEFAULT '',
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
CREATE INDEX "ix_archive_log_status" ON "archive_log"("status");

-- CreateIndex
CREATE INDEX "ix_archive_log_group_period" ON "archive_log"("group_id", "period_start");

-- CreateIndex
CREATE UNIQUE INDEX "archive_log_group_id_seq_key" ON "archive_log"("group_id", "seq");
