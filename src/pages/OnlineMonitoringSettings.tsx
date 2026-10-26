import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, Wifi, Copy } from "lucide-react";
import { toast } from "sonner";
import { select } from "../lib/db";
import { loadCachedLicense } from "../lib/license";
import {
  loadMonitoringState,
  registerMonitoring,
  setMonitoringEnabled,
  pushSnapshotNow,
  DEFAULT_MONITOR_SERVER_URL,
  type MonitoringState,
} from "../lib/monitoring";
import { buildMachinesBlock } from "../lib/monitoringSync";
import { useMachineStatus } from "../lib/machineStatus";
import type { Branch } from "../types";
import { localDate } from "../lib/localDate";

export default function OnlineMonitoringSettings() {
  const { machines, statuses } = useMachineStatus();
  const [loading, setLoading] = useState(true);
  const [state, setState] = useState<MonitoringState | null>(null);
  const [hasLicense, setHasLicense] = useState(false);
  const [branchName, setBranchName] = useState("");

  useEffect(() => {
    (async () => {
      const [monitoring, branch, license] = await Promise.all([
        loadMonitoringState(),
        select<Branch>("SELECT * FROM branches WHERE id = 1").then(([b]) => b ?? null),
        loadCachedLicense(),
      ]);
      setState(monitoring);
      setBranchName(branch?.name ?? "");
      setHasLicense(!!license);
      setLoading(false);
    })();
  }, []);

  async function refreshState() {
    setState(await loadMonitoringState());
  }

  async function handleSyncNow() {
    await pushSnapshotNow(buildMachinesBlock(machines, statuses));
    await refreshState();
  }

  return (
    <div>
      <div className="sticky top-0 z-10 mb-4 flex items-center gap-2 bg-page pb-2">
        <Link
          to="/settings"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface text-ink shadow-sm"
        >
          <ChevronLeft size={18} strokeWidth={2.2} />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-semibold text-ink">Online Monitoring</h1>
          <p className="truncate text-xs text-ink/50">Check sales, cashflow, attendance & machines remotely</p>
        </div>
      </div>

      {loading ? (
        <p className="py-10 text-center text-sm text-ink/40">Loading…</p>
      ) : state ? (
        <RegisteredView
          state={state}
          onChanged={refreshState}
          onSyncNow={handleSyncNow}
        />
      ) : (
        <SetupForm branchName={branchName} hasLicense={hasLicense} onRegistered={refreshState} />
      )}
    </div>
  );
}

function SetupForm({
  branchName,
  hasLicense,
  onRegistered,
}: {
  branchName: string;
  hasLicense: boolean;
  onRegistered: () => void;
}) {
  const [serverUrl, setServerUrl] = useState(DEFAULT_MONITOR_SERVER_URL);
  const [shopName, setShopName] = useState(branchName);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleEnable() {
    setError(null);
    if (!hasLicense) {
      setError("Activate your license first in Settings → License.");
      return;
    }
    if (!serverUrl.trim()) {
      setError("Server address is required.");
      return;
    }
    if (password.length < 8) {
      setError("Dashboard password must be at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords don't match.");
      return;
    }

    setSaving(true);
    try {
      const cached = await loadCachedLicense();
      if (!cached) throw new Error("Activate your license first in Settings → License.");
      await registerMonitoring(cached.license_key, shopName, password, serverUrl);
      toast.success("Online monitoring enabled");
      onRegistered();
    } catch (err) {
      setError(String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="mb-4 space-y-3 rounded-2xl bg-surface p-4 shadow-sm">
        <p className="text-[11px] text-ink/40">
          This device will periodically send a summary of today's sales, cashflow, attendance, and machine status to
          your monitoring server, so the owner can check in remotely. Testing over plain HTTP for now — treat the
          dashboard password below as not yet private until this moves to HTTPS.
        </p>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-ink/50">Server address</span>
          <input
            value={serverUrl}
            onChange={(e) => setServerUrl(e.target.value)}
            placeholder="http://your-server:8090"
            className="w-full rounded-2xl bg-surface-muted px-3.5 py-2.5 text-sm font-medium text-ink outline-none placeholder:text-ink/30"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-ink/50">Shop name</span>
          <input
            value={shopName}
            onChange={(e) => setShopName(e.target.value)}
            className="w-full rounded-2xl bg-surface-muted px-3.5 py-2.5 text-sm font-medium text-ink outline-none"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-ink/50">Dashboard password</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-2xl bg-surface-muted px-3.5 py-2.5 text-sm font-medium text-ink outline-none"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-ink/50">Confirm password</span>
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="w-full rounded-2xl bg-surface-muted px-3.5 py-2.5 text-sm font-medium text-ink outline-none"
          />
        </label>
      </div>

      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}

      <button
        type="button"
        onClick={handleEnable}
        disabled={saving}
        className="w-full rounded-2xl bg-brand-500 py-3 text-sm font-semibold text-white shadow-sm disabled:opacity-60"
      >
        {saving ? "Enabling…" : "Enable online monitoring"}
      </button>
    </div>
  );
}

function BackfillForm({ onPushed }: { onPushed: () => void }) {
  const [date, setDate] = useState("");
  const [pushing, setPushing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Can't backfill today or the future -- "Sync now" already covers today with live machine status.
  const maxDate = localDate(new Date(Date.now() - 24 * 60 * 60 * 1000));

  async function handlePush() {
    if (!date) return;
    setPushing(true);
    setError(null);
    try {
      // No historical machine status exists to send -- see buildSnapshot()'s doc comment.
      await pushSnapshotNow({ total_loads_today: 0, machines: [] }, date);
      toast.success(`Pushed ${date}`);
      setDate("");
      onPushed();
    } catch (err) {
      setError(String(err));
      toast.error("Push failed");
    } finally {
      setPushing(false);
    }
  }

  return (
    <div className="mt-3 border-t border-ink/5 pt-3">
      <p className="text-xs font-semibold text-ink">Backfill a past day</p>
      <p className="mt-0.5 text-[11px] text-ink/40">
        Sends that day's actual sales, cashflow, and attendance to the dashboard — useful if monitoring was off or
        the device was offline that day. Machine status isn't available for past days.
      </p>
      <div className="mt-2 flex gap-2">
        <input
          type="date"
          value={date}
          max={maxDate}
          onChange={(e) => setDate(e.target.value)}
          className="flex-1 rounded-xl bg-surface-muted px-3 py-2 text-xs font-medium text-ink outline-none"
        />
        <button
          type="button"
          onClick={handlePush}
          disabled={!date || pushing}
          className="cursor-pointer rounded-xl bg-surface-muted px-4 py-2 text-xs font-semibold text-brand-500 disabled:opacity-60"
        >
          {pushing ? "Pushing…" : "Push"}
        </button>
      </div>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </div>
  );
}

function RegisteredView({
  state,
  onChanged,
  onSyncNow,
}: {
  state: MonitoringState;
  onChanged: () => void;
  onSyncNow: () => Promise<void>;
}) {
  const [syncing, setSyncing] = useState(false);
  const [togglingEnabled, setTogglingEnabled] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPasswordForm, setShowPasswordForm] = useState(false);

  async function handleToggle(next: boolean) {
    setTogglingEnabled(true);
    try {
      await setMonitoringEnabled(next);
      onChanged();
    } finally {
      setTogglingEnabled(false);
    }
  }

  async function handleSyncNow() {
    setSyncing(true);
    setError(null);
    try {
      await onSyncNow();
      toast.success("Synced");
    } catch (err) {
      setError(String(err));
      toast.error("Sync failed");
    } finally {
      setSyncing(false);
    }
  }

  function copyShopId() {
    navigator.clipboard.writeText(state.shop_id);
    toast.success("Shop ID copied");
  }

  return (
    <div>
      <div className="mb-4 rounded-2xl bg-surface p-3.5 shadow-sm">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-200/50 text-brand-600">
            <Wifi size={16} strokeWidth={2.2} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-ink">Online monitoring</p>
            <p className="truncate text-xs text-ink/50">
              {state.enabled ? "Active — syncing automatically" : "Paused"}
            </p>
          </div>
          <input
            type="checkbox"
            checked={!!state.enabled}
            disabled={togglingEnabled}
            onChange={(e) => handleToggle(e.target.checked)}
            className="h-5 w-5 accent-brand-500"
          />
        </div>

        <div className="mt-3 space-y-1 border-t border-ink/5 pt-3 text-xs text-ink/50">
          <p>
            {state.last_push_at
              ? `Last synced ${new Date(state.last_push_at).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}`
              : "Not synced yet"}
            {state.last_push_at && (
              <span className={state.last_push_ok ? "ml-1 text-emerald-600" : "ml-1 text-red-600"}>
                {state.last_push_ok ? "· OK" : "· Failed"}
              </span>
            )}
          </p>
          {!state.last_push_ok && state.last_push_error && (
            <p className="text-red-600">{state.last_push_error}</p>
          )}
          <p className="truncate">Server: {state.server_url}</p>
        </div>

        {error && <p className="mt-2 text-xs text-red-600">{error}</p>}

        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={handleSyncNow}
            disabled={syncing}
            className="flex-1 cursor-pointer rounded-xl bg-surface-muted py-2 text-xs font-semibold text-brand-500 disabled:opacity-60"
          >
            {syncing ? "Syncing…" : "Sync now"}
          </button>
          <button
            type="button"
            onClick={copyShopId}
            className="flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-xl bg-surface-muted py-2 text-xs font-semibold text-ink/60"
          >
            <Copy size={13} strokeWidth={2.2} />
            Copy Shop ID
          </button>
        </div>

        <BackfillForm onPushed={onChanged} />
      </div>

      <p className="mb-2 px-1 text-[11px] text-ink/40">
        The web dashboard the owner logs into with this Shop ID isn't live yet — it's coming in a later update. This
        device is already pushing data to the monitoring server in the meantime.
      </p>

      <button
        type="button"
        onClick={() => setShowPasswordForm((v) => !v)}
        className="mb-2 text-xs font-semibold text-brand-500"
      >
        {showPasswordForm ? "Cancel" : "Reconfigure"}
      </button>

      {showPasswordForm && (
        <ReconfigureForm currentServerUrl={state.server_url} onDone={() => { setShowPasswordForm(false); onChanged(); }} />
      )}
    </div>
  );
}

function ReconfigureForm({ currentServerUrl, onDone }: { currentServerUrl: string; onDone: () => void }) {
  const [serverUrl, setServerUrl] = useState(currentServerUrl);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setError(null);
    if (!serverUrl.trim()) {
      setError("Server address is required.");
      return;
    }
    if (password.length < 8) {
      setError("Dashboard password must be at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords don't match.");
      return;
    }
    setSaving(true);
    try {
      const cached = await loadCachedLicense();
      if (!cached) throw new Error("Activate your license first in Settings → License.");
      const branch = await select<Branch>("SELECT * FROM branches WHERE id = 1").then(([b]) => b ?? null);
      // Re-registering the same (license_key, machine_fingerprint) pair rotates both the
      // dashboard password and the API token server-side (see server/src/routes/register.rs's
      // ON CONFLICT upsert) -- registerMonitoring() saves the new token+server locally too.
      // Pointing at a different server here creates a fresh shop_id there; the old server's
      // row for this device is simply left behind, unregistered.
      await registerMonitoring(cached.license_key, branch?.name ?? "", password, serverUrl);
      toast.success("Monitoring settings updated");
      onDone();
    } catch (err) {
      setError(String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mb-4 space-y-3 rounded-2xl bg-surface p-4 shadow-sm">
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-ink/50">Server address</span>
        <input
          value={serverUrl}
          onChange={(e) => setServerUrl(e.target.value)}
          placeholder="http://your-server:8090"
          className="w-full rounded-2xl bg-surface-muted px-3.5 py-2.5 text-sm font-medium text-ink outline-none placeholder:text-ink/30"
        />
      </label>
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-ink/50">New dashboard password</span>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-2xl bg-surface-muted px-3.5 py-2.5 text-sm font-medium text-ink outline-none"
        />
      </label>
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-ink/50">Confirm new password</span>
        <input
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          className="w-full rounded-2xl bg-surface-muted px-3.5 py-2.5 text-sm font-medium text-ink outline-none"
        />
      </label>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <button
        type="button"
        onClick={handleSave}
        disabled={saving}
        className="w-full rounded-xl bg-brand-500 py-2.5 text-xs font-semibold text-white disabled:opacity-60"
      >
        {saving ? "Saving…" : "Save"}
      </button>
    </div>
  );
}
