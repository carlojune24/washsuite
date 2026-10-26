import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Loader2, ShieldAlert, ShieldCheck } from "lucide-react";
import {
  checkLicense,
  clearCachedLicense,
  getMachineFingerprint,
  isTransientLicenseReason,
  licenseErrorMessage,
  loadCachedLicense,
  saveLicenseState,
} from "../lib/license";

type GateState = "checking" | "locked" | "ready";

// Floor for catching a revocation/expiry while the app stays open in the foreground.
const RECHECK_INTERVAL_MS = 30 * 60 * 1000;
// Also re-check whenever the app regains focus (e.g. was backgrounded on mobile, or the
// desktop window was refocused), throttled so rapid focus toggles don't spam the server.
const MIN_FOCUS_RECHECK_GAP_MS = 5 * 60 * 1000;

/**
 * Blocks the whole app behind a one-time, per-machine license. On every launch the cached
 * license_state row (if any) is checked against a freshly-computed hardware fingerprint -- a
 * mismatch means this install (db and all) was copied onto different hardware, which is treated
 * exactly like having no license at all until it's re-activated here.
 */
export function LicenseGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<GateState>("checking");
  const [prefillKey, setPrefillKey] = useState("");
  const [banner, setBanner] = useState<string | null>(null);
  const lastCheckedRef = useRef(0);

  /** Re-validates the cached license against the server; drops to the activation screen if it's no longer good. */
  async function revalidate() {
    const cached = await loadCachedLicense();
    if (!cached) return;
    lastCheckedRef.current = Date.now();
    try {
      const result = await checkLicense(cached.license_key);
      if (result.valid) {
        await saveLicenseState(cached.license_key, result);
      } else if (isTransientLicenseReason(result.reason)) {
        // Server responded but couldn't confirm anything (its own message says "try again in a
        // moment") -- treat it the same as not reaching the server at all, below.
      } else {
        await clearCachedLicense();
        setPrefillKey(cached.license_key);
        setBanner(licenseErrorMessage(result.reason, result.other_device_last_seen));
        setState("locked");
      }
    } catch {
      // Offline or server hiccup -- keep trusting the cache, same as the mount-time check.
    }
  }

  useEffect(() => {
    (async () => {
      try {
        const [cached, fingerprint] = await Promise.all([loadCachedLicense(), getMachineFingerprint()]);

        if (!cached) {
          setState("locked");
          return;
        }

        if (cached.machine_fingerprint !== fingerprint) {
          setPrefillKey(cached.license_key);
          setBanner("This copy of WashSuite isn't licensed for this device. Enter your license key to activate it here.");
          setState("locked");
          return;
        }

        if (new Date(cached.valid_until) > new Date()) {
          setState("ready");
          // Background check-in -- the cached grace window already covers this launch, so a
          // request that never lands (offline, server hiccup) is silently ignored and the
          // cache keeps being trusted. But if the server DOES answer and says the license is
          // no longer good (revoked, etc.), don't wait for the cache to expire on its own --
          // drop back to the activation screen right away.
          revalidate();
          return;
        }

        // Offline grace window lapsed -- must reach the server before letting the app in.
        const result = await checkLicense(cached.license_key);
        if (result.valid) {
          await saveLicenseState(cached.license_key, result);
          setState("ready");
          lastCheckedRef.current = Date.now();
        } else {
          setPrefillKey(cached.license_key);
          setBanner(licenseErrorMessage(result.reason, result.other_device_last_seen));
          setState("locked");
        }
      } catch {
        setBanner(licenseErrorMessage(null));
        setState("locked");
      }
    })();
  }, []);

  // Keep catching revocations/expiry while the app stays open, instead of only at the mount-time
  // check above -- a fixed interval as the floor, plus a check whenever the app regains
  // focus/visibility (the common "was backgrounded" case on mobile).
  useEffect(() => {
    if (state !== "ready") return;

    const interval = setInterval(revalidate, RECHECK_INTERVAL_MS);

    function onVisibilityChange() {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - lastCheckedRef.current < MIN_FOCUS_RECHECK_GAP_MS) return;
      revalidate();
    }
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [state]);

  if (state === "checking") {
    return (
      <div className="flex h-dvh items-center justify-center bg-page">
        <Loader2 size={22} strokeWidth={2.2} className="animate-spin text-brand-500" />
      </div>
    );
  }

  if (state === "locked") {
    return (
      <ActivationScreen
        prefillKey={prefillKey}
        banner={banner}
        onActivated={() => {
          lastCheckedRef.current = Date.now();
          setState("ready");
        }}
      />
    );
  }

  return <>{children}</>;
}

function ActivationScreen({
  prefillKey,
  banner,
  onActivated,
}: {
  prefillKey: string;
  banner: string | null;
  onActivated: () => void;
}) {
  const [key, setKey] = useState(prefillKey);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!key.trim()) {
      setError("Enter a license key.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const result = await checkLicense(key);
      if (result.valid) {
        await saveLicenseState(key.trim(), result);
        onActivated();
      } else {
        setError(licenseErrorMessage(result.reason, result.other_device_last_seen));
      }
    } catch {
      setError(licenseErrorMessage(null));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex h-dvh flex-col items-center justify-center bg-page px-6">
      <div className="mb-6 flex flex-col items-center">
        <span className="mb-3 flex h-16 w-16 items-center justify-center rounded-3xl bg-gradient-to-br from-brand-600 to-brand-500 text-white shadow-sm">
          <ShieldCheck size={28} strokeWidth={1.8} />
        </span>
        <h1 className="text-xl font-bold text-ink">Activate WashSuite</h1>
        <p className="mt-0.5 text-sm text-ink/60">Enter your license key to unlock this device</p>
      </div>

      <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-3">
        {banner && (
          <p className="flex items-start gap-1.5 rounded-2xl bg-amber-50 p-3 text-xs font-medium text-amber-700">
            <ShieldAlert size={15} strokeWidth={2.2} className="mt-0.5 shrink-0" />
            {banner}
          </p>
        )}

        <label className="block rounded-2xl bg-surface p-3.5 shadow-sm">
          <span className="mb-1 block text-xs font-medium text-ink/50">License key</span>
          <input
            type="text"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            autoFocus
            autoCapitalize="none"
            autoCorrect="off"
            required
            className="w-full text-sm font-medium text-ink outline-none"
          />
        </label>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-2xl bg-brand-500 py-3 text-sm font-semibold text-white shadow-sm disabled:opacity-60"
        >
          {submitting ? "Activating…" : "Activate"}
        </button>
      </form>
    </div>
  );
}
