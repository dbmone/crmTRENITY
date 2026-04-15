-- Migration: add revision rounds and client approval sub-stages to order_stages

-- Step 1: Remove the old unique constraint on (order_id, name)
ALTER TABLE "order_stages" DROP CONSTRAINT IF EXISTS "order_stages_order_id_name_key";

-- Step 2: Add new columns
ALTER TABLE "order_stages"
  ADD COLUMN IF NOT EXISTS "revision_round" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "awaiting_client_approval" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "client_approval_skipped" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "client_approved_at" TIMESTAMP(3);

-- Step 3: Add new unique constraint that includes revision_round
ALTER TABLE "order_stages"
  ADD CONSTRAINT "order_stages_order_id_name_revision_round_key"
  UNIQUE ("order_id", "name", "revision_round");
