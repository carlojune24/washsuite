// Shared domain types, mirroring src-tauri/migrations/0001_init.sql

export interface Branch {
  id: number;
  name: string;
  address: string | null;
  phone: string | null;
  is_active: number;
  tin: string | null;
  email: string | null;
  bir_permit_no: string | null;
  or_series_start: number | null;
  or_series_end: number | null;
  next_invoice_number: number | null;
  vat_registered: number;
  invoice_terms: string | null;
  sc_pwd_discount_percent: number;
  hide_print_receipt: number;
  hide_uninvoiced_sales_in_cashflow: number;
  gcash_qr_image: string | null;
}

export type OrSeriesStatus = "active" | "closed";

/** A registered BIR OR (official receipt) numbering series/booklet. See src/lib/orSeries.ts. */
export interface OrSeries {
  id: number;
  branch_id: number;
  series_start: number;
  series_end: number;
  next_number: number;
  permit_no: string | null;
  registered_at: string;
  status: OrSeriesStatus;
  notes: string | null;
  created_at: string;
}

/** A series number spoiled/damaged before ever being assigned to an order. */
export interface OrSeriesVoid {
  id: number;
  or_series_id: number;
  or_number: number;
  reason: string | null;
  voided_at: string;
  voided_by: number | null;
}

export type Role = "owner" | "manager" | "staff";

export interface User {
  id: number;
  branch_id: number | null;
  full_name: string;
  username: string;
  password_hash: string;
  role: Role;
  is_active: number;
  created_at: string;
}

export interface RolePermission {
  id: number;
  role: Role;
  page_key: string;
}

export interface Customer {
  id: number;
  branch_id: number | null;
  full_name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  landmark: string | null;
  tin: string | null;
  notes: string | null;
  loyalty_points: number;
  redeemed_points: number;
  is_active: number;
  created_at: string;
  updated_at: string;
}

export interface LoyaltySettings {
  id: number;
  mode: "per_amount" | "flat";
  amount_per_point: number;
  flat_points_per_order: number;
  redeem_value_per_point: number;
  max_redemption_percent: number;
}

export interface LoyaltyTier {
  id: number;
  name: string;
  min_points: number;
  is_active: number;
}

export interface LoyaltyPointEvent {
  id: number;
  customer_id: number;
  order_id: number | null;
  points: number;
  created_at: string;
  type: "earn" | "redeem";
}

export interface InventoryItem {
  id: number;
  branch_id: number | null;
  category_id: number | null;
  sku: string | null;
  name: string;
  description: string | null;
  unit: string;
  quantity_on_hand: number;
  reorder_level: number;
  markup_percent: number;
  markup_type: "percent" | "fixed";
  markup_amount: number;
  dose_size: number;
  dose_label: string | null;
  dose_unit_label: string | null;
  dose_unit_factor: number;
  is_active: number;
  usage_type: "consumable" | "supply";
}

export type MovementType = "restock" | "usage" | "adjustment" | "waste";

export interface InventoryMovement {
  id: number;
  item_id: number;
  branch_id: number | null;
  movement_type: MovementType;
  quantity: number;
  reference: string | null;
  notes: string | null;
  created_by: number | null;
  created_at: string;
  purchase_id: number | null;
  unit_price: number | null;
  quantity_remaining: number | null;
  consumed_from_movement_id: number | null;
  order_id: number | null;
  pack_size: number | null;
  pack_bonus: number | null;
  pack_count: number | null;
}

export interface InventoryPurchase {
  id: number;
  branch_id: number | null;
  supplier: string | null;
  reference: string | null;
  notes: string | null;
  receipt_image: string | null;
  purchase_date: string;
  created_by: number | null;
  created_at: string;
}

export interface ServiceType {
  id: number;
  name: string;
  unit: string;
  price: number;
  is_active: number;
}

export interface AddOn {
  id: number;
  name: string;
  price: number;
  is_active: number;
}

export interface ServicePackage {
  id: number;
  name: string;
  description: string | null;
  price: number;
  image: string | null;
  is_active: number;
}

export interface ServicePackageItem {
  id: number;
  package_id: number;
  item_id: number;
  quantity: number;
}

export interface ServicePackageAddOn {
  id: number;
  package_id: number;
  add_on_id: number;
}

export interface ServicePackageService {
  id: number;
  package_id: number;
  service_type_id: number;
  quantity: number;
}

export type OrderStatus = "pending" | "ready" | "claimed" | "delivered" | "cancelled";
export type PaymentStatus = "unpaid" | "partial" | "paid";

export interface Order {
  id: number;
  branch_id: number | null;
  customer_id: number | null;
  order_number: string;
  status: OrderStatus;
  subtotal: number;
  discount_total: number;
  tax_total: number;
  grand_total: number;
  amount_paid: number;
  payment_status: PaymentStatus;
  promo_id: number | null;
  drop_off_at: string;
  pickup_due_at: string | null;
  claimed_at: string | null;
  notes: string | null;
  kg: number | null;
  loads: number | null;
  /** Multiplier the package price was charged at; null on orders saved before per-load pricing. */
  package_loads: number | null;
  package_id: number | null;
  created_by: number | null;
  invoice_number: number | null;
  or_series_id: number | null;
  vat_status: VatStatus;
  sc_pwd_id_no: string | null;
  sc_pwd_name: string | null;
  sc_pwd_discount_amount: number;
}

export type VatStatus = "vatable" | "vat_exempt" | "zero_rated";

/** An immutable daily sales close. See src/lib/zreading.ts. Rows are never updated/deleted. */
export interface ZReading {
  id: number;
  branch_id: number;
  terminal_id: string;
  sequence_no: number;
  period_start: string;
  period_end: string;
  beginning_grand_total: number;
  ending_grand_total: number;
  gross_sales: number;
  vatable_sales: number;
  vat_amount: number;
  vat_exempt_sales: number;
  zero_rated_sales: number;
  sc_pwd_discount_total: number;
  other_discount_total: number;
  cash_sales: number;
  cashless_sales: number;
  transaction_count: number;
  generated_by: number | null;
  created_at: string;
}

export interface OrderItem {
  id: number;
  order_id: number;
  service_type_id: number | null;
  description: string;
  quantity: number;
  unit_price: number;
  line_total: number;
  item_id: number | null;
  add_on_id: number | null;
}

export interface LoadTag {
  id: number;
  order_id: number;
  load_index: number;
  tag_date: string;
  daily_number: number;
  created_at: string;
}

export type MachineType = "washer" | "dryer";

export interface Machine {
  id: number;
  branch_id: number | null;
  name: string;
  type: MachineType;
  created_at: string;
}

export interface Esp32Device {
  id: number;
  device_id: string;
  label: string | null;
  ip_address: string | null;
  last_seen_at: string | null;
  created_at: string;
}

export type SensorChannel = "a" | "b" | "c" | "d";
/** Fixed assignment order -- mirrors CHANNEL_LETTERS in firmware/esp32_sensor_node/esp32_sensor_node.ino. */
export const SENSOR_CHANNELS: SensorChannel[] = ["a", "b", "c", "d"];

export interface MachineSensor {
  id: number;
  machine_id: number;
  esp32_device_id: number;
  channel: SensorChannel;
  idle_baseline: number | null;
  running_baseline: number | null;
  registered_at: string;
}

export interface CalibrationSession {
  id: number;
  machine_id: number;
  started_at: string;
  ended_at: string | null; // null while still recording
}

export type PaymentMethod = "cash" | "gcash" | "card" | "bank_transfer";

export interface Payment {
  id: number;
  order_id: number;
  amount: number;
  method: PaymentMethod;
  reference_no: string | null;
  received_by: number | null;
  created_at: string;
}

export interface Promo {
  id: number;
  name: string;
  code: string | null;
  discount_type: "percent" | "fixed";
  discount_value: number;
  min_spend: number;
  starts_at: string | null;
  ends_at: string | null;
  usage_limit: number | null;
  times_used: number;
  is_active: number;
}

export interface Expense {
  id: number;
  branch_id: number | null;
  category_id: number | null;
  description: string;
  amount: number;
  expense_date: string;
  receipt_ref: string | null;
  notes: string | null;
  receipt_image: string | null;
  purchase_id: number | null;
}

export interface ExpenseCategory {
  id: number;
  name: string;
}

export interface CashflowEntry {
  id: number;
  branch_id: number | null;
  entry_type: "income" | "expense";
  source: "sale" | "expense" | "restock" | "payroll" | "government" | "adjustment";
  source_id: number | null;
  amount: number;
  description: string | null;
  entry_date: string;
  method: PaymentMethod | null;
}

export interface Worker {
  id: number;
  branch_id: number | null;
  full_name: string;
  position: string | null;
  contact_no: string | null;
  pay_type: "daily" | "hourly" | "monthly" | "per_piece";
  rate: number;
  is_active: number;
  date_hired: string | null;
}

export interface Attendance {
  id: number;
  worker_id: number;
  work_date: string;
  time_in: string | null;
  time_out: string | null;
  hours_worked: number | null;
  overtime_hours: number;
  undertime_hours: number;
  status: "present" | "absent" | "leave" | "half_day";
  notes: string | null;
}

export interface CashAdvance {
  id: number;
  worker_id: number;
  amount: number;
  advance_date: string;
  note: string | null;
  status: "outstanding" | "settled";
  created_at: string;
  payslip_id: number | null;
}

export interface DeductionType {
  id: number;
  name: string;
  employee_share: number;
  employer_share: number;
  is_active: number;
}

export interface WorkerDeduction {
  id: number;
  worker_id: number;
  deduction_type_id: number;
  employee_share: number;
  employer_share: number;
  is_active: number;
}

export type DeductionPaymentStatus = "pending" | "paid";

export interface DeductionPayment {
  id: number;
  worker_id: number;
  period: string;
  payment_date: string | null;
  status: DeductionPaymentStatus;
  created_at: string;
}

export interface DeductionPaymentItem {
  id: number;
  payment_id: number;
  deduction_type_id: number;
  employee_share: number;
  employer_share: number;
}

export interface PayrollRun {
  id: number;
  branch_id: number | null;
  period_start: string;
  period_end: string;
  status: "draft" | "approved" | "paid";
  created_at: string;
}

export interface Payslip {
  id: number;
  payroll_run_id: number;
  worker_id: number;
  gross_pay: number;
  deductions: number;
  net_pay: number;
  notes: string | null;
  paid_at: string | null;
}

export interface PayrollSettings {
  id: number;
  overtime_multiplier: number;
}
