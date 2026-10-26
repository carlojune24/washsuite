CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- One row per registered shop. license_key + machine_fingerprint together identify the
-- installation that registered it -- re-registering the same (license_key, machine_fingerprint)
-- pair rotates its token and dashboard password instead of creating a duplicate row.
CREATE TABLE shops (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    license_key TEXT NOT NULL,
    machine_fingerprint TEXT NOT NULL,
    shop_name TEXT,
    plan TEXT,
    api_token_hash TEXT NOT NULL UNIQUE,
    dashboard_password_hash TEXT NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_snapshot_at TIMESTAMPTZ,
    UNIQUE (license_key, machine_fingerprint)
);

-- Latest snapshot only, not history -- the freshness requirement is "periodic push + manual
-- refresh", not trend charts, so there's nothing to gain from keeping every push.
CREATE TABLE shop_snapshots (
    shop_id UUID PRIMARY KEY REFERENCES shops(id) ON DELETE CASCADE,
    payload JSONB NOT NULL,
    received_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
