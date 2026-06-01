ALTER TABLE webhook_subscriptions
  ADD COLUMN IF NOT EXISTS signing_secret TEXT;
