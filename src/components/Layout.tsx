import { NavLink, Outlet, Link } from "react-router-dom";
import { Home, Receipt, Users, MoreHorizontal, Plus } from "lucide-react";
import { Toaster, toast } from "sonner";
import { useEffect, type ComponentType } from "react";
import { useAuth } from "../lib/auth";
import { daysUntil, loadCachedLicense } from "../lib/license";

// Matches the server's own OFFLINE_GRACE_DAYS (validate-license) -- an owner gets exactly as
// much advance notice as the offline grace window they'd otherwise be silently relying on.
const EXPIRY_WARNING_LEAD_DAYS = 14;

const LEFT_TABS = [
  { to: "/", label: "Home", icon: Home, end: true, pageKey: null },
  { to: "/sales", label: "Sales", icon: Receipt, end: false, pageKey: "sales" },
];

const RIGHT_TABS = [
  { to: "/customers", label: "Customers", icon: Users, end: false, pageKey: "customers" },
  { to: "/settings", label: "More", icon: MoreHorizontal, end: false, pageKey: null },
];

export default function Layout() {
  const { hasAccess } = useAuth();
  const leftTabs = LEFT_TABS.filter((t) => !t.pageKey || hasAccess(t.pageKey));
  const rightTabs = RIGHT_TABS.filter((t) => !t.pageKey || hasAccess(t.pageKey));

  useEffect(() => {
    loadCachedLicense().then((cached) => {
      if (!cached?.expires_at) return;
      const remaining = daysUntil(cached.expires_at);
      const expiresLabel = new Date(cached.expires_at).toLocaleDateString([], {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
      if (remaining < 0) {
        toast.warning("Your WashSuite license has expired", {
          description: "Renew soon to avoid losing access.",
          duration: 8000,
        });
      } else if (remaining <= EXPIRY_WARNING_LEAD_DAYS) {
        toast.warning("Your WashSuite license expires soon", {
          description: `Expires ${expiresLabel}. Renew to avoid interruption.`,
          duration: 8000,
        });
      }
    });
  }, []);

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-page">
      <Toaster
        position="top-center"
        richColors
        closeButton
        toastOptions={{
          style: { borderRadius: "16px", fontSize: "14px" },
          className: "font-sans",
        }}
      />

      {/* <header className="pt-safe shrink-0 px-5 pt-3 pb-1">
        <div className="flex h-10 items-center justify-between">
          <Link
            to="/settings"
            className="flex h-10 w-10 items-center justify-center rounded-full bg-surface text-ink shadow-sm"
            aria-label="Menu"
          >
            <Menu size={18} strokeWidth={2.2} />
          </Link>
          <span className="text-sm font-semibold tracking-tight text-ink/30">WashSuite</span>
        </div>
      </header> */}

      <main className="pt-safe pb-nav-safe flex-1 overflow-y-auto px-4 mt-3">
        <Outlet />
      </main>

      <nav className="fixed inset-x-4 bottom-nav-safe">
        <div className="pb-3 flex items-end justify-between rounded-t-[28px] bg-surface px-2 pt-2 shadow-[0_-4px_20px_rgba(17,46,129,0.15)]">
          {leftTabs.map((tab) => (
            <TabLink key={tab.to} {...tab} />
          ))}

          {hasAccess("sales") && (
            <Link to="/sales/new" className="relative -mt-9 flex flex-1 flex-col items-center gap-1">
              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-500 text-white shadow-[0_8px_18px_rgba(67,130,223,0.5)] ring-4 ring-white">
                <Plus size={24} strokeWidth={2.5} />
              </span>
              <span className="text-[10px] font-semibold text-brand-500">New Order</span>
            </Link>
          )}

          {rightTabs.map((tab) => (
            <TabLink key={tab.to} {...tab} />
          ))}
        </div>
      </nav>
    </div>
  );
}

function TabLink({
  to,
  label,
  icon: Icon,
  end,
}: {
  to: string;
  label: string;
  icon: ComponentType<{ size?: number; strokeWidth?: number }>;
  end: boolean;
}) {
  return (
    <NavLink to={to} end={end} className="flex flex-1 flex-col items-center gap-0.5 py-1.5">
      {({ isActive }: { isActive: boolean }) => (
        <>
          <span
            className={
              "flex h-8 w-8 items-center justify-center rounded-full transition-colors " +
              (isActive ? "bg-brand-500 text-white" : "text-ink/35")
            }
          >
            <Icon size={20} strokeWidth={2.2} />
          </span>
          <span className={"text-[12px] font-medium " + (isActive ? "text-brand-500" : "text-ink/50")}>
            {label}
          </span>
        </>
      )}
    </NavLink>
  );
}
