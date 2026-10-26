use serde::{Deserialize, Serialize};

/// The monitoring server's address is entered in Settings (see OnlineMonitoringSettings.tsx)
/// rather than hardcoded, so repointing at a new server/domain/TLS setup never needs a new
/// app build -- only trims/validates what the client already typed.
fn normalize_server_url(raw: &str) -> Result<String, String> {
    let trimmed = raw.trim().trim_end_matches('/');
    if trimmed.is_empty() {
        return Err("Server address is required.".to_string());
    }
    if !trimmed.starts_with("http://") && !trimmed.starts_with("https://") {
        return Err("Server address must start with http:// or https://".to_string());
    }
    Ok(trimmed.to_string())
}

#[derive(Serialize)]
struct RegisterRequest<'a> {
    license_key: &'a str,
    machine_fingerprint: &'a str,
    shop_name: Option<&'a str>,
    dashboard_password: &'a str,
    app_version: &'a str,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct MonitoringRegistration {
    pub shop_id: String,
    pub api_token: String,
}

/// Mirrors the `{ "error": ..., "reason": ... }` shape every non-2xx response from the
/// monitoring server uses (see server/src/routes/register.rs).
#[derive(Debug, Default, Deserialize)]
struct ErrorResponse {
    #[serde(default)]
    error: Option<String>,
    #[serde(default)]
    reason: Option<String>,
}

/// Registers this install with the monitoring server: turns a license key into a scoped API
/// token for pushing snapshots. The server re-validates the license itself server-to-server
/// against the same Supabase endpoint check_license below calls -- this command doesn't (and
/// can't) skip that check by claiming validity.
#[tauri::command]
pub async fn register_monitoring(
    license_key: String,
    shop_name: String,
    dashboard_password: String,
    app_version: String,
    server_url: String,
) -> Result<MonitoringRegistration, String> {
    let base_url = normalize_server_url(&server_url)?;
    let fingerprint = crate::license::compute_fingerprint()?;
    let trimmed_shop_name = shop_name.trim();

    let client = reqwest::Client::new();
    let res = client
        .post(format!("{base_url}/v1/register"))
        .json(&RegisterRequest {
            license_key: license_key.trim(),
            machine_fingerprint: &fingerprint,
            shop_name: if trimmed_shop_name.is_empty() { None } else { Some(trimmed_shop_name) },
            dashboard_password: &dashboard_password,
            app_version: &app_version,
        })
        .send()
        .await
        .map_err(|e| format!("couldn't reach monitoring server: {e}"))?;

    if !res.status().is_success() {
        let body: ErrorResponse = res.json().await.unwrap_or_default();
        return Err(body.reason.or(body.error).unwrap_or_else(|| "registration_failed".to_string()));
    }

    res.json::<MonitoringRegistration>()
        .await
        .map_err(|e| format!("unexpected response from monitoring server: {e}"))
}

/// Pushes one snapshot. `snapshot` is forwarded as-is -- this command doesn't interpret it, the
/// shape is owned entirely by src/lib/monitoring.ts (buildSnapshot) and the server stores it as
/// opaque JSON (see server/src/routes/ingest.rs).
#[tauri::command]
pub async fn push_monitoring_snapshot(
    api_token: String,
    snapshot: serde_json::Value,
    server_url: String,
) -> Result<(), String> {
    let base_url = normalize_server_url(&server_url)?;
    let client = reqwest::Client::new();
    let res = client
        .post(format!("{base_url}/v1/snapshots"))
        .bearer_auth(&api_token)
        .json(&snapshot)
        .send()
        .await
        .map_err(|e| format!("couldn't reach monitoring server: {e}"))?;

    if !res.status().is_success() {
        let status = res.status();
        let body: ErrorResponse = res.json().await.unwrap_or_default();
        return Err(body.error.unwrap_or_else(|| format!("monitoring server returned {status}")));
    }
    Ok(())
}
