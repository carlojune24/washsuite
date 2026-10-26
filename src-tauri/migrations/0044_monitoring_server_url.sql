-- Remembers which server this install registered against, so every later snapshot push
-- targets the same server without needing to ask again. Defaults to the address used before
-- this column existed, so already-registered installs keep working unchanged.
ALTER TABLE monitoring_state ADD COLUMN server_url TEXT NOT NULL DEFAULT 'http://51.79.159.222:8090';
