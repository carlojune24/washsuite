import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { toast } from "sonner";
import {
  ChevronLeft,
  Printer,
  Banknote,
  WashingMachine,
  Check,
  Phone,
  User,
  ShoppingBasket,
  Layers,
  Wallet,
  StickyNote,
  Clock,
  AlertCircle,
} from "lucide-react";
import { execute, select, formatDateTime } from "../lib/db";
import { listPairedPrinters, printReceipt, printInvoice, resolveSelectedPrinter } from "../lib/printer";
import { getOrAssignInvoiceNumber, formatInvoiceNumber } from "../lib/invoice";
import { getOrderInvoiceSeries } from "../lib/orSeries";
import { generateInvoicePdf } from "../lib/invoiceReport";
import { buildReceiptLines } from "../lib/receiptLines";
import { computeVatBreakdown } from "../lib/vat";
import type { Order, OrderItem, Customer, ServicePackage, Branch, PaymentMethod, OrderStatus } from "../types";

const STATUS_LABEL: Record<Order["status"], string> = {
  pending: "Received",
  ready: "Ready",
  claimed: "Claimed",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

const STATUS_CLASS: Record<Order["status"], string> = {
  pending: "bg-amber-100 text-amber-700",
  ready: "bg-blue-100 text-blue-700",
  claimed: "bg-purple-100 text-purple-700",
  delivered: "bg-emerald-100 text-emerald-700",
  cancelled: "bg-red-100 text-red-600",
};

// pending -> ready -> claimed -> delivered; cancelled is a separate action, not a forward step
const STATUS_FLOW: OrderStatus[] = ["pending", "ready", "claimed", "delivered"];

const PAYMENT_LABEL: Record<Order["payment_status"], string> = {
  unpaid: "Unpaid",
  partial: "Partial",
  paid: "Paid",
};

const METHOD_LABEL: Record<PaymentMethod, string> = {
  cash: "Cash",
  gcash: "E-wallet",
  card: "Card",
  bank_transfer: "Bank Transfer",
};

export default function OrderDetail() {
  const { id } = useParams();
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const [order, setOrder] = useState<Order | null>(null);
  const [items, setItems] = useState<OrderItem[]>([]);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [pkg, setPkg] = useState<ServicePackage | null>(null);
  const [branch, setBranch] = useState<Branch | null>(null);
  const [lastPaymentMethod, setLastPaymentMethod] = useState<PaymentMethod | null>(null);
  const [lastPaymentReference, setLastPaymentReference] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [printing, setPrinting] = useState(false);
  const [printError, setPrintError] = useState<string | null>(null);
  const [invoicing, setInvoicing] = useState<"pdf" | "thermal" | null>(null);
  const [invoiceError, setInvoiceError] = useState<string | null>(null);

  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  const [savingPayment, setSavingPayment] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);

  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    (async () => {
      const [[o], orderItems, branchRows, paymentRows] = await Promise.all([
        select<Order>("SELECT * FROM orders WHERE id = ?", [id]),
        select<OrderItem>("SELECT * FROM order_items WHERE order_id = ? ORDER BY id", [id]),
        select<Branch>("SELECT * FROM branches WHERE id = 1"),
        select<{ method: PaymentMethod; reference_no: string | null }>(
          "SELECT method, reference_no FROM payments WHERE order_id = ? ORDER BY created_at DESC LIMIT 1",
          [id],
        ),
      ]);
      setOrder(o ?? null);
      setItems(orderItems);
      setBranch(branchRows[0] ?? null);
      setLastPaymentMethod(paymentRows[0]?.method ?? null);
      setLastPaymentReference(paymentRows[0]?.reference_no ?? null);
      if (o?.customer_id) {
        const [c] = await select<Customer>("SELECT * FROM customers WHERE id = ?", [o.customer_id]);
        setCustomer(c ?? null);
      }
      if (o?.package_id) {
        const [p] = await select<ServicePackage>("SELECT * FROM service_packages WHERE id = ?", [o.package_id]);
        setPkg(p ?? null);
      }
      setLoading(false);
    })();
  }, [id]);

  async function handlePrint() {
    if (!order) return;
    setPrinting(true);
    setPrintError(null);
    try {
      const printers = await listPairedPrinters();
      const printer = resolveSelectedPrinter(printers);
      if (!printer) {
        setPrintError(
          printers && printers.length > 1
            ? "Multiple printers paired — select one in Printer Settings."
            : "No paired printer found. Pair one in your device's Bluetooth settings.",
        );
        return;
      }
      await printReceipt(printer, {
        businessName: "WashSuite",
        branchName: branch?.name,
        order,
        items,
        customer,
        pkg,
      });
    } catch (err) {
      setPrintError(String(err));
    } finally {
      setPrinting(false);
    }
  }

  async function handleDownloadInvoice() {
    if (!order || !branch) return;
    setInvoicing("pdf");
    setInvoiceError(null);
    try {
      const invoiceNumber = await getOrAssignInvoiceNumber(order.id);
      setOrder((prev) => (prev ? { ...prev, invoice_number: invoiceNumber } : prev));
      const invoiceSeries = await getOrderInvoiceSeries(order.id);
      const orSeriesLabel = invoiceSeries
        ? `${formatInvoiceNumber(invoiceSeries.seriesStart)}-${formatInvoiceNumber(invoiceSeries.seriesEnd)}`
        : null;
      generateInvoicePdf({
        businessName: branch.name,
        businessAddress: branch.address,
        businessTin: branch.tin,
        businessContact: branch.phone,
        birPermitNo: invoiceSeries?.permitNo ?? branch.bir_permit_no,
        orSeriesLabel,
        invoiceNumber,
        orderNumber: order.order_number,
        dateLabel: formatDateTime(order.drop_off_at),
        customerName: customer?.full_name ?? "Walk-in",
        customerTin: customer?.tin ?? null,
        customerAddress: customer?.address ?? null,
        items: buildReceiptLines(items, pkg, order.package_loads),
        vat: computeVatBreakdown(order, branch),
        scPwd:
          order.sc_pwd_discount_amount > 0
            ? { idNo: order.sc_pwd_id_no, name: order.sc_pwd_name, discountAmount: order.sc_pwd_discount_amount }
            : null,
        paymentMethodLabel: lastPaymentMethod ? METHOD_LABEL[lastPaymentMethod] : null,
        referenceNo: lastPaymentReference,
        terms: branch.invoice_terms,
      });
      toast.success("Invoice downloaded", { description: `Invoice No. ${formatInvoiceNumber(invoiceNumber)}` });
    } catch (err) {
      setInvoiceError(String(err));
    } finally {
      setInvoicing(null);
    }
  }

  async function handlePrintInvoice() {
    if (!order || !branch) return;
    setInvoicing("thermal");
    setInvoiceError(null);
    try {
      const printers = await listPairedPrinters();
      const printer = resolveSelectedPrinter(printers);
      if (!printer) {
        setInvoiceError(
          printers && printers.length > 1
            ? "Multiple printers paired — select one in Printer Settings."
            : "No paired printer found. Pair one in your device's Bluetooth settings.",
        );
        return;
      }
      const invoiceNumber = await getOrAssignInvoiceNumber(order.id);
      setOrder((prev) => (prev ? { ...prev, invoice_number: invoiceNumber } : prev));
      const invoiceSeries = await getOrderInvoiceSeries(order.id);
      await printInvoice(printer, {
        branch,
        order,
        items,
        customer,
        pkg,
        invoiceNumber,
        orSeriesLabel: invoiceSeries
          ? `${formatInvoiceNumber(invoiceSeries.seriesStart)}-${formatInvoiceNumber(invoiceSeries.seriesEnd)}`
          : null,
        birPermitNo: invoiceSeries?.permitNo ?? branch.bir_permit_no,
        paymentMethodLabel: lastPaymentMethod ? METHOD_LABEL[lastPaymentMethod] : null,
        referenceNo: lastPaymentReference,
      });
    } catch (err) {
      setInvoiceError(String(err));
    } finally {
      setInvoicing(null);
    }
  }

  async function handleRecordPayment() {
    if (!order) return;
    const balance = order.grand_total - order.amount_paid;
    const amt = Number(paymentAmount);
    if (!(amt > 0)) {
      setPaymentError("Enter an amount greater than 0.");
      return;
    }

    setSavingPayment(true);
    setPaymentError(null);
    try {
      const applied = Math.min(amt, balance);
      const newAmountPaid = order.amount_paid + applied;
      const newStatus: Order["payment_status"] = newAmountPaid >= order.grand_total ? "paid" : "partial";

      await execute("INSERT INTO payments (order_id, amount, method, received_by) VALUES (?, ?, ?, ?)", [
        order.id,
        applied,
        paymentMethod,
        currentUser?.id ?? null,
      ]);
      await execute("UPDATE orders SET amount_paid = ?, payment_status = ? WHERE id = ?", [
        newAmountPaid,
        newStatus,
        order.id,
      ]);

      setOrder({ ...order, amount_paid: newAmountPaid, payment_status: newStatus });
      setLastPaymentMethod(paymentMethod);
      setShowPaymentForm(false);
      setPaymentAmount("");
    } catch (err) {
      setPaymentError(String(err));
    } finally {
      setSavingPayment(false);
    }
  }

  async function advanceStatus() {
    if (!order) return;
    const idx = STATUS_FLOW.indexOf(order.status);
    if (idx === -1 || idx === STATUS_FLOW.length - 1) return;
    const next = STATUS_FLOW[idx + 1];

    setUpdatingStatus(true);
    setStatusError(null);
    try {
      if (next === "claimed") {
        await execute("UPDATE orders SET status = ?, claimed_at = datetime('now') WHERE id = ?", [next, order.id]);
        setOrder({ ...order, status: next, claimed_at: new Date().toISOString() });
      } else {
        await execute("UPDATE orders SET status = ? WHERE id = ?", [next, order.id]);
        setOrder({ ...order, status: next });
      }
    } catch (err) {
      setStatusError(String(err));
    } finally {
      setUpdatingStatus(false);
    }
  }

  async function cancelOrder() {
    if (!order) return;
    if (!confirm("Cancel this order?")) return;

    setUpdatingStatus(true);
    setStatusError(null);
    try {
      await execute("UPDATE orders SET status = 'cancelled' WHERE id = ?", [order.id]);
      setOrder({ ...order, status: "cancelled" });
    } catch (err) {
      setStatusError(String(err));
    } finally {
      setUpdatingStatus(false);
    }
  }

  if (loading) {
    return <p className="py-10 text-center text-sm text-ink/40">Loading…</p>;
  }

  if (!order) {
    return <p className="py-10 text-center text-sm text-ink/40">Order not found.</p>;
  }

  const balance = order.grand_total - order.amount_paid;
  const currentIndex = STATUS_FLOW.indexOf(order.status);

  return (
    <div>
      <div className="sticky top-0 z-10 mb-4 flex items-center gap-2 bg-page pb-2">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface text-ink shadow-sm"
        >
          <ChevronLeft size={18} strokeWidth={2.2} />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl font-semibold text-ink">{customer?.full_name ?? "Walk-in"}</h1>
          <p className="truncate text-xs text-ink/50">
            {order.order_number} · {formatDateTime(order.drop_off_at)}
            {(order.kg || order.loads) && " · "}
            {order.kg && `${order.kg} kg`}
            {order.kg && order.loads && " · "}
            {order.loads && `${order.loads} load${order.loads === 1 ? "" : "s"}`}
            {order.invoice_number != null && ` · INV #${formatInvoiceNumber(order.invoice_number)}`}
          </p>
        </div>
      </div>

      {/* Payment hero banner */}
      <div
        className={
          "relative mb-4 overflow-hidden rounded-2xl p-4 text-white shadow-sm " +
          (order.payment_status === "paid"
            ? "bg-gradient-to-br from-emerald-600 to-emerald-500"
            : order.payment_status === "partial"
              ? "bg-gradient-to-br from-amber-600 to-amber-500"
              : "bg-gradient-to-br from-red-600 to-red-500")
        }
      >
        <WashingMachine
          size={90}
          strokeWidth={1.2}
          className="pointer-events-none absolute -right-3 -bottom-4 text-white/15"
        />
        <p className="text-xs font-medium text-white/80">{PAYMENT_LABEL[order.payment_status]}</p>
        <p className="mt-0.5 text-2xl font-bold">₱{order.grand_total.toFixed(2)}</p>
        {order.payment_status !== "paid" && (
          <p className="mt-1 text-xs text-white/80">
            Paid ₱{order.amount_paid.toFixed(2)} · Balance ₱{balance.toFixed(2)}
          </p>
        )}
        <span className="absolute right-3 bottom-3 flex h-8 w-8 items-center justify-center rounded-full bg-white/25">
          {order.payment_status === "paid" ? (
            <Check size={16} strokeWidth={3} />
          ) : order.payment_status === "partial" ? (
            <Clock size={15} strokeWidth={2.4} />
          ) : (
            <AlertCircle size={15} strokeWidth={2.4} />
          )}
        </span>
      </div>

      {/* Order status */}
      <div className="mb-4 rounded-2xl bg-surface p-4 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <span className="text-xs font-semibold tracking-wide text-ink/40 uppercase">Order status</span>
          <span className={"rounded-full px-2.5 py-1 text-[11px] font-semibold " + STATUS_CLASS[order.status]}>
            {STATUS_LABEL[order.status]}
          </span>
        </div>

        {order.status === "cancelled" ? (
          <p className="rounded-xl bg-red-50 py-3 text-center text-sm font-semibold text-red-600">Order cancelled</p>
        ) : (
          <div className="flex items-center">
            {STATUS_FLOW.map((stage, i) => {
              const done = i < currentIndex;
              const current = i === currentIndex;
              return (
                <div key={stage} className="flex flex-1 items-center last:flex-none">
                  <div className="flex flex-col items-center gap-1.5">
                    <span
                      className={
                        "flex h-7 w-7 items-center justify-center rounded-full border-2 " +
                        (done
                          ? "border-brand-500 bg-brand-500 text-white"
                          : current
                            ? "border-brand-500 bg-surface text-brand-500"
                            : "border-gray-200 bg-surface text-transparent")
                      }
                    >
                      {done ? <Check size={13} strokeWidth={3} /> : <span className="h-2 w-2 rounded-full bg-current" />}
                    </span>
                    <span
                      className={
                        "text-[10px] font-medium whitespace-nowrap " +
                        (current || done ? "text-brand-500" : "text-ink/30")
                      }
                    >
                      {STATUS_LABEL[stage]}
                    </span>
                  </div>
                  {i < STATUS_FLOW.length - 1 && (
                    <div className={"mx-1 h-0.5 flex-1 " + (i < currentIndex ? "bg-brand-500" : "bg-gray-200")} />
                  )}
                </div>
              );
            })}
          </div>
        )}

        {statusError && <p className="mt-3 text-sm text-red-600">{statusError}</p>}

        {order.status !== "cancelled" && order.status !== "delivered" && (
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={advanceStatus}
              disabled={updatingStatus}
              className="flex-1 rounded-2xl bg-brand-500 py-3 text-sm font-semibold text-white shadow-sm disabled:opacity-60"
            >
              {updatingStatus ? "Updating…" : `Mark as ${STATUS_LABEL[STATUS_FLOW[currentIndex + 1]]}`}
            </button>
            <button
              type="button"
              onClick={cancelOrder}
              disabled={updatingStatus}
              className="rounded-2xl bg-red-50 px-5 py-3 text-sm font-semibold text-red-600 disabled:opacity-60"
            >
              Cancel
            </button>
          </div>
        )}
      </div>

      {/* Customer */}
      <div className="mb-4 rounded-2xl bg-surface p-4 shadow-sm">
        <p className="mb-3 text-xs font-semibold tracking-wide text-ink/40 uppercase">Customer</p>
        <div className="flex items-center gap-2 text-sm">
          <User size={15} strokeWidth={2.2} className="shrink-0 text-ink/40" />
          <span className="font-medium text-ink">{customer?.full_name ?? "Walk-in Customer"}</span>
        </div>
        <div className="mt-2 flex items-center gap-2 text-sm">
          <Phone size={15} strokeWidth={2.2} className="shrink-0 text-ink/40" />
          <span className="text-ink/70">{customer?.phone || "—"}</span>
        </div>
      </div>

      {/* Items */}
      <div className="mb-4 rounded-2xl bg-surface p-4 shadow-sm">
        <p className="mb-3 text-xs font-semibold tracking-wide text-ink/40 uppercase">Items</p>
        {items.length === 0 && !pkg && <p className="text-sm text-ink/40">No line items on this order.</p>}
        <div className="space-y-3">
          {pkg && (
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-200/50 text-brand-600">
                <Layers size={16} strokeWidth={2.2} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-ink">{pkg.name} (package)</p>
                {(order.package_loads ?? 1) > 1 && (
                  <p className="text-xs text-ink/50">
                    ₱{pkg.price.toFixed(2)} × {order.package_loads} loads
                  </p>
                )}
              </div>
              <span className="shrink-0 text-sm font-semibold text-ink">₱{(pkg.price * Math.max(1, order.package_loads ?? 1)).toFixed(2)}</span>
            </div>
          )}
          {items.map((it) => (
            <div key={it.id} className="flex items-center gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-200/50 text-brand-600">
                <ShoppingBasket size={16} strokeWidth={2.2} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-ink">{it.description}</p>
                <p className="text-xs text-ink/40">
                  {it.quantity} × ₱{it.unit_price.toFixed(2)}
                </p>
              </div>
              <span className="shrink-0 text-sm font-semibold text-ink">₱{it.line_total.toFixed(2)}</span>
            </div>
          ))}
        </div>
        <div className="mt-3 space-y-1 border-t border-gray-100 pt-3">
          {order.discount_total > 0 && (
            <>
              <div className="flex items-center justify-between text-sm text-ink/50">
                <span>Subtotal</span>
                <span>₱{order.subtotal.toFixed(2)}</span>
              </div>
              <div className="flex items-center justify-between text-sm text-emerald-600">
                <span>Discount</span>
                <span>-₱{order.discount_total.toFixed(2)}</span>
              </div>
            </>
          )}
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-ink">Total</span>
            <span className="text-sm font-semibold text-ink">₱{order.grand_total.toFixed(2)}</span>
          </div>
        </div>
      </div>

      {/* Payment */}
      <div className="mb-4 rounded-2xl bg-surface p-4 shadow-sm">
        <p className="mb-3 text-xs font-semibold tracking-wide text-ink/40 uppercase">Payment</p>
        <div className="flex items-center justify-between text-sm">
          <span className="flex items-center gap-2 text-ink/60">
            <Wallet size={15} strokeWidth={2.2} className="text-ink/40" />
            Payment Method
          </span>
          <span className="font-semibold text-ink">
            {lastPaymentMethod ? METHOD_LABEL[lastPaymentMethod] : "—"}
          </span>
        </div>
        <div className="mt-2 flex items-center justify-between text-sm">
          <span className="flex items-center gap-2 text-ink/60">
            <Banknote size={15} strokeWidth={2.2} className="text-ink/40" />
            Amount Paid
          </span>
          <span className="font-semibold text-ink">₱{order.amount_paid.toFixed(2)}</span>
        </div>

        {order.payment_status !== "paid" && !showPaymentForm && (
          <button
            type="button"
            onClick={() => {
              setPaymentAmount(balance.toFixed(2));
              setShowPaymentForm(true);
            }}
            className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-2xl bg-surface-muted py-2.5 text-sm font-semibold text-ink"
          >
            <Banknote size={15} strokeWidth={2.2} />
            Record payment
          </button>
        )}

        {order.payment_status !== "paid" && showPaymentForm && (
          <div className="mt-3 space-y-3 rounded-2xl bg-surface-muted p-3.5">
            <div className="flex gap-1.5 rounded-2xl bg-surface p-1.5">
              {(["cash", "gcash"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setPaymentMethod(m)}
                  className={
                    "flex-1 rounded-xl py-1.5 text-xs font-semibold capitalize transition-colors " +
                    (paymentMethod === m ? "bg-brand-500 text-white" : "text-ink/50")
                  }
                >
                  {m === "gcash" ? "E-wallet" : "Cash"}
                </button>
              ))}
            </div>

            <label className="block">
              <span className="mb-1 block text-xs font-medium text-ink/50">Amount received</span>
              <input
                type="number"
                inputMode="decimal"
                min="0"
                step="any"
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(e.target.value)}
                placeholder="0.00"
                className="w-full rounded-2xl bg-surface px-3.5 py-2.5 text-sm font-medium text-ink outline-none placeholder:text-ink/30"
              />
            </label>

            {paymentError && <p className="text-sm text-red-600">{paymentError}</p>}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowPaymentForm(false);
                  setPaymentError(null);
                }}
                className="flex-1 rounded-2xl bg-surface py-3 text-sm font-semibold text-ink/60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleRecordPayment}
                disabled={savingPayment}
                className="flex-1 rounded-2xl bg-brand-500 py-3 text-sm font-semibold text-white shadow-sm disabled:opacity-60"
              >
                {savingPayment ? "Saving…" : "Confirm"}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Order notes */}
      <div className="mb-4 rounded-2xl bg-surface p-4 shadow-sm">
        <p className="mb-2 text-xs font-semibold tracking-wide text-ink/40 uppercase">Order Notes</p>
        <div className="flex items-start gap-2 text-sm">
          <StickyNote size={15} strokeWidth={2.2} className="mt-0.5 shrink-0 text-ink/40" />
          <span className="text-ink/60">{order.notes || "No notes added"}</span>
        </div>
      </div>

      {printError && <p className="mb-3 text-sm text-red-600">{printError}</p>}

      {!branch?.hide_print_receipt && (
        <button
          type="button"
          onClick={handlePrint}
          disabled={printing}
          className="mb-3 flex w-full items-center justify-center gap-1.5 rounded-2xl bg-brand-500 py-3 text-sm font-semibold text-white shadow-sm disabled:opacity-60"
        >
          <Printer size={16} strokeWidth={2.2} />
          {printing ? "Printing…" : "Print Receipt"}
        </button>
      )}

      <p className="mb-2 px-1 text-xs font-semibold tracking-wide text-ink/40 uppercase">
        Sales Invoice (BIR)
        {order.invoice_number != null && (
          <span className="ml-1.5 normal-case tracking-normal text-ink/60">
            · Invoice No. {formatInvoiceNumber(order.invoice_number)}
          </span>
        )}
      </p>
      {invoiceError && <p className="mb-3 text-sm text-red-600">{invoiceError}</p>}
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={handleDownloadInvoice}
          disabled={invoicing !== null}
          className="flex items-center justify-center gap-1.5 rounded-2xl border border-brand-500/30 bg-surface py-3 text-sm font-semibold text-brand-500 shadow-sm disabled:opacity-60"
        >
          {invoicing === "pdf" ? "Generating…" : "Download PDF"}
        </button>
        <button
          type="button"
          onClick={handlePrintInvoice}
          disabled={invoicing !== null}
          className="flex items-center justify-center gap-1.5 rounded-2xl border border-brand-500/30 bg-surface py-3 text-sm font-semibold text-brand-500 shadow-sm disabled:opacity-60"
        >
          <Printer size={16} strokeWidth={2.2} />
          {invoicing === "thermal" ? "Printing…" : "Print Invoice"}
        </button>
      </div>
    </div>
  );
}
