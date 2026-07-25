ALTER TABLE "user_billing" ADD COLUMN IF NOT EXISTS "stripe_subscription_id" text;
