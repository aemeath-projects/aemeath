/*
  Warnings:

  - You are about to drop the column `input_price` on the `llm_models` table. All the data in the column will be lost.
  - You are about to drop the column `is_enabled` on the `llm_models` table. All the data in the column will be lost.
  - You are about to drop the column `output_price` on the `llm_models` table. All the data in the column will be lost.
  - You are about to drop the column `max_retries` on the `llm_providers` table. All the data in the column will be lost.
  - You are about to drop the column `retry_interval` on the `llm_providers` table. All the data in the column will be lost.
  - You are about to drop the column `timeout` on the `llm_providers` table. All the data in the column will be lost.
  - You are about to drop the column `recipient_id` on the `mailbox` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "mailbox" DROP CONSTRAINT "mailbox_recipient_id_fkey";

-- DropIndex
DROP INDEX "mailbox_recipient_id_created_at_idx";

-- DropIndex
DROP INDEX "mailbox_recipient_id_is_read_idx";

-- AlterTable
ALTER TABLE "llm_models" DROP COLUMN "input_price",
DROP COLUMN "is_enabled",
DROP COLUMN "output_price";

-- AlterTable
ALTER TABLE "llm_providers" DROP COLUMN "max_retries",
DROP COLUMN "retry_interval",
DROP COLUMN "timeout";

-- AlterTable
ALTER TABLE "mailbox" DROP COLUMN "recipient_id";

-- CreateIndex
CREATE INDEX "mailbox_is_read_idx" ON "mailbox"("is_read");

-- CreateIndex
CREATE INDEX "mailbox_created_at_idx" ON "mailbox"("created_at");
