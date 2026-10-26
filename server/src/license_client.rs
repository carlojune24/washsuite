use serde::{Deserialize, Serialize};

/// Mirrors ValidateLicenseRequest in src-tauri/src/license.rs -- same edge function, same
/// request shape, just called server-to-server instead of from the desktop app.
#[derive(Serialize)]
struct ValidateLicenseRequest<'a> {
    license_key: &'a str,
    machine_fingerprint: &'a str,
    app_version: &'a str,
}

/// Only the fields this server actually needs -- `#[serde(default)]` because the edge function
/// omits fields that aren't relevant to a given outcome (see license.rs's LicenseCheckResponse).
#[derive(Debug, Default, Deserialize)]
pub struct LicenseCheckResponse {
    pub valid: bool,
    #[serde(default)]
    pub reason: Option<String>,
    #[serde(default)]
    pub plan: Option<String>,
}

pub async fn validate_license(
    validate_url: &str,
    license_key: &str,
    machine_fingerprint: &str,
    app_version: &str,
) -> Result<LicenseCheckResponse, String> {
    let client = reqwest::Client::new();
    let res = client
        .post(validate_url)
        .json(&ValidateLicenseRequest {
            license_key,
            machine_fingerprint,
            app_version,
        })
        .send()
        .await
        .map_err(|e| format!("couldn't reach license server: {e}"))?;

    res.json::<LicenseCheckResponse>()
        .await
        .map_err(|e| format!("unexpected response from license server: {e}"))
}
