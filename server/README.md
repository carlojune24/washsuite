# washsuite-monitor

Self-hosted backend for WashSuite's "online monitoring" feature (see the plan at
`.claude/plans/buzzing-drifting-allen.md` if present, or the conversation that designed it).

A shop's local WashSuite install registers itself here with its license key (re-validated
server-to-server against the same Supabase `validate-license` edge function
`src-tauri/src/license.rs` calls), then periodically pushes a compact JSON snapshot (sales,
cashflow, attendance, machine status). The owner logs into a small dashboard with a per-shop
password to view the latest snapshot.

## Local dev

```sh
cp .env.example .env   # fill in a real DATABASE_URL and SESSION_SECRET
cargo run
```

Requires a reachable Postgres database; migrations in `migrations/` run automatically on startup.

## Endpoints

- `POST /v1/register` — `{ license_key, machine_fingerprint, shop_name, dashboard_password, app_version }` → `{ shop_id, api_token }` (token shown once).
- `POST /v1/snapshots` — `Authorization: Bearer <api_token>` + snapshot JSON body → `{ received_at }`.
- `POST /v1/dashboard/login` — `{ shop_id, password }` → sets a signed session cookie.
- `GET /v1/dashboard/snapshot` — cookie-authenticated → `{ shop_name, received_at, snapshot }`.

## Deploy

See `deploy/` for the systemd unit template and setup notes. Currently running plain HTTP on a
non-standard port (no domain yet) — see the unit file's comments for what changes once TLS is
added (nginx reverse proxy + `.secure(true)` on the session cookie in `src/routes/dashboard.rs`).
