import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useNavigate, Link } from "react-router-dom";
import { toast } from "sonner";
import {
  ChevronLeft,
  Search,
  X,
  Sparkles,
  Banknote,
  Smartphone,
  ChevronUp,
  ChevronDown,
  Layers,
  WashingMachine,
  Box,
  Printer,
  Check,
  Star,
  Tag,
  IdCard,
} from "lucide-react";
import { execute, select, toEntryTimestamp } from "../lib/db";
import { listPairedPrinters, printReceipt, printInvoice, printLoadTags, resolveSelectedPrinter } from "../lib/printer";
import { getOrAssignInvoiceNumber, formatInvoiceNumber } from "../lib/invoice";
import { getOrderInvoiceSeries } from "../lib/orSeries";
import { getOrAssignLoadTags } from "../lib/loadTags";
import { generateInvoicePdf } from "../lib/invoiceReport";
import { buildReceiptLines } from "../lib/receiptLines";
import { computeScPwdPricing, computeVatBreakdown } from "../lib/vat";
import { retailPrice as computeRetailPrice } from "../lib/pricing";
import { doseFallbackLabel } from "../lib/dose";
import { useAuth } from "../lib/auth";
import type {
  Customer,
  ServicePackage,
  ServiceType,
  AddOn,
  InventoryItem,
  Order,
  OrderItem,
  Branch,
  LoyaltySettings,
  Promo,
  LoadTag,
  VatStatus,
} from "../types";
import { localDate } from "../lib/localDate";

interface ItemRow extends InventoryItem {
  current_cost: number | null;
}

interface PackageItemRow {
  item_id: number;
  quantity: number;
  name: string;
  unit: string;
  branch_id: number | null;
}

interface PackageServiceRow {
  service_type_id: number;
  quantity: number;
  name: string;
  unit: string;
}

type CatalogKind = "service" | "item" | "addon";

interface CatalogEntry {
  kind: CatalogKind;
  id: number;
  name: string;
  unit: string | null;
  price: number;
  doseSize?: number;
}

function today() {
  return localDate(new Date());
}

const KIND_ICON: Record<CatalogKind, typeof WashingMachine> = {
  service: WashingMachine,
  item: Box,
  addon: Sparkles,
};

/**
 * Deduct `qty` of an item from stock, oldest restock batch first. Each batch
 * drawn from gets its own `usage` movement (quantity_remaining decremented,
 * consumed_from_movement_id pointing at that batch, order_id pointing at the
 * sale) so a stock deduction can always be traced to the specific order and
 * the specific batch it came out of. If stock runs out mid-order, the excess
 * is still recorded as usage (oversold) rather than silently dropped or
 * blocking the sale.
 */
async function consumeStock(itemId: number, branchId: number | null, qty: number, orderId: number, orderNumber: string) {
  const batches = await select<{ id: number; quantity_remaining: number }>(
    `SELECT id, quantity_remaining FROM inventory_movements
     WHERE item_id = ? AND movement_type = 'restock' AND quantity_remaining > 0
     ORDER BY created_at ASC, id ASC`,
    [itemId],
  );

  let remaining = qty;
  for (const batch of batches) {
    if (remaining <= 0) break;
    const take = Math.min(batch.quantity_remaining, remaining);
    await execute(`UPDATE inventory_movements SET quantity_remaining = quantity_remaining - ? WHERE id = ?`, [
      take,
      batch.id,
    ]);
    await execute(
      `INSERT INTO inventory_movements (item_id, branch_id, movement_type, quantity, reference, order_id, consumed_from_movement_id)
       VALUES (?, ?, 'usage', ?, ?, ?, ?)`,
      [itemId, branchId, -take, `Order ${orderNumber}`, orderId, batch.id],
    );
    remaining -= take;
  }

  if (remaining > 0) {
    await execute(
      `INSERT INTO inventory_movements (item_id, branch_id, movement_type, quantity, reference, order_id)
       VALUES (?, ?, 'usage', ?, ?, ?)`,
      [itemId, branchId, -remaining, `Order ${orderNumber} (oversold)`, orderId],
    );
  }

  await execute(
    `UPDATE inventory_items SET quantity_on_hand = quantity_on_hand - ?, updated_at = datetime('now') WHERE id = ?`,
    [qty, itemId],
  );
}

export default function OrderForm() {
  const navigate = useNavigate();
  const { currentUser } = useAuth();

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerQuery, setCustomerQuery] = useState("");
  const [selectedCustomerId, setSelectedCustomerId] = useState<number | null>(null);

  const [kg, setKg] = useState("");
  const [loads, setLoads] = useState("");
  const [orderDate, setOrderDate] = useState(today());
  const orderDateRef = useRef<HTMLInputElement>(null);

  const [packages, setPackages] = useState<ServicePackage[]>([]);
  const [selectedPackageId, setSelectedPackageId] = useState<number | null>(null);
  const [packageItems, setPackageItems] = useState<PackageItemRow[]>([]);
  const [packageServices, setPackageServices] = useState<PackageServiceRow[]>([]);

  const [services, setServices] = useState<ServiceType[]>([]);
  const [items, setItems] = useState<ItemRow[]>([]);
  const [addOns, setAddOns] = useState<AddOn[]>([]);
  const [branch, setBranch] = useState<Branch | null>(null);

  const [catalogQuery, setCatalogQuery] = useState("");
  const [serviceLines, setServiceLines] = useState<Record<number, number>>({});
  const [itemLines, setItemLines] = useState<Record<number, number>>({});
  const [selectedAddOnIds, setSelectedAddOnIds] = useState<Set<number>>(new Set());

  const [paymentMethod, setPaymentMethod] = useState<"cash" | "gcash">("cash");
  const [amountPaidInput, setAmountPaidInput] = useState("");
  const [loyaltySettings, setLoyaltySettings] = useState<LoyaltySettings | null>(null);
  const [pointsToRedeemInput, setPointsToRedeemInput] = useState("");

  const [activePromos, setActivePromos] = useState<Promo[]>([]);
  const [appliedPromo, setAppliedPromo] = useState<Promo | null>(null);
  const [dismissedPromoIds, setDismissedPromoIds] = useState<Set<number>>(new Set());

  // SC/PWD statutory discount cannot stack with promo/loyalty discounts (BIR rule) and forces
  // the sale VAT-exempt -- see toggleScPwd() and src/lib/vat.ts's computeScPwdPricing.
  const [scPwdApplied, setScPwdApplied] = useState(false);
  const [scPwdIdNo, setScPwdIdNo] = useState("");
  const [scPwdName, setScPwdName] = useState("");
  const [manualVatStatus, setManualVatStatus] = useState<VatStatus>("vatable");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showDialog, setShowDialog] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedOrder, setSavedOrder] = useState<Order | null>(null);
  const [savedItems, setSavedItems] = useState<OrderItem[]>([]);
  const [savedCustomer, setSavedCustomer] = useState<Customer | null>(null);
  const [printing, setPrinting] = useState(false);
  const [printError, setPrintError] = useState<string | null>(null);
  const [invoicing, setInvoicing] = useState<"pdf" | "thermal" | null>(null);
  const [invoiceError, setInvoiceError] = useState<string | null>(null);
  const [savedLoadTags, setSavedLoadTags] = useState<LoadTag[]>([]);
  const [loadTagsPrinting, setLoadTagsPrinting] = useState(false);
  const [loadTagsError, setLoadTagsError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const [customerRows, packageRows, serviceRows, itemRows, addOnRows, branchRows, loyaltyRows, promoRows] = await Promise.all([
        select<Customer>("SELECT * FROM customers WHERE is_active = 1 ORDER BY full_name"),
        select<ServicePackage>("SELECT * FROM service_packages WHERE is_active = 1 ORDER BY name"),
        select<ServiceType>("SELECT * FROM service_types WHERE is_active = 1 ORDER BY name"),
        select<ItemRow>(
          `SELECT i.*,
                  (SELECT m.unit_price FROM inventory_movements m
                   WHERE m.item_id = i.id AND m.movement_type = 'restock' AND m.quantity_remaining > 0
                   ORDER BY m.created_at ASC, m.id ASC LIMIT 1) AS current_cost
           FROM inventory_items i
           WHERE i.is_active = 1
           ORDER BY i.name`,
        ),
        select<AddOn>("SELECT * FROM add_ons WHERE is_active = 1 ORDER BY name"),
        select<Branch>("SELECT * FROM branches WHERE id = 1"),
        select<LoyaltySettings>("SELECT * FROM loyalty_settings WHERE id = 1"),
        select<Promo>("SELECT * FROM promos WHERE is_active = 1"),
      ]);
      setCustomers(customerRows);
      setPackages(packageRows);
      setServices(serviceRows);
      setItems(itemRows);
      setAddOns(addOnRows);
      setBranch(branchRows[0] ?? null);
      setLoyaltySettings(loyaltyRows[0] ?? null);
      setActivePromos(promoRows);
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    if (!selectedPackageId) {
      setPackageItems([]);
      setPackageServices([]);
      return;
    }
    (async () => {
      const [pkgItemRows, pkgServiceRows] = await Promise.all([
        select<PackageItemRow>(
          `SELECT spi.item_id, spi.quantity, ii.name, ii.unit, ii.branch_id
           FROM service_package_items spi
           JOIN inventory_items ii ON ii.id = spi.item_id
           WHERE spi.package_id = ?`,
          [selectedPackageId],
        ),
        select<PackageServiceRow>(
          `SELECT sps.service_type_id, sps.quantity, st.name, st.unit
           FROM service_package_services sps
           JOIN service_types st ON st.id = sps.service_type_id
           WHERE sps.package_id = ?`,
          [selectedPackageId],
        ),
      ]);
      setPackageItems(pkgItemRows);
      setPackageServices(pkgServiceRows);
    })();
  }, [selectedPackageId]);

  const customerMatches = useMemo(() => {
    const q = customerQuery.trim().toLowerCase();
    if (!q || selectedCustomerId != null) return [];
    return customers.filter((c) => c.full_name.toLowerCase().includes(q)).slice(0, 6);
  }, [customers, customerQuery, selectedCustomerId]);

  const selectedCustomer = useMemo(
    () => (selectedCustomerId != null ? customers.find((c) => c.id === selectedCustomerId) : null),
    [customers, selectedCustomerId],
  );

  function retailPrice(it: ItemRow) {
    return it.current_cost != null ? computeRetailPrice(it.current_cost, it) : 0;
  }

  // Dose steps like 0.03 accumulate floating-point drift over repeated +/- taps
  // (0.06 - 0.03 !== 0.03 in IEEE754); round away that noise before it can leave
  // a line item stuck just above/below zero or thrown off the FIFO deduction.
  function roundQty(n: number) {
    return Math.round(n * 1e6) / 1e6;
  }

  const catalog: CatalogEntry[] = useMemo(
    () => [
      ...services.map((s) => ({ kind: "service" as const, id: s.id, name: s.name, unit: s.unit, price: s.price })),
      ...items.map((it) => ({
        kind: "item" as const,
        id: it.id,
        name: it.name,
        unit: it.unit,
        price: retailPrice(it),
        doseSize: it.dose_size > 0 ? it.dose_size : undefined,
      })),
      ...addOns.map((a) => ({ kind: "addon" as const, id: a.id, name: a.name, unit: null, price: a.price })),
    ],
    [services, items, addOns],
  );

  const filteredCatalog = useMemo(() => {
    const q = catalogQuery.trim().toLowerCase();
    if (!q) return catalog;
    return catalog.filter((c) => c.name.toLowerCase().includes(q));
  }, [catalog, catalogQuery]);

  function isSelected(entry: CatalogEntry) {
    if (entry.kind === "service") return entry.id in serviceLines;
    if (entry.kind === "item") return entry.id in itemLines;
    return selectedAddOnIds.has(entry.id);
  }

  // Per-kg / per-load services default their quantity to the order's Kg / Number-of-loads field so
  // the price follows what staff already typed; the stepper still overrides it afterward.
  function unitQty(unit: string | null): number {
    const u = (unit ?? "").trim().toLowerCase();
    const n = Number(u === "kg" ? kg : u === "load" || u === "loads" ? loads : 0);
    return n > 0 ? n : 1;
  }

  // Each field re-syncs only the services of its own unit, so editing loads can't clobber a manual
  // kg-service quantity (and vice versa).
  function syncUnit(unitName: string[]) {
    setServiceLines((prev) => {
      const next = { ...prev };
      for (const sv of services) {
        if (sv.id in next && unitName.includes((sv.unit ?? "").trim().toLowerCase())) next[sv.id] = unitQty(sv.unit);
      }
      return next;
    });
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => syncUnit(["kg"]), [kg]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => syncUnit(["load", "loads"]), [loads]);

  function toggleEntry(entry: CatalogEntry) {
    if (entry.kind === "service") {
      setServiceLines((prev) => {
        const next = { ...prev };
        if (entry.id in next) delete next[entry.id];
        else next[entry.id] = unitQty(entry.unit);
        return next;
      });
    } else if (entry.kind === "item") {
      setItemLines((prev) => {
        const next = { ...prev };
        if (entry.id in next) delete next[entry.id];
        else next[entry.id] = entry.doseSize ?? 1;
        return next;
      });
    } else {
      setSelectedAddOnIds((prev) => {
        const next = new Set(prev);
        if (next.has(entry.id)) next.delete(entry.id);
        else next.add(entry.id);
        return next;
      });
    }
  }

  const selectedServices = services.filter((s) => s.id in serviceLines);
  const selectedItems = items.filter((it) => it.id in itemLines);
  const selectedAddOnsList = addOns.filter((a) => selectedAddOnIds.has(a.id));
  const selectedPackage = packages.find((p) => p.id === selectedPackageId) ?? null;

  const extrasTotal =
    selectedServices.reduce((sum, s) => sum + s.price * serviceLines[s.id], 0) +
    selectedItems.reduce((sum, it) => sum + retailPrice(it) * itemLines[it.id], 0) +
    selectedAddOnsList.reduce((sum, a) => sum + a.price, 0);
  // Package price is per load; an empty loads field counts as a single load.
  const packageLoads = Math.max(1, Math.floor(Number(loads)) || 0);
  const packagePrice = (selectedPackage?.price ?? 0) * packageLoads;
  const total = packagePrice + extrasTotal;

  // Points redemption: capped by both what the customer actually has available (earned minus
  // already redeemed) and by max_redemption_percent, so a big balance can never fully wipe out
  // a large order's subtotal.
  const availablePoints = selectedCustomer ? selectedCustomer.loyalty_points - selectedCustomer.redeemed_points : 0;
  const maxRedeemableByPercent = loyaltySettings
    ? Math.floor((total * (loyaltySettings.max_redemption_percent / 100)) / (loyaltySettings.redeem_value_per_point || 1))
    : 0;
  const maxRedeemable = Math.max(0, Math.min(availablePoints, maxRedeemableByPercent));
  // BIR SC/PWD rule: statutory discount can't stack with promo/loyalty discounts on the same
  // order, so both are zeroed out here while it's applied (see toggleScPwd for the UI side).
  const pointsToRedeem = scPwdApplied ? 0 : Math.max(0, Math.min(Number(pointsToRedeemInput) || 0, maxRedeemable));
  const loyaltyDiscount = !scPwdApplied && loyaltySettings ? pointsToRedeem * loyaltySettings.redeem_value_per_point : 0;
  const promoDiscount =
    !scPwdApplied && appliedPromo
      ? appliedPromo.discount_type === "percent"
        ? total * (appliedPromo.discount_value / 100)
        : Math.min(appliedPromo.discount_value, total)
      : 0;
  const scPwdPricing = scPwdApplied
    ? computeScPwdPricing(total, !!branch?.vat_registered, branch?.sc_pwd_discount_percent ?? 20)
    : null;
  const scPwdDiscount = scPwdPricing?.scPwdDiscount ?? 0;
  const discountValue = scPwdApplied ? scPwdDiscount : loyaltyDiscount + promoDiscount;
  const grandTotal = scPwdApplied ? Math.max(0, scPwdPricing!.netTotal) : Math.max(0, total - discountValue);
  const totalAfterPromo = Math.max(0, total - promoDiscount);
  const orderVatStatus: VatStatus = scPwdApplied ? "vat_exempt" : manualVatStatus;

  function toggleScPwd() {
    setScPwdApplied((prev) => {
      const next = !prev;
      if (next) {
        // Non-stacking: dropping any promo/points already picked before SC/PWD was toggled on.
        setAppliedPromo(null);
        setPointsToRedeemInput("");
      }
      return next;
    });
  }

  // Combines package-included items and directly-added items into one required-quantity map,
  // then flags any item where stock on hand can't cover it — checked both before opening the
  // confirm dialog and again right before saving, in case stock moved while it was open.
  function stockShortages(): string[] {
    const required: Record<number, number> = {};
    if (selectedPackageId) {
      for (const pi of packageItems) {
        required[pi.item_id] = (required[pi.item_id] ?? 0) + pi.quantity * packageLoads;
      }
    }
    for (const it of selectedItems) {
      required[it.id] = (required[it.id] ?? 0) + itemLines[it.id];
    }
    const shortages: string[] = [];
    for (const [idStr, qty] of Object.entries(required)) {
      const item = items.find((it) => it.id === Number(idStr));
      if (item && item.quantity_on_hand < qty) {
        shortages.push(`${item.name} (need ${qty} ${item.unit}, only ${item.quantity_on_hand} left)`);
      }
    }
    return shortages;
  }

  function promoEligibilityError(promo: Promo): string | null {
    const now = new Date().toISOString().slice(0, 19).replace("T", " ");
    if (promo.starts_at && promo.starts_at > now) return "This promo hasn't started yet.";
    if (promo.ends_at && promo.ends_at < now) return "This promo has expired.";
    if (total < promo.min_spend) return `Requires a minimum spend of ₱${promo.min_spend.toFixed(2)}.`;
    if (promo.usage_limit != null && promo.times_used >= promo.usage_limit) return "This promo has reached its usage limit.";
    return null;
  }

  const eligiblePromos = activePromos.filter((p) => promoEligibilityError(p) === null);

  // Defaults to the first eligible promo so staff don't have to tap it manually, but respects an
  // explicit deselect (tracked in dismissedPromoIds) instead of forcing it back on right away.
  useEffect(() => {
    if (appliedPromo && promoEligibilityError(appliedPromo)) setAppliedPromo(null);
    if (!appliedPromo) {
      const candidate = eligiblePromos.find((p) => !dismissedPromoIds.has(p.id));
      if (candidate) setAppliedPromo(candidate);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePromos, total]);

  function togglePromo(promo: Promo) {
    if (appliedPromo?.id === promo.id) {
      setAppliedPromo(null);
      setDismissedPromoIds((prev) => new Set(prev).add(promo.id));
    } else {
      setAppliedPromo(promo);
      setDismissedPromoIds((prev) => {
        const next = new Set(prev);
        next.delete(promo.id);
        return next;
      });
    }
  }

  const amountPaid = Number(amountPaidInput) || 0;
  const change = Math.max(0, amountPaid - grandTotal);
  const balanceDue = Math.max(0, grandTotal - amountPaid);
  const paymentStatus = amountPaid <= 0 ? "unpaid" : amountPaid >= grandTotal ? "paid" : "partial";

  function proceed(e: FormEvent) {
    e.preventDefault();
    if (!selectedPackageId && selectedServices.length === 0 && selectedItems.length === 0 && selectedAddOnsList.length === 0) {
      setError("Pick a package or add at least one service, item, or add-on.");
      return;
    }
    if (selectedPackageId && !(Number(loads) >= 1)) {
      setError("Enter the number of loads — the package price is charged per load.");
      return;
    }
    const shortages = stockShortages();
    if (shortages.length > 0) {
      setError(`Not enough stock — ${shortages.join(", ")}.`);
      return;
    }
    setError(null);
    setShowDialog(true);
  }

  async function confirmOrder() {
    const shortages = stockShortages();
    if (shortages.length > 0) {
      setError(`Not enough stock — ${shortages.join(", ")}.`);
      return;
    }
    if (scPwdApplied && !scPwdIdNo.trim()) {
      setError("Enter the SC/PWD ID number, or turn off the SC/PWD discount.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      let customerId: number | null = selectedCustomerId;
      if (customerId == null && customerQuery.trim()) {
        const res = await execute("INSERT INTO customers (full_name) VALUES (?)", [customerQuery.trim()]);
        customerId = Number(res.lastInsertId);
      }

      const orderNumber = `ORD-${Date.now()}`;
      const appliedAmount = Math.min(amountPaid, grandTotal);

      const orderRes = await execute(
        `INSERT INTO orders (
           branch_id, customer_id, order_number, subtotal, discount_total, grand_total, amount_paid, payment_status,
           kg, loads, package_id, package_loads, promo_id, created_by, drop_off_at,
           vat_status, sc_pwd_id_no, sc_pwd_name, sc_pwd_discount_amount
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          currentUser?.branch_id ?? 1,
          customerId,
          orderNumber,
          total,
          discountValue,
          grandTotal,
          appliedAmount,
          paymentStatus,
          kg ? Number(kg) : null,
          loads ? Number(loads) : null,
          selectedPackageId,
          selectedPackageId ? packageLoads : null,
          appliedPromo?.id ?? null,
          currentUser?.id ?? null,
          toEntryTimestamp(orderDate),
          orderVatStatus,
          scPwdApplied ? scPwdIdNo.trim() || null : null,
          scPwdApplied ? scPwdName.trim() || null : null,
          scPwdDiscount,
        ],
      );
      const orderId = Number(orderRes.lastInsertId);

      if (appliedPromo) {
        await execute("UPDATE promos SET times_used = times_used + 1 WHERE id = ?", [appliedPromo.id]);
      }

      // Redeem points against this order — recorded as a negative 'redeem' event, distinct
      // from 'earn' events, so monthly points-earned reporting doesn't net against redemptions.
      if (pointsToRedeem > 0 && customerId != null) {
        await execute("UPDATE customers SET redeemed_points = redeemed_points + ? WHERE id = ?", [
          pointsToRedeem,
          customerId,
        ]);
        await execute(
          "INSERT INTO loyalty_point_events (customer_id, order_id, points, type) VALUES (?, ?, ?, 'redeem')",
          [customerId, orderId, -pointsToRedeem],
        );
      }

      if (selectedPackageId) {
        for (const pi of packageItems) {
          await execute(
            `INSERT INTO order_items (order_id, item_id, description, quantity, unit_price, line_total) VALUES (?, ?, ?, ?, 0, 0)`,
            [orderId, pi.item_id, pi.name, pi.quantity * packageLoads],
          );
          await consumeStock(pi.item_id, pi.branch_id, pi.quantity * packageLoads, orderId, orderNumber);
        }
        for (const ps of packageServices) {
          await execute(
            `INSERT INTO order_items (order_id, service_type_id, description, quantity, unit_price, line_total) VALUES (?, ?, ?, ?, 0, 0)`,
            [orderId, ps.service_type_id, ps.name, ps.quantity * packageLoads],
          );
        }
      }

      for (const s of selectedServices) {
        const qty = serviceLines[s.id];
        await execute(
          `INSERT INTO order_items (order_id, service_type_id, description, quantity, unit_price, line_total) VALUES (?, ?, ?, ?, ?, ?)`,
          [orderId, s.id, s.name, qty, s.price, s.price * qty],
        );
      }
      for (const it of selectedItems) {
        const price = retailPrice(it);
        const qty = itemLines[it.id];
        await execute(
          `INSERT INTO order_items (order_id, item_id, description, quantity, unit_price, line_total) VALUES (?, ?, ?, ?, ?, ?)`,
          [orderId, it.id, it.name, qty, price, price * qty],
        );
        await consumeStock(it.id, it.branch_id, qty, orderId, orderNumber);
      }
      for (const a of selectedAddOnsList) {
        await execute(
          `INSERT INTO order_items (order_id, add_on_id, description, quantity, unit_price, line_total) VALUES (?, ?, ?, 1, ?, ?)`,
          [orderId, a.id, a.name, a.price, a.price],
        );
      }

      if (appliedAmount > 0) {
        await execute("INSERT INTO payments (order_id, amount, method, received_by) VALUES (?, ?, ?, ?)", [
          orderId,
          appliedAmount,
          paymentMethod,
          currentUser?.id ?? null,
        ]);
      }

      await execute(
        `INSERT INTO cashflow_entries (branch_id, entry_type, source, source_id, amount, description, method, entry_date)
         VALUES (1, 'income', 'sale', ?, ?, ?, ?, ?)`,
        [orderId, grandTotal, `Order ${orderNumber}`, paymentMethod, toEntryTimestamp(orderDate)],
      );

      // Award loyalty points for identified customers only (walk-ins have no customer record
      // to award to), computed off the post-discount grand total (what the order is actually
      // worth after any points redeemed on it) so redeeming and immediately re-earning on the
      // same money isn't possible. Logged to loyalty_point_events (not just the running total)
      // so "points earned this month" stays accurate even if the rate is changed later.
      if (customerId != null && loyaltySettings) {
        const earned =
          loyaltySettings.mode === "flat"
            ? loyaltySettings.flat_points_per_order
            : Math.floor(grandTotal / (loyaltySettings.amount_per_point || 1));
        if (earned > 0) {
          await execute(
            "INSERT INTO loyalty_point_events (customer_id, order_id, points, type) VALUES (?, ?, ?, 'earn')",
            [customerId, orderId, earned],
          );
          await execute("UPDATE customers SET loyalty_points = loyalty_points + ? WHERE id = ?", [
            earned,
            customerId,
          ]);
        }
      }

      const [orderRows, itemRows] = await Promise.all([
        select<Order>("SELECT * FROM orders WHERE id = ?", [orderId]),
        select<OrderItem>("SELECT * FROM order_items WHERE order_id = ?", [orderId]),
      ]);
      const savedOrderRow = orderRows[0] ?? null;
      setSavedOrder(savedOrderRow);
      setSavedItems(itemRows);
      let customerRow: Customer | null = null;
      if (customerId != null) {
        const [row] = await select<Customer>("SELECT * FROM customers WHERE id = ?", [customerId]);
        customerRow = row ?? null;
      }
      setSavedCustomer(customerRow);

      // Print load tags right away — the order's already saved at this point, so a printer
      // hiccup here shouldn't surface as an order-creation failure (see the dialog's own
      // error/reprint affordance for that case).
      if (savedOrderRow) {
        await printLoadTagsForOrder(savedOrderRow, itemRows, customerRow);
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setSaving(false);
    }
  }

  async function printLoadTagsForOrder(order: Order, items: OrderItem[], customer: Customer | null) {
    const loadCount = order.loads ?? 0;
    if (loadCount <= 0) return;
    setLoadTagsPrinting(true);
    setLoadTagsError(null);
    try {
      const tags = await getOrAssignLoadTags(order.id, loadCount, orderDate);
      setSavedLoadTags(tags);
      const printers = await listPairedPrinters();
      const printer = resolveSelectedPrinter(printers);
      if (!printer) {
        setLoadTagsError(
          printers && printers.length > 1
            ? "Multiple printers paired — select one in Printer Settings, then reprint below."
            : "No paired printer found — load tags weren't printed. Pair one in Bluetooth settings, then reprint below.",
        );
        return;
      }
      await printLoadTags(printer, {
        businessName: "WashSuite",
        order,
        items,
        customer,
        pkg: selectedPackage,
        tags,
      });
    } catch (err) {
      setLoadTagsError(String(err));
    } finally {
      setLoadTagsPrinting(false);
    }
  }

  async function handlePrint() {
    if (!savedOrder) return;
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
        order: savedOrder,
        items: savedItems,
        customer: savedCustomer,
        pkg: selectedPackage,
      });
    } catch (err) {
      setPrintError(String(err));
    } finally {
      setPrinting(false);
    }
  }

  async function handleDownloadInvoice() {
    if (!savedOrder || !branch) return;
    setInvoicing("pdf");
    setInvoiceError(null);
    try {
      const invoiceNumber = await getOrAssignInvoiceNumber(savedOrder.id);
      const invoiceSeries = await getOrderInvoiceSeries(savedOrder.id);
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
        orderNumber: savedOrder.order_number,
        dateLabel: new Date(savedOrder.drop_off_at).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }),
        customerName: savedCustomer?.full_name ?? "Walk-in",
        customerTin: savedCustomer?.tin ?? null,
        customerAddress: savedCustomer?.address ?? null,
        items: buildReceiptLines(savedItems, selectedPackage, savedOrder.package_loads),
        vat: computeVatBreakdown(savedOrder, branch),
        scPwd:
          savedOrder.sc_pwd_discount_amount > 0
            ? { idNo: savedOrder.sc_pwd_id_no, name: savedOrder.sc_pwd_name, discountAmount: savedOrder.sc_pwd_discount_amount }
            : null,
        paymentMethodLabel: paymentMethod === "cash" ? "Cash" : "E-wallet",
        referenceNo: null,
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
    if (!savedOrder || !branch) return;
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
      const invoiceNumber = await getOrAssignInvoiceNumber(savedOrder.id);
      const invoiceSeries = await getOrderInvoiceSeries(savedOrder.id);
      await printInvoice(printer, {
        branch,
        order: savedOrder,
        items: savedItems,
        customer: savedCustomer,
        pkg: selectedPackage,
        invoiceNumber,
        orSeriesLabel: invoiceSeries
          ? `${formatInvoiceNumber(invoiceSeries.seriesStart)}-${formatInvoiceNumber(invoiceSeries.seriesEnd)}`
          : null,
        birPermitNo: invoiceSeries?.permitNo ?? branch.bir_permit_no,
        paymentMethodLabel: paymentMethod === "cash" ? "Cash" : "E-wallet",
        referenceNo: null,
      });
    } catch (err) {
      setInvoiceError(String(err));
    } finally {
      setInvoicing(null);
    }
  }

  function closeDialog() {
    setShowDialog(false);
    if (savedOrder) navigate("/sales");
  }

  if (loading) {
    return <p className="py-10 text-center text-sm text-ink/40">Loading…</p>;
  }

  return (
    <div>
      <div className="sticky top-0 z-10 mb-4 flex items-center gap-2 bg-page pb-2">
        <Link
          to="/sales"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface text-ink shadow-sm"
        >
          <ChevronLeft size={18} strokeWidth={2.2} />
        </Link>
        <h1 className="text-xl font-semibold text-ink">New order</h1>
      </div>

      <form onSubmit={proceed} className="space-y-4">
        <div className="relative rounded-2xl bg-surface p-3.5 shadow-sm">
          <span className="mb-1 block text-xs font-medium text-ink/50">Customer (optional)</span>
          <input
            type="text"
            value={customerQuery}
            onChange={(e) => {
              setCustomerQuery(e.target.value);
              setSelectedCustomerId(null);
              setPointsToRedeemInput("");
            }}
            placeholder="Search or type a new name…"
            className="w-full text-sm font-medium text-ink outline-none placeholder:text-ink/30"
          />
          {customerMatches.length > 0 && (
            <div className="absolute inset-x-0 top-full z-10 mt-1 max-h-52 overflow-y-auto rounded-2xl bg-surface p-1.5 shadow-lg">
              {customerMatches.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => {
                    setSelectedCustomerId(c.id);
                    setCustomerQuery(c.full_name);
                  }}
                  className="block w-full rounded-xl px-3 py-2 text-left text-sm text-ink hover:bg-brand-200/30"
                >
                  {c.full_name}
                  {c.phone && <span className="text-ink/40"> · {c.phone}</span>}
                </button>
              ))}
            </div>
          )}
          {customerQuery.trim() && selectedCustomerId == null && customerMatches.length === 0 && (
            <p className="mt-1 text-xs text-ink/40">
              No match — "{customerQuery.trim()}" will be saved as a new customer.
            </p>
          )}
          {selectedCustomer && (
            <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-700">
              <Star size={12} strokeWidth={2.4} />
              {selectedCustomer.loyalty_points} pts
            </span>
          )}
        </div>

        <div
          onClick={() => orderDateRef.current?.showPicker?.()}
          className="rounded-2xl bg-surface p-3.5 shadow-sm"
        >
          <span className="mb-1 block text-xs font-medium text-ink/50">Order date</span>
          <input
            ref={orderDateRef}
            type="date"
            value={orderDate}
            onChange={(e) => setOrderDate(e.target.value)}
            className="w-full py-1 text-base font-medium text-ink outline-none"
          />
          <span className="mt-1 block text-[11px] text-ink/40">
            Defaults to today — change this only if you're entering an order that was actually dropped off earlier.
          </span>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="block rounded-2xl bg-surface p-3.5 shadow-sm">
            <span className="mb-1 block text-xs font-medium text-ink/50">Kg</span>
            <input
              type="number"
              inputMode="decimal"
              min="0"
              step="any"
              value={kg}
              onChange={(e) => setKg(e.target.value)}
              className="w-full text-sm font-medium text-ink outline-none"
            />
          </label>
          <label className="block rounded-2xl bg-surface p-3.5 shadow-sm">
            <span className="mb-1 block text-xs font-medium text-ink/50">Number of loads</span>
            <input
              type="number"
              inputMode="numeric"
              min="0"
              step="1"
              value={loads}
              onChange={(e) => setLoads(e.target.value)}
              className="w-full text-sm font-medium text-ink outline-none"
            />
          </label>
        </div>

        {packages.length > 0 && (
          <div>
            <p className="mb-2 px-1 text-xs font-semibold tracking-wide text-ink/40 uppercase">
              Start with a package <span className="normal-case font-normal text-ink/30">(optional)</span>
            </p>
            <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
              {packages.map((p) => {
                const checked = p.id === selectedPackageId;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setSelectedPackageId(checked ? null : p.id)}
                    className={
                      "flex w-28 shrink-0 flex-col overflow-hidden rounded-2xl bg-surface text-left shadow-sm ring-2 transition-colors " +
                      (checked ? "ring-brand-500" : "ring-transparent")
                    }
                  >
                    {p.image ? (
                      <img src={p.image} alt={p.name} className="h-20 w-full object-cover" />
                    ) : (
                      <div className="flex h-20 w-full items-center justify-center bg-brand-200/40 text-brand-600">
                        <Layers size={22} strokeWidth={1.5} />
                      </div>
                    )}
                    <div className="p-2">
                      <p className="truncate text-xs font-semibold text-ink">{p.name}</p>
                      <p className="text-xs font-semibold text-brand-500">₱{p.price.toFixed(2)}</p>
                    </div>
                  </button>
                );
              })}
            </div>
            {selectedPackage && (
              <p className="mt-2 px-1 text-xs font-medium text-brand-500">
                ₱{selectedPackage.price.toFixed(2)} × {packageLoads} load{packageLoads === 1 ? "" : "s"} = ₱{packagePrice.toFixed(2)}
              </p>
            )}
            {selectedPackage && (packageItems.length > 0 || packageServices.length > 0) && (
              <p className="mt-2 px-1 text-xs text-ink/50">
                <span className="text-ink/40">Includes (per load): </span>
                {[...packageServices.map((s) => `${s.name} × ${s.quantity} ${s.unit}`), ...packageItems.map((it) => `${it.name} × ${it.quantity} ${it.unit}`)].join(
                  ", ",
                )}
              </p>
            )}
          </div>
        )}

        <div>
          <p className="mb-2 px-1 text-xs font-semibold tracking-wide text-ink/40 uppercase">
            Add to order <span className="normal-case font-normal text-ink/30">(services, items, add-ons)</span>
          </p>
          <label className="mb-2 flex items-center gap-2 rounded-2xl bg-surface px-3.5 py-2.5 shadow-sm">
            <Search size={16} strokeWidth={2.2} className="text-ink/30" />
            <input
              type="text"
              value={catalogQuery}
              onChange={(e) => setCatalogQuery(e.target.value)}
              placeholder="Search anything to add…"
              className="w-full text-sm text-ink outline-none placeholder:text-ink/30"
            />
          </label>

          {filteredCatalog.length === 0 && (
            <p className="py-4 text-center text-xs text-ink/40">Nothing found.</p>
          )}

          <div className="flex flex-wrap gap-1.5">
            {filteredCatalog.map((entry) => {
              const checked = isSelected(entry);
              const Icon = KIND_ICON[entry.kind];
              return (
                <button
                  key={`${entry.kind}-${entry.id}`}
                  type="button"
                  onClick={() => toggleEntry(entry)}
                  className={
                    "flex items-center gap-1.5 rounded-full py-1.5 pr-3 pl-2 text-xs font-medium shadow-sm transition-colors " +
                    (checked ? "bg-brand-500 text-white" : "bg-surface text-ink")
                  }
                >
                  <Icon size={13} strokeWidth={2.2} className={checked ? "text-white" : "text-brand-500"} />
                  {entry.name}
                </button>
              );
            })}
          </div>
        </div>

        {(selectedPackageId || selectedServices.length > 0 || selectedItems.length > 0 || selectedAddOnsList.length > 0) && (
          <div>
            <p className="mb-2 px-1 text-xs font-semibold tracking-wide text-ink/40 uppercase">In this order</p>
            {(selectedServices.length > 0 || selectedItems.length > 0 || selectedAddOnsList.length > 0) && (
              <div className="flex flex-wrap gap-2">
                {selectedServices.map((s) => (
                  <CartCard
                    key={`service-${s.id}`}
                    name={s.name}
                    unit={s.unit}
                    price={s.price}
                    qty={serviceLines[s.id]}
                    onInc={() => setServiceLines((prev) => ({ ...prev, [s.id]: prev[s.id] + 1 }))}
                    onDec={() =>
                      setServiceLines((prev) => {
                        const qty = prev[s.id] - 1;
                        if (qty <= 0) {
                          const next = { ...prev };
                          delete next[s.id];
                          return next;
                        }
                        return { ...prev, [s.id]: qty };
                      })
                    }
                    onRemove={() =>
                      setServiceLines((prev) => {
                        const next = { ...prev };
                        delete next[s.id];
                        return next;
                      })
                    }
                  />
                ))}
                {selectedItems.map((it) => {
                  const step = it.dose_size > 0 ? it.dose_size : 1;
                  return (
                  <CartCard
                    key={`item-${it.id}`}
                    name={it.name}
                    unit={it.unit}
                    price={retailPrice(it)}
                    qty={itemLines[it.id]}
                    doseSize={it.dose_size > 0 ? it.dose_size : undefined}
                    doseLabel={it.dose_label}
                    onInc={() => setItemLines((prev) => ({ ...prev, [it.id]: roundQty(prev[it.id] + step) }))}
                    onDec={() =>
                      setItemLines((prev) => {
                        const qty = roundQty(prev[it.id] - step);
                        if (qty <= 0) {
                          const next = { ...prev };
                          delete next[it.id];
                          return next;
                        }
                        return { ...prev, [it.id]: qty };
                      })
                    }
                    onRemove={() =>
                      setItemLines((prev) => {
                        const next = { ...prev };
                        delete next[it.id];
                        return next;
                      })
                    }
                  />
                  );
                })}
                {selectedAddOnsList.map((a) => (
                  <CartCard
                    key={`addon-${a.id}`}
                    name={a.name}
                    price={a.price}
                    onRemove={() =>
                      setSelectedAddOnIds((prev) => {
                        const next = new Set(prev);
                        next.delete(a.id);
                        return next;
                      })
                    }
                  />
                ))}
              </div>
            )}

            {eligiblePromos.length > 0 && (
              <div
                className={
                  selectedServices.length > 0 || selectedItems.length > 0 || selectedAddOnsList.length > 0
                    ? "mt-3 border-t border-ink/10 pt-3"
                    : ""
                }
              >
                <p className="mb-2 px-1 text-xs font-semibold tracking-wide text-ink/40 uppercase">
                  Promo <span className="normal-case font-normal text-ink/30">(tap to toggle)</span>
                </p>
                <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
                  {eligiblePromos.map((p) => {
                    const checked = appliedPromo?.id === p.id;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => togglePromo(p)}
                        className={
                          "flex w-20 shrink-0 flex-col overflow-hidden rounded-xl bg-surface text-left shadow-sm ring-2 transition-colors " +
                          (checked ? "ring-brand-500" : "ring-transparent")
                        }
                      >
                        <div className="flex h-8 w-full items-center justify-center bg-brand-200/40 text-brand-600">
                          <Tag size={13} strokeWidth={2.2} />
                        </div>
                        <div className="p-1.5">
                          <p className="truncate text-[11px] font-semibold text-ink">{p.name}</p>
                          <p className="truncate text-[10px] font-semibold text-brand-500">
                            {p.discount_type === "percent"
                              ? `${p.discount_value}% off`
                              : `₱${p.discount_value.toFixed(2)} off`}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        <div className="rounded-2xl bg-gradient-to-br from-brand-600 to-brand-500 p-4 text-white shadow-sm">
          {promoDiscount > 0 ? (
            <>
              <div className="flex items-center justify-between text-xs text-white/70">
                <span>Subtotal</span>
                <span>₱{total.toFixed(2)}</span>
              </div>
              <div className="flex items-center justify-between text-xs text-white/70">
                <span>Promo discount</span>
                <span>-₱{promoDiscount.toFixed(2)}</span>
              </div>
              <div className="mt-1 flex items-center justify-between border-t border-white/20 pt-1">
                <span className="text-xs font-medium text-white/70">Total</span>
                <span className="text-2xl font-semibold">₱{totalAfterPromo.toFixed(2)}</span>
              </div>
            </>
          ) : (
            <>
              <p className="text-xs font-medium text-white/70">Total</p>
              <p className="mt-0.5 text-2xl font-semibold">₱{total.toFixed(2)}</p>
            </>
          )}
          {selectedPackage && extrasTotal > 0 && (
            <p className="mt-1 text-xs text-white/70">
              {selectedPackage.name} ({packageLoads > 1 ? `${packageLoads} loads, ` : ""}₱{packagePrice.toFixed(2)}) +₱{extrasTotal.toFixed(2)} extras
            </p>
          )}
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          className="w-full rounded-2xl bg-brand-500 py-3 text-sm font-semibold text-white shadow-sm"
        >
          Proceed
        </button>
      </form>

      {showDialog && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center">
          <div className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-t-[28px] bg-surface-muted p-4 shadow-xl sm:rounded-[28px]">
            {savedOrder ? (
              <div>
                <div className="mb-4 flex flex-col items-center text-center">
                  <span className="mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                    <Check size={22} strokeWidth={2.6} />
                  </span>
                  <h2 className="text-lg font-semibold text-ink">Order created</h2>
                  <p className="text-xs text-ink/50">{savedOrder.order_number}</p>
                </div>

                <div className="mb-4 rounded-2xl bg-gradient-to-br from-brand-600 to-brand-500 p-4 text-white shadow-sm">
                  <p className="text-xs font-medium text-white/70">Total</p>
                  <p className="mt-0.5 text-2xl font-semibold">₱{savedOrder.grand_total.toFixed(2)}</p>
                  <p className="mt-1 text-xs text-white/80">
                    {savedOrder.payment_status === "paid"
                      ? "Fully paid"
                      : savedOrder.payment_status === "partial"
                        ? `Paid ₱${savedOrder.amount_paid.toFixed(2)} — balance ₱${(savedOrder.grand_total - savedOrder.amount_paid).toFixed(2)}`
                        : "Unpaid"}
                  </p>
                </div>

                {(savedOrder.loads ?? 0) > 0 && (
                  <div className="mb-3 rounded-2xl bg-surface p-3.5 shadow-sm">
                    <p className="text-xs font-medium text-ink/50">Load tags</p>
                    {loadTagsPrinting ? (
                      <p className="mt-1 text-sm text-ink/60">Printing tags…</p>
                    ) : savedLoadTags.length > 0 ? (
                      <p className="mt-1 text-sm text-ink">
                        #{savedLoadTags[0].daily_number}
                        {savedLoadTags.length > 1 && `–#${savedLoadTags[savedLoadTags.length - 1].daily_number}`}
                        {" "}
                        <span className="text-ink/40">
                          ({savedLoadTags.length} load{savedLoadTags.length === 1 ? "" : "s"})
                        </span>
                      </p>
                    ) : null}
                    {loadTagsError && <p className="mt-1 text-sm text-red-600">{loadTagsError}</p>}
                    <button
                      type="button"
                      onClick={() => printLoadTagsForOrder(savedOrder, savedItems, savedCustomer)}
                      disabled={loadTagsPrinting}
                      className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-xl border border-brand-500/30 py-2 text-xs font-semibold text-brand-500 disabled:opacity-60"
                    >
                      <Tag size={13} strokeWidth={2.2} />
                      {savedLoadTags.length > 0 ? "Reprint load tags" : "Print load tags"}
                    </button>
                  </div>
                )}

                {printError && <p className="mb-3 text-sm text-red-600">{printError}</p>}

                <div className="mb-2 flex gap-2">
                  {!branch?.hide_print_receipt && (
                    <button
                      type="button"
                      onClick={handlePrint}
                      disabled={printing}
                      className="flex flex-1 items-center justify-center gap-1.5 rounded-2xl bg-surface py-3 text-sm font-semibold text-ink shadow-sm disabled:opacity-60"
                    >
                      <Printer size={16} strokeWidth={2.2} />
                      {printing ? "Printing…" : "Print receipt"}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={closeDialog}
                    className="flex-1 rounded-2xl bg-brand-500 py-3 text-sm font-semibold text-white shadow-sm"
                  >
                    Done
                  </button>
                </div>

                {invoiceError && <p className="mb-2 text-sm text-red-600">{invoiceError}</p>}
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleDownloadInvoice}
                    disabled={invoicing !== null}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-2xl border border-brand-500/30 bg-surface py-2.5 text-xs font-semibold text-brand-500 shadow-sm disabled:opacity-60"
                  >
                    {invoicing === "pdf" ? "Generating…" : "Download Invoice PDF"}
                  </button>
                  <button
                    type="button"
                    onClick={handlePrintInvoice}
                    disabled={invoicing !== null}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-2xl border border-brand-500/30 bg-surface py-2.5 text-xs font-semibold text-brand-500 shadow-sm disabled:opacity-60"
                  >
                    <Printer size={14} strokeWidth={2.2} />
                    {invoicing === "thermal" ? "Printing…" : "Print Invoice"}
                  </button>
                </div>
              </div>
            ) : (
              <div>
                <h2 className="mb-3 text-lg font-semibold text-ink">Order summary</h2>

                <div className="mb-3 space-y-1 rounded-2xl bg-surface p-3.5 shadow-sm">
                  <p className="text-sm text-ink">
                    <span className="text-ink/40">Customer: </span>
                    {selectedCustomerId
                      ? customers.find((c) => c.id === selectedCustomerId)?.full_name
                      : customerQuery.trim() || "Walk-in"}
                  </p>
                  {(kg || loads) && (
                    <p className="text-sm text-ink">
                      <span className="text-ink/40">Load: </span>
                      {kg && `${kg} kg`}
                      {kg && loads && " · "}
                      {loads && `${loads} load${Number(loads) === 1 ? "" : "s"}`}
                    </p>
                  )}
                </div>

                <div className="mb-3 space-y-1.5">
                  {selectedPackage && (
                    <div className="flex items-center justify-between rounded-xl bg-surface px-3.5 py-2.5 shadow-sm">
                      <p className="text-sm font-medium text-ink">{selectedPackage.name} (package)</p>
                      <span className="text-sm font-semibold text-ink">₱{packagePrice.toFixed(2)}</span>
                    </div>
                  )}
                  {packageServices.map((ps) => (
                    <div
                      key={`pkg-service-${ps.service_type_id}`}
                      className="flex items-center justify-between rounded-xl bg-surface px-3.5 py-2 pl-6 shadow-sm"
                    >
                      <p className="text-xs text-ink/60">
                        {ps.name} × {ps.quantity} {ps.unit}
                      </p>
                      <span className="text-xs text-ink/40">included</span>
                    </div>
                  ))}
                  {packageItems.map((pi) => (
                    <div
                      key={`pkg-item-${pi.item_id}`}
                      className="flex items-center justify-between rounded-xl bg-surface px-3.5 py-2 pl-6 shadow-sm"
                    >
                      <p className="text-xs text-ink/60">
                        {pi.name} × {pi.quantity} {pi.unit}
                      </p>
                      <span className="text-xs text-ink/40">included</span>
                    </div>
                  ))}
                  {selectedServices.map((s) => (
                    <div key={s.id} className="flex items-center justify-between rounded-xl bg-surface px-3.5 py-2.5 shadow-sm">
                      <p className="text-sm font-medium text-ink">
                        {s.name} × {serviceLines[s.id]} {s.unit}
                      </p>
                      <span className="text-sm font-semibold text-ink">
                        ₱{(s.price * serviceLines[s.id]).toFixed(2)}
                      </span>
                    </div>
                  ))}
                  {selectedItems.map((it) => {
                    const qty = itemLines[it.id];
                    const doseCount = it.dose_size > 0 ? Math.round(qty / it.dose_size) : null;
                    const qtyLabel =
                      doseCount != null ? `${doseCount} × ${it.dose_label || doseFallbackLabel(it.dose_size, it.unit)}` : `${qty} ${it.unit}`;
                    return (
                      <div key={it.id} className="flex items-center justify-between rounded-xl bg-surface px-3.5 py-2.5 shadow-sm">
                        <p className="text-sm font-medium text-ink">
                          {it.name} × {qtyLabel}
                        </p>
                        <span className="text-sm font-semibold text-ink">₱{(retailPrice(it) * qty).toFixed(2)}</span>
                      </div>
                    );
                  })}
                  {selectedAddOnsList.map((a) => (
                    <div key={a.id} className="flex items-center justify-between rounded-xl bg-surface px-3.5 py-2.5 shadow-sm">
                      <p className="text-sm font-medium text-ink">{a.name}</p>
                      <span className="text-sm font-semibold text-ink">₱{a.price.toFixed(2)}</span>
                    </div>
                  ))}
                </div>

                {selectedCustomer && maxRedeemable > 0 && (
                  <div className="mb-3 rounded-2xl bg-surface p-3.5 shadow-sm">
                    <div className="mb-1 flex items-center justify-between">
                      <span className="flex items-center gap-1.5 text-xs font-medium text-ink/50">
                        <Star size={13} strokeWidth={2.4} className="text-amber-500" />
                        Redeem points ({availablePoints} available)
                      </span>
                      <button
                        type="button"
                        onClick={() => setPointsToRedeemInput(String(maxRedeemable))}
                        className="text-xs font-semibold text-brand-500"
                      >
                        Use max ({maxRedeemable})
                      </button>
                    </div>
                    <input
                      type="number"
                      inputMode="numeric"
                      min="0"
                      max={maxRedeemable}
                      value={pointsToRedeemInput}
                      onChange={(e) => setPointsToRedeemInput(e.target.value)}
                      placeholder="0"
                      className="w-full rounded-xl bg-surface-muted px-3 py-2.5 text-sm font-medium text-ink outline-none"
                    />
                    {pointsToRedeem > 0 && (
                      <p className="mt-1.5 text-xs font-semibold text-emerald-600">
                        -₱{loyaltyDiscount.toFixed(2)} off this order
                      </p>
                    )}
                  </div>
                )}

                <div className="mb-3 rounded-2xl bg-surface p-3.5 shadow-sm">
                  <button
                    type="button"
                    onClick={toggleScPwd}
                    className="flex w-full items-center justify-between"
                  >
                    <span className="flex items-center gap-1.5 text-xs font-medium text-ink/50">
                      <IdCard size={13} strokeWidth={2.4} className="text-brand-500" />
                      Senior Citizen / PWD discount
                    </span>
                    <span
                      className={
                        "flex h-5 w-9 shrink-0 items-center rounded-full px-0.5 transition-colors " +
                        (scPwdApplied ? "justify-end bg-brand-500" : "justify-start bg-ink/15")
                      }
                    >
                      <span className="h-4 w-4 rounded-full bg-white shadow-sm" />
                    </span>
                  </button>
                  {scPwdApplied ? (
                    <div className="mt-2.5 space-y-2">
                      <input
                        value={scPwdIdNo}
                        onChange={(e) => setScPwdIdNo(e.target.value)}
                        placeholder="SC/PWD ID number"
                        className="w-full rounded-xl bg-surface-muted px-3.5 py-2.5 text-sm font-medium text-ink outline-none placeholder:text-ink/30"
                      />
                      <input
                        value={scPwdName}
                        onChange={(e) => setScPwdName(e.target.value)}
                        placeholder="Name on ID"
                        className="w-full rounded-xl bg-surface-muted px-3.5 py-2.5 text-sm font-medium text-ink outline-none placeholder:text-ink/30"
                      />
                      <p className="text-xs font-semibold text-emerald-600">
                        -₱{scPwdDiscount.toFixed(2)} off this order · VAT-exempt · replaces promo/points discounts
                      </p>
                    </div>
                  ) : (
                    !!branch?.vat_registered && (
                      <div className="mt-2.5 flex gap-1.5">
                        {(["vatable", "vat_exempt", "zero_rated"] as VatStatus[]).map((status) => (
                          <button
                            key={status}
                            type="button"
                            onClick={() => setManualVatStatus(status)}
                            className={
                              "flex-1 rounded-xl py-1.5 text-[11px] font-semibold " +
                              (manualVatStatus === status ? "bg-brand-500 text-white" : "bg-surface-muted text-ink/50")
                            }
                          >
                            {status === "vatable" ? "Vatable" : status === "vat_exempt" ? "VAT-exempt" : "Zero-rated"}
                          </button>
                        ))}
                      </div>
                    )
                  )}
                </div>

                <div className="mb-3 rounded-2xl bg-gradient-to-br from-brand-600 to-brand-500 p-4 text-white shadow-sm">
                  {discountValue > 0 ? (
                    <>
                      <div className="flex items-center justify-between text-xs text-white/70">
                        <span>Subtotal</span>
                        <span>₱{total.toFixed(2)}</span>
                      </div>
                      {promoDiscount > 0 && (
                        <div className="flex items-center justify-between text-xs text-white/70">
                          <span>Promo discount</span>
                          <span>-₱{promoDiscount.toFixed(2)}</span>
                        </div>
                      )}
                      {loyaltyDiscount > 0 && (
                        <div className="flex items-center justify-between text-xs text-white/70">
                          <span>Points discount</span>
                          <span>-₱{loyaltyDiscount.toFixed(2)}</span>
                        </div>
                      )}
                      {scPwdDiscount > 0 && (
                        <div className="flex items-center justify-between text-xs text-white/70">
                          <span>SC/PWD discount</span>
                          <span>-₱{scPwdDiscount.toFixed(2)}</span>
                        </div>
                      )}
                      <div className="mt-1 flex items-center justify-between border-t border-white/20 pt-1">
                        <span className="text-xs font-medium text-white/70">Total</span>
                        <span className="text-2xl font-semibold">₱{grandTotal.toFixed(2)}</span>
                      </div>
                    </>
                  ) : (
                    <>
                      <p className="text-xs font-medium text-white/70">Total</p>
                      <p className="mt-0.5 text-2xl font-semibold">₱{grandTotal.toFixed(2)}</p>
                    </>
                  )}
                </div>

                <div className="mb-3 rounded-2xl bg-surface p-3.5 shadow-sm">
                  <span className="mb-2 block text-xs font-medium text-ink/50">Payment method</span>
                  <div className="flex gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        setPaymentMethod("cash");
                        setAmountPaidInput("");
                      }}
                      className={
                        "flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2 text-sm font-semibold transition-colors " +
                        (paymentMethod === "cash" ? "bg-brand-500 text-white" : "bg-surface-muted text-ink/60")
                      }
                    >
                      <Banknote size={15} strokeWidth={2.2} />
                      Cash
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setPaymentMethod("gcash");
                        setAmountPaidInput("");
                      }}
                      className={
                        "flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2 text-sm font-semibold transition-colors " +
                        (paymentMethod === "gcash" ? "bg-brand-500 text-white" : "bg-surface-muted text-ink/60")
                      }
                    >
                      <Smartphone size={15} strokeWidth={2.2} />
                      E-wallet
                    </button>
                  </div>

                  {paymentMethod === "cash" ? (
                    <div className="mt-3">
                      <div className="mb-1 flex items-center justify-between">
                        <span className="text-xs font-medium text-ink/50">Amount paid</span>
                        <button
                          type="button"
                          onClick={() => setAmountPaidInput(grandTotal ? String(grandTotal) : "")}
                          className="rounded-full bg-brand-500/10 px-2.5 py-1 text-xs font-semibold text-brand-500 transition-colors active:bg-brand-500/20"
                        >
                          Full amount
                        </button>
                      </div>
                      <input
                        type="number"
                        inputMode="decimal"
                        min="0"
                        step="any"
                        value={amountPaidInput}
                        onChange={(e) => setAmountPaidInput(e.target.value)}
                        placeholder="0.00"
                        className="w-full rounded-xl bg-surface-muted px-3 py-2.5 text-sm font-medium text-ink outline-none"
                      />
                      {amountPaid > 0 &&
                        (change > 0 ? (
                          <p className="mt-2 text-sm font-semibold text-emerald-600">Change: ₱{change.toFixed(2)}</p>
                        ) : balanceDue > 0 ? (
                          <p className="mt-2 text-sm font-semibold text-amber-600">
                            Balance due: ₱{balanceDue.toFixed(2)}
                          </p>
                        ) : (
                          <p className="mt-2 text-sm font-semibold text-emerald-600">Fully paid</p>
                        ))}
                    </div>
                  ) : (
                    <div className="mt-3">
                      {branch?.gcash_qr_image && (
                        <div className="mb-3 flex flex-col items-center rounded-xl bg-surface-muted p-3">
                          <img
                            src={branch.gcash_qr_image}
                            alt="E-wallet QR code"
                            className="h-40 w-40 rounded-lg bg-white object-contain"
                          />
                          <span className="mt-2 text-xs font-medium text-ink/50">Scan to pay via E-wallet</span>
                        </div>
                      )}
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={amountPaid >= grandTotal && grandTotal > 0}
                          onChange={(e) => setAmountPaidInput(e.target.checked ? String(grandTotal) : "")}
                          className="h-4 w-4 accent-brand-500"
                        />
                        <span className="text-sm font-medium text-ink">Paid via E-wallet</span>
                      </label>
                    </div>
                  )}
                </div>

                {error && <p className="mb-3 text-sm text-red-600">{error}</p>}

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setShowDialog(false)}
                    disabled={saving}
                    className="flex-1 rounded-2xl bg-surface py-3 text-sm font-semibold text-ink shadow-sm disabled:opacity-60"
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    onClick={confirmOrder}
                    disabled={saving}
                    className="flex-1 rounded-2xl bg-brand-500 py-3 text-sm font-semibold text-white shadow-sm disabled:opacity-60"
                  >
                    {saving ? "Saving…" : "Confirm order"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function CartCard({
  name,
  unit,
  price,
  qty,
  doseSize,
  doseLabel,
  onInc,
  onDec,
  onRemove,
}: {
  name: string;
  unit?: string | null;
  price: number;
  qty?: number;
  doseSize?: number;
  doseLabel?: string | null;
  onInc?: () => void;
  onDec?: () => void;
  onRemove: () => void;
}) {
  const hasQty = qty !== undefined;
  const lineTotal = hasQty ? price * qty : price;
  // With a dose size configured, show a whole-number count of doses (e.g. "2 × 30ml")
  // instead of the raw fractional-unit quantity (e.g. "0.06 liter") staff would have to
  // mentally convert.
  const doseCount = hasQty && doseSize ? Math.round(qty / doseSize) : null;
  return (
    <div className="w-56 shrink-0 rounded-2xl bg-surface p-3 shadow-sm">
      <div className="flex items-start justify-between gap-1">
        <p className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">{name}</p>
        <button
          type="button"
          onClick={onRemove}
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-red-500"
          aria-label={`Remove ${name}`}
        >
          <X size={12} strokeWidth={2.6} />
        </button>
      </div>
      <p className="mt-0.5 text-xs text-ink/40">
        ₱{price.toFixed(2)}
        {unit ? ` / ${unit}` : ""}
      </p>
      <p className="mt-1 text-sm font-semibold text-ink">₱{lineTotal.toFixed(2)}</p>
      {hasQty && onInc && onDec && (
        <div className="mt-2 flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={onDec}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface-muted text-ink active:bg-brand-200"
            aria-label={`Decrease ${name} quantity`}
          >
            <ChevronDown size={20} strokeWidth={2.6} />
          </button>
          <span className="min-w-0 flex-1 truncate text-center text-base font-semibold text-ink">
            {doseCount != null ? `${doseCount} × ${doseLabel || doseFallbackLabel(doseSize!, unit ?? "")}` : qty}
          </span>
          <button
            type="button"
            onClick={onInc}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface-muted text-ink active:bg-brand-200"
            aria-label={`Increase ${name} quantity`}
          >
            <ChevronUp size={20} strokeWidth={2.6} />
          </button>
        </div>
      )}
    </div>
  );
}
