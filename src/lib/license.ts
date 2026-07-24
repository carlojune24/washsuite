import { invoke } from "@tauri-apps/api/core";
import { getVersion } from "@tauri-apps/api/app";
import { execute, select } from "./db";

export interface LicenseCheckResult {
  valid: boolean;
  reason: string | null;
  license_id: string | null;
  plan: string | null;
  expires_at: string | null;
  checked_at: string | null;
  valid_until: string | null;
  signature: string | null;
  other_device_last_seen: string | null;
  machine_fingerprint: string;
}

export interface LicenseStateRow {
  machine_fingerprint: string;
  license_key: string;
  plan: string | null;
  valid_until: string;
  checked_at: string;
  expires_at: string | null;
}

export async function getMachineFingerprint(): Promise<string> {
  return invoke<string>("get_machine_fingerprint");
}

/**
 * Registers/re-validates this machine against a key via the validate-license edge function.
 * If the license is already at its device limit, this comes back with reason
 * "activation_limit_reached" -- there's no takeover from here; only the device that currently
 * holds the slot can free it, via releaseLicense below.
 */
export async function checkLicense(licenseKey: string): Promise<LicenseCheckResult> {
  const appVersion = await getVersion();
  return invoke<LicenseCheckResult>("check_license", { licenseKey, appVersion });
}

/** Releases THIS device's own activation, freeing its slot for another device. */
export async function releaseLicense(licenseKey: string): Promise<boolean> {
  return invoke<boolean>("release_license", { licenseKey });
}

export async function loadCachedLicense(): Promise<LicenseStateRow | null> {
  const rows = await select<LicenseStateRow>("SELECT * FROM license_state WHERE id = 1");
  return rows[0] ?? null;
}

export async function clearCachedLicense(): Promise<void> {
  await execute("DELETE FROM license_state WHERE id = 1");
}

export async function saveLicenseState(licenseKey: string, result: LicenseCheckResult): Promise<void> {
  if (!result.valid || !result.valid_until || !result.checked_at) return;
  await execute(
    `INSERT INTO license_state (id, machine_fingerprint, license_key, plan, valid_until, checked_at, expires_at)
     VALUES (1, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       machine_fingerprint = excluded.machine_fingerprint,
       license_key = excluded.license_key,
       plan = excluded.plan,
       valid_until = excluded.valid_until,
       checked_at = excluded.checked_at,
       expires_at = excluded.expires_at,
       updated_at = datetime('now')`,
    [result.machine_fingerprint, licenseKey, result.plan, result.valid_until, result.checked_at, result.expires_at],
  );
}

/** Whole days from now until `dateStr` (negative if it's already in the past). */
export function daysUntil(dateStr: string): number {
  const ms = new Date(dateStr).getTime() - Date.now();
  return Math.floor(ms / (24 * 60 * 60 * 1000));
}

const REASON_MESSAGES: Record<string, string> = {
  not_found: "That license key wasn't recognized.",
  revoked: "This license has been revoked.",
  expired: "This license has expired.",
  missing_fields: "Enter a license key.",
  bad_request: "Enter a license key.",
  server_error: "The license server had a problem. Try again in a moment.",
};

export function licenseErrorMessage(reason: string | null | undefined, otherDeviceLastSeen?: string | null): string {
  if (reason === "activation_limit_reached") {
    const base = "This license is already active on another device.";
    const when = otherDeviceLastSeen
      ? ` (last used ${new Date(otherDeviceLastSeen).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })})`
      : "";
    return `${base}${when} Release it from that device's Settings, then try again here.`;
  }
  if (!reason) return "Couldn't verify this license. Check your connection and try again.";
  return REASON_MESSAGES[reason] ?? "This license isn't valid.";
}
