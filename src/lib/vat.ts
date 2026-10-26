import type { Branch, Order, VatStatus } from "../types";

/**
 * BIR SC/PWD statutory discount (RA 9994 / RA 10754), statutory rate 20%. For a VAT-registered
 * seller, the price already includes 12% VAT, and the sale becomes VAT-exempt for this
 * transaction, so VAT is stripped out first (÷1.12) before the discount applies to what's left.
 * For a non-VAT seller there was never a VAT component to strip -- the listed price is already
 * the base -- so the discount applies directly to it. Cannot be combined with promo/loyalty
 * discounts on the same order.
 *
 * discountPercent comes from branches.sc_pwd_discount_percent (Settings > SC/PWD Discount) rather
 * than being hardcoded, in case the statutory rate ever changes -- defaults to 20 to match the
 * law as it stands.
 */
export function computeScPwdPricing(
  priceAmount: number,
  vatRegistered: boolean,
  discountPercent: number = 20,
): {
  discountBase: number;
  scPwdDiscount: number;
  netTotal: number;
} {
  const discountBase = vatRegistered ? priceAmount / 1.12 : priceAmount;
  const rawDiscount = discountBase * (discountPercent / 100);
  // Round to centavos so grand_total / payments never carry sub-centavo fractions (e.g. 64.2857...).
  const toCents = (n: number) => Math.round(n * 100) / 100;
  return { discountBase, scPwdDiscount: toCents(rawDiscount), netTotal: toCents(discountBase - rawDiscount) };
}

export interface VatBreakdown {
  vatStatus: VatStatus;
  /** Label for the sale-amount line on printed invoices/receipts. */
  label: string;
  vatableSales: number;
  vatExemptSales: number;
  zeroRatedSales: number;
  vatAmount: number;
  /** order.discount_total, shown informationally -- already reflected in totalDue. */
  discountAmount: number;
  totalDue: number;
}

/**
 * Single source of truth for the VAT breakdown printed on invoices, replacing the
 * `grossTotal - grossTotal/1.12` calculation that used to be duplicated in printer.ts
 * and invoiceReport.ts. Branches on the order's own vat_status (set per-transaction,
 * e.g. forced to "vat_exempt" for SC/PWD sales) rather than only the branch-level
 * vat_registered flag.
 */
export function computeVatBreakdown(order: Order, branch: Branch): VatBreakdown {
  const grossTotal = order.grand_total;
  const vatStatus: VatStatus = branch.vat_registered ? order.vat_status : "vat_exempt";

  if (vatStatus === "zero_rated") {
    return {
      vatStatus,
      label: "Sale (Zero-Rated)",
      vatableSales: 0,
      vatExemptSales: 0,
      zeroRatedSales: grossTotal,
      vatAmount: 0,
      discountAmount: order.discount_total,
      totalDue: grossTotal,
    };
  }

  if (vatStatus === "vat_exempt") {
    return {
      vatStatus,
      label: "Sale (VAT-exempt/Non-VAT)",
      vatableSales: 0,
      vatExemptSales: grossTotal,
      zeroRatedSales: 0,
      vatAmount: 0,
      discountAmount: order.discount_total,
      totalDue: grossTotal,
    };
  }

  const vatAmount = grossTotal - grossTotal / 1.12;
  return {
    vatStatus,
    label: "Sale (VATable)",
    vatableSales: grossTotal - vatAmount,
    vatExemptSales: 0,
    zeroRatedSales: 0,
    vatAmount,
    discountAmount: order.discount_total,
    totalDue: grossTotal,
  };
}
