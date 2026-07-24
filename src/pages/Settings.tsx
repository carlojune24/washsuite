import { Link } from "react-router-dom";
import { useEffect, useState, type ComponentType } from "react";
import {
  ChevronRight,
  Printer,
  Database,
  Store,
  Sun,
  Moon,
  Monitor,
  Users as UsersIcon,
  LogOut,
  KeyRound,
  BarChart3,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeading } from "../components/ListRow";
import { useTheme, type Theme } from "../lib/theme";
import { useAuth } from "../lib/auth";
import {
  checkLicense,
  clearCachedLicense,
  licenseErrorMessage,
  loadCachedLicense,
  releaseLicense,
  saveLicenseState,
  type LicenseStateRow,
} from "../lib/license";

interface MenuItem {
  to: string;
  label: string;
  description: string;
  icon: ComponentType<{ size?: number; strokeWidth?: number }>;
}

const REPORTS_SECTION: MenuItem[] = [
  { to: "/reports", label: "Reports", description: "Sales, expenses, inventory, employee & customer insights", icon: BarChart3 },
];

const APP_SECTIONS: MenuItem[] = [
  { to: "/settings/printer", label: "Printer", description: "Pair and test receipt printer", icon: Printer },
  { to: "/settings/branch", label: "Business Info", description: "Name, TIN, and invoice details for receipts", icon: Store },
  { to: "/settings/backup", label: "Backup & data", description: "Export or back up your data", icon: Database },
];

const ADMIN_SECTIONS: MenuItem[] = [
  { to: "/users", label: "Users", description: "Accounts, roles, and page access", icon: UsersIcon },
];

export default function Settings() {
  const { currentUser, logout, hasAccess } = useAuth();
  return (
    <div>
      <PageHeading title="Settings" />

      <AppearanceSection />
      {currentUser?.role === "owner" && <MenuGroup title="Admin" items={ADMIN_SECTIONS} />}
      {currentUser?.role === "owner" && <LicenseSection />}
      {hasAccess("reports") && <MenuGroup title="Reports" items={REPORTS_SECTION} />}
      <MenuGroup title="App" items={APP_SECTIONS} />

      <div className="mb-4">
        <p className="mb-1.5 px-1 text-xs font-semibold tracking-wide text-ink/40 uppercase">Account</p>
        <button
          type="button"
          onClick={logout}
          className="flex w-full cursor-pointer items-center gap-3 rounded-2xl bg-surface p-2.5 text-left shadow-sm"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-red-100 text-red-600">
            <LogOut size={16} strokeWidth={2.2} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-ink">Log out</p>
            {currentUser && (
              <p className="truncate text-xs text-ink/50">Signed in as {currentUser.full_name}</p>
            )}
          </div>
        </button>
      </div>
    </div>
  );
}

const THEME_OPTIONS: { key: Theme; label: string; icon: ComponentType<{ size?: number; strokeWidth?: number }> }[] = [
  { key: "light", label: "Light", icon: Sun },
  { key: "dark", label: "Dark", icon: Moon },
  { key: "system", label: "System", icon: Monitor },
];

function AppearanceSection() {
  const { theme, setTheme } = useTheme();
  return (
    <div className="mb-4">
      <p className="mb-1.5 px-1 text-xs font-semibold tracking-wide text-ink/40 uppercase">Appearance</p>
      <div className="rounded-2xl bg-surface p-2.5 shadow-sm">
        <div className="flex gap-1.5 rounded-2xl bg-surface-muted p-1.5">
          {THEME_OPTIONS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              type="button"
              onClick={() => setTheme(key)}
              className={
                "flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-semibold transition-colors " +
                (theme === key ? "bg-brand-500 text-white shadow-sm" : "text-ink/50")
              }
            >
              <Icon size={14} strokeWidth={2.2} />
              {label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// Shows the WASH-XXXXX prefix (the same one support/the CLI use to identify a key) and blanks
// out the rest, so this screen can be glanced at or screen-shared without exposing the full key.
function maskLicenseKey(key: string) {
  return key
    .split("-")
    .map((part, i) => (i <= 1 ? part : "•".repeat(part.length)))
    .join("-");
}

function LicenseSection() {
  const [cached, setCached] = useState<LicenseStateRow | null | undefined>(undefined);
  const [verifying, setVerifying] = useState(false);
  const [releasing, setReleasing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadCachedLicense().then(setCached);
  }, []);

  async function handleVerify() {
    if (!cached) return;
    setVerifying(true);
    setError(null);
    try {
      const result = await checkLicense(cached.license_key);
      if (result.valid) {
        await saveLicenseState(cached.license_key, result);
        setCached(await loadCachedLicense());
      } else {
        setError(licenseErrorMessage(result.reason, result.other_device_last_seen));
      }
    } catch {
      setError(licenseErrorMessage(null));
    } finally {
      setVerifying(false);
    }
  }

  function confirmRelease() {
    toast("Release this device from your license?", {
      description: "WashSuite will lock on this device until it's activated again with a license key.",
      action: { label: "Release", onClick: () => handleRelease() },
      cancel: { label: "Cancel", onClick: () => {} },
      duration: 8000,
    });
  }

  async function handleRelease() {
    if (!cached) return;
    setReleasing(true);
    setError(null);
    try {
      await releaseLicense(cached.license_key);
      await clearCachedLicense();
      // The gate only checks license state on mount -- reload so it re-evaluates and shows
      // the activation screen instead of leaving this now-unlicensed session running.
      window.location.reload();
    } catch {
      setError(licenseErrorMessage(null));
      setReleasing(false);
    }
  }

  if (cached === undefined) return null;

  return (
    <div className="mb-4">
      <p className="mb-1.5 px-1 text-xs font-semibold tracking-wide text-ink/40 uppercase">License</p>
      <div className="rounded-2xl bg-surface p-3.5 shadow-sm">
        {cached ? (
          <>
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-200/50 text-brand-600">
                <KeyRound size={16} strokeWidth={2.2} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-ink capitalize">{cached.plan ?? "Standard"} plan</p>
                <p className="truncate text-xs text-ink/50">{maskLicenseKey(cached.license_key)}</p>
              </div>
              <span className="shrink-0 rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
                Active
              </span>
            </div>

            <div className="mt-3 space-y-1 border-t border-ink/5 pt-3 text-xs text-ink/50">
              <p>
                Verified{" "}
                {new Date(cached.checked_at).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}
              </p>
              <p>
                {cached.expires_at
                  ? `Expires ${new Date(cached.expires_at).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })}`
                  : "Never expires"}
              </p>
              <p>Device ID: {cached.machine_fingerprint.slice(0, 12)}…</p>
            </div>

            {error && <p className="mt-2 text-xs text-red-600">{error}</p>}

            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={handleVerify}
                disabled={verifying || releasing}
                className="flex-1 cursor-pointer rounded-xl bg-surface-muted py-2 text-xs font-semibold text-brand-500 disabled:opacity-60"
              >
                {verifying ? "Verifying…" : "Verify now"}
              </button>
              <button
                type="button"
                onClick={confirmRelease}
                disabled={verifying || releasing}
                className="flex-1 cursor-pointer rounded-xl bg-red-50 py-2 text-xs font-semibold text-red-600 disabled:opacity-60"
              >
                {releasing ? "Releasing…" : "Release this device"}
              </button>
            </div>
          </>
        ) : (
          <p className="text-sm text-ink/50">No license information found.</p>
        )}
      </div>
    </div>
  );
}

function MenuGroup({ title, items }: { title: string; items: MenuItem[] }) {
  return (
    <div className="mb-4">
      <p className="mb-1.5 px-1 text-xs font-semibold tracking-wide text-ink/40 uppercase">{title}</p>
      <div className="space-y-1.5">
        {items.map((item) => (
          <MenuRow key={item.to} item={item} />
        ))}
      </div>
    </div>
  );
}

function MenuRow({ item }: { item: MenuItem }) {
  const Icon = item.icon;
  return (
    <Link to={item.to} className="flex items-center gap-3 rounded-2xl bg-surface p-2.5 shadow-sm">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-200/50 text-brand-600">
        <Icon size={16} strokeWidth={2} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-ink">{item.label}</p>
        <p className="truncate text-xs text-ink/50">{item.description}</p>
      </div>
      <ChevronRight size={16} className="shrink-0 text-ink/25" />
    </Link>
  );
}
