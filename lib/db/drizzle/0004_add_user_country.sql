-- Additive DEV schema change. Publish owns production schema application.
-- No row/receipt backfill. Countries are populated after consent by application requests.
ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS country text
  CONSTRAINT user_preferences_country_check CHECK (country IS NULL OR country ~ '^[A-Z]{2}$');
