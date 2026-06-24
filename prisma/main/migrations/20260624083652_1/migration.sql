/*
  Warnings:

  - You are about to drop the `permission_group` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `permission_private` table. If the table is not empty, all the data it contains will be lost.
  - Changed the type of `source` on the `like_history` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- CreateEnum
CREATE TYPE "like_source" AS ENUM ('manual', 'scheduled');

-- DropForeignKey
ALTER TABLE "permission_private" DROP CONSTRAINT "permission_private_user_qq_fkey";

-- AlterTable
ALTER TABLE "like_history" DROP COLUMN "source",
ADD COLUMN     "source" "like_source" NOT NULL;

-- DropTable
DROP TABLE "permission_group";

-- DropTable
DROP TABLE "permission_private";

-- DropEnum
DROP TYPE "likesource";

-- CreateTable
CREATE TABLE "accounts" (
    "id" SERIAL NOT NULL,
    "qq" BIGINT NOT NULL,
    "nickname" TEXT,
    "role" TEXT NOT NULL,
    "transport" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "token" TEXT,
    "is_enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "accounts_qq_key" ON "accounts"("qq");

-- CreateIndex
CREATE INDEX "ix_like_history_source_triggered_at" ON "like_history"("source", "triggered_at");
