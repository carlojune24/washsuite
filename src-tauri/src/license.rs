use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

/// Public endpoint for the `validate-license` edge function (verify_jwt is disabled on it, since
/// desktop clients authenticate with a license key, not a Supabase session). Not a secret -- the
/// function itself does the sensitive work server-side with the service role key.
const VALIDATE_LICENSE_URL: &str = "https://hxgjduszmszydrkvdesf.supabase.co/functions/v1/validate-license";

#[derive(Serialize)]
struct ValidateLicenseRequest<'a> {
    license_key: &'a str,
    machine_fingerprint: &'a str,
    app_version: &'a str,
}

#[derive(Serialize)]
struct ReleaseLicenseRequest<'a> {
    license_key: &'a str,
    machine_fingerprint: &'a str,
    action: &'static str,
}

#[derive(Debug, Default, Deserialize)]
struct ReleaseLicenseResponse {
    #[serde(default)]
    released: bool,
}

/// Mirrors exactly what validate-license sends over the wire. Every field beyond `valid` is
/// optional because the edge function only ever includes the ones relevant to that particular
/// outcome -- a success response has no `reason`, a failure response has nothing but `reason`.
#[derive(Debug, Default, Deserialize)]
struct LicenseCheckResponse {
    valid: bool,
    #[serde(default)]
    reason: Option<String>,
    #[serde(default)]
    license_id: Option<String>,
    #[serde(default)]
    plan: Option<String>,
    #[serde(default)]
    expires_at: Option<String>,
    #[serde(default)]
    checked_at: Option<String>,
    #[serde(default)]
    valid_until: Option<String>,
    #[serde(default)]
    signature: Option<String>,
    /// Present only alongside reason: "activation_limit_reached" -- lets the client tell the
    /// person at the keyboard when the device they'd be bumping was last seen.
    #[serde(default)]
    other_device_last_seen: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct LicenseCheckResult {
    pub valid: bool,
    pub reason: Option<String>,
    pub license_id: Option<String>,
    pub plan: Option<String>,
    pub expires_at: Option<String>,
    pub checked_at: Option<String>,
    pub valid_until: Option<String>,
    pub signature: Option<String>,
    pub other_device_last_seen: Option<String>,
    /// Computed locally, not part of the server response -- attached here so the frontend can
    /// cache exactly what was checked without a second round trip.
    pub machine_fingerprint: String,
}

/// Derives a stable per-machine identifier from the OS-level hardware ID (Windows MachineGuid,
/// macOS IOPlatformUUID, Linux /etc/machine-id) and hashes it before it ever leaves the device --
/// the server only ever sees an opaque fingerprint, never the raw hardware ID.
///
/// `machine-uid` has no Android implementation (Android is a distinct Rust target, not just
/// "linux"), and there's no equivalent of these desktop IDs reachable without native Android
/// code. On Android this MUST become a real value read via Settings.Secure.ANDROID_ID before
/// shipping -- that requires a small Kotlin+Rust plugin bridge (Tauri's mobile plugin API;
/// there's no raw-JNI shortcut, since Tauri's Android bootstrap doesn't populate ndk-context).
/// The placeholder below deliberately does NOT read anything OS-level, so it does NOT detect a
/// cloned install the way the desktop path does -- it only exists so the rest of the app is
/// exercisable on Android while that plugin gets built.
#[cfg(target_os = "android")]
pub(crate) fn compute_fingerprint() -> Result<String, String> {
    let mut hasher = Sha256::new();
    hasher.update(b"android-placeholder-fingerprint-todo-replace-with-android-id-plugin");
    Ok(format!("{:x}", hasher.finalize()))
}

#[cfg(not(target_os = "android"))]
pub(crate) fn compute_fingerprint() -> Result<String, String> {
    let raw = machine_uid::get().map_err(|e| format!("couldn't read machine id: {e}"))?;
    let mut hasher = Sha256::new();
    hasher.update(raw.as_bytes());
    Ok(format!("{:x}", hasher.finalize()))
}

#[tauri::command]
pub fn get_machine_fingerprint() -> Result<String, String> {
    compute_fingerprint()
}

/// Registers or re-validates this machine against a license key. Idempotent server-side: the
/// first call for a given (license, machine) pair activates it (subject to max_activations),
/// every later call is just a check-in that refreshes the offline grace window.
///
/// When the license is already activated elsewhere and at its device limit, this comes back
/// with reason "activation_limit_reached" (plus other_device_last_seen) instead of activating.
/// There's no takeover from here -- only the device that currently holds the slot can free it,
/// via `release_license` below.
#[tauri::command]
pub async fn check_license(license_key: String, app_version: String) -> Result<LicenseCheckResult, String> {
    let fingerprint = compute_fingerprint()?;

    let client = reqwest::Client::new();
    let res = client
        .post(VALIDATE_LICENSE_URL)
        .json(&ValidateLicenseRequest {
            license_key: license_key.trim(),
            machine_fingerprint: &fingerprint,
            app_version: &app_version,
        })
        .send()
        .await
        .map_err(|e| format!("couldn't reach license server: {e}"))?;

    let body: LicenseCheckResponse = res
        .json()
        .await
        .map_err(|e| format!("unexpected response from license server: {e}"))?;

    Ok(LicenseCheckResult {
        valid: body.valid,
        reason: body.reason,
        license_id: body.license_id,
        plan: body.plan,
        expires_at: body.expires_at,
        checked_at: body.checked_at,
        valid_until: body.valid_until,
        signature: body.signature,
        other_device_last_seen: body.other_device_last_seen,
        machine_fingerprint: fingerprint,
    })
}

/// Releases THIS device's own activation for a license, freeing its slot for another device.
/// Scoped to the caller's own machine_fingerprint server-side -- there's no way to release a
/// different device from here, by design (see Settings -> License on the device to be freed).
#[tauri::command]
pub async fn release_license(license_key: String) -> Result<bool, String> {
    let fingerprint = compute_fingerprint()?;

    let client = reqwest::Client::new();
    let res = client
        .post(VALIDATE_LICENSE_URL)
        .json(&ReleaseLicenseRequest {
            license_key: license_key.trim(),
            machine_fingerprint: &fingerprint,
            action: "release",
        })
        .send()
        .await
        .map_err(|e| format!("couldn't reach license server: {e}"))?;

    let body: ReleaseLicenseResponse = res
        .json()
        .await
        .map_err(|e| format!("unexpected response from license server: {e}"))?;

    Ok(body.released)
}
