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

-- CreateIndex
CREATE INDEX "ix_chat_group_time" ON "chat_history"("group_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "ix_chat_user_time" ON "chat_history"("user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "ix_chat_message_id" ON "chat_history"("message_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "ix_chat_type_time" ON "chat_history"("message_type", "created_at" DESC);
