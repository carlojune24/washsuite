-- Caches the license's expires_at (nullable -- null means the license never expires) so the
-- client can display it and warn ahead of time, without needing a server round trip.
ALTER TABLE license_state ADD COLUMN expires_at TEXT;
