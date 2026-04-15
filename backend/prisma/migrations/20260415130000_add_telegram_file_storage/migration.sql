-- Migration: add Telegram file storage fields to order_files

-- Make storagePath nullable/defaultable (existing rows keep their value)
ALTER TABLE "order_files"
  ALTER COLUMN "storage_path" SET DEFAULT '';

-- Add Telegram storage columns
ALTER TABLE "order_files"
  ADD COLUMN IF NOT EXISTS "telegram_file_id" TEXT,
  ADD COLUMN IF NOT EXISTS "telegram_chat_id" TEXT,
  ADD COLUMN IF NOT EXISTS "telegram_msg_id"  INTEGER;
