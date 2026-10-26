import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, BookOpen, PlusCircle, Lock } from "lucide-react";
import { toast } from "sonner";
import ListRow, { EmptyState } from "../components/ListRow";
import { closeOrSeries, listOrSeries } from "../lib/orSeries";
import { formatInvoiceNumber } from "../lib/invoice";
import type { OrSeries as OrSeriesRow } from "../types";

export default function OrSeries() {
  const [series, setSeries] = useState<OrSeriesRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    refresh();
  }, []);

  async function refresh() {
    setLoading(true);
    setSeries(await listOrSeries());
    setLoading(false);
  }

  const active = series.find((s) => s.status === "active");
  const closed = series.filter((s) => s.status !== "active");

  function confirmClose(s: OrSeriesRow) {
    const unused = s.series_end - s.next_number + 1;
    toast(`Close series ${formatInvoiceNumber(s.series_start)}-${formatInvoiceNumber(s.series_end)} early?`, {
      description: `${unused} number${unused === 1 ? "" : "s"} will be left unused and shown as such in its liquidation. This can't be undone.`,
      action: {
        label: "Close",
        onClick: async () => {
          await closeOrSeries(s.id);
          toast.success("Series closed");
          refresh();
        },
      },
      cancel: { label: "Cancel", onClick: () => {} },
      duration: 8000,
    });
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
          <h1 className="text-xl font-semibold text-ink">OR Series</h1>
          <p className="truncate text-xs text-ink/50">Registered BIR receipt series and liquidation</p>
        </div>
      </div>

      {loading ? (
        <p className="py-10 text-center text-sm text-ink/40">Loading…</p>
      ) : (
        <>
          <p className="mb-2 px-1 text-xs font-semibold tracking-wide text-ink/40 uppercase">Active series</p>
          {active ? (
            <>
              <Link
                to={`/settings/or-series/${active.id}`}
                className="mb-2 block rounded-2xl bg-gradient-to-br from-brand-600 to-brand-500 p-4 text-white shadow-sm"
              >
                <span className="mb-2 flex h-8 w-8 items-center justify-center rounded-xl bg-white/15">
                  <BookOpen size={15} strokeWidth={2.2} />
                </span>
                <p className="text-lg font-semibold">
                  {formatInvoiceNumber(active.series_start)}–{formatInvoiceNumber(active.series_end)}
                </p>
                <p className="text-xs text-white/70">
                  Issued {active.next_number - active.series_start} of{" "}
                  {active.series_end - active.series_start + 1}
                  {active.permit_no ? ` · Permit ${active.permit_no}` : ""}
                </p>
              </Link>
              <button
                type="button"
                onClick={() => confirmClose(active)}
                className="mb-1 flex w-full items-center justify-center gap-1.5 rounded-2xl bg-surface py-2.5 text-xs font-semibold text-red-600 shadow-sm"
              >
                <Lock size={13} strokeWidth={2.2} />
                Close this series early
              </button>
              <p className="mb-4 px-1 text-xs text-ink/40">A new series can be registered once this one is closed.</p>
            </>
          ) : (
            <>
              <p className="mb-3 text-sm text-ink/50">No active series — register one to keep issuing invoices.</p>
              <Link
                to="/settings/or-series/new"
                className="mb-4 flex w-full items-center justify-center gap-1.5 rounded-2xl bg-brand-500 py-3 text-sm font-semibold text-white shadow-sm"
              >
                <PlusCircle size={15} strokeWidth={2.2} />
                Register new series
              </Link>
            </>
          )}

          <p className="mb-2 px-1 text-xs font-semibold tracking-wide text-ink/40 uppercase">Past series</p>
          {closed.length === 0 ? (
            <EmptyState text="No closed series yet." />
          ) : (
            <ul className="space-y-2">
              {closed.map((s) => (
                <ListRow
                  key={s.id}
                  to={`/settings/or-series/${s.id}`}
                  icon={BookOpen}
                  iconClassName="bg-ink/5 text-ink/40"
                  title={`${formatInvoiceNumber(s.series_start)}–${formatInvoiceNumber(s.series_end)}`}
                  subtitle={`Registered ${s.registered_at}${s.permit_no ? ` · Permit ${s.permit_no}` : ""}`}
                  value="Closed"
                  valueClassName="text-ink/40"
                />
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
