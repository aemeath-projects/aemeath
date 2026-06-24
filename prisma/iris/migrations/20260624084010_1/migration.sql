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

-- CreateIndex
CREATE INDEX "archived_message_index_group_id_created_at_idx" ON "archived_message_index"("group_id", "created_at");

-- CreateIndex
CREATE INDEX "archived_message_index_user_id_created_at_idx" ON "archived_message_index"("user_id", "created_at");
