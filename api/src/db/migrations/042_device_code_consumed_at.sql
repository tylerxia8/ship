ALTER TABLE oauth_device_codes
  ADD COLUMN IF NOT EXISTS consumed_at TIMESTAMP;
