import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ChevronLeft, Camera, X } from "lucide-react";
import { execute, select, toEntryTimestamp } from "../lib/db";
import { fileToCompressedDataUrl } from "../lib/image";
import type { ExpenseCategory, PaymentMethod } from "../types";
import { localDate } from "../lib/localDate";

function today() {
  return localDate(new Date());
}

export default function ExpenseForm() {
  const navigate = useNavigate();
  const fileInput = useRef<HTMLInputElement>(null);

  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [pastNames, setPastNames] = useState<string[]>([]);

  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState<string>("");
  const [amount, setAmount] = useState("");
  const [expenseDate, setExpenseDate] = useState(today());
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  const [receiptRef, setReceiptRef] = useState("");
  const [notes, setNotes] = useState("");
  const [receiptImage, setReceiptImage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      select<ExpenseCategory>("SELECT * FROM expense_categories ORDER BY name"),
      select<{ description: string }>(
        "SELECT DISTINCT description FROM expenses ORDER BY description",
      ),
    ]).then(([cats, names]) => {
      setCategories(cats);
      setPastNames(names.map((n) => n.description));
    });
  }, []);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setReceiptImage(await fileToCompressedDataUrl(file));
    } catch {
      setError("Couldn't read that image, try another.");
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();

    const name = description.trim();
    const amt = Number(amount);

    if (!name) {
      setError("Enter what the expense was for.");
      return;
    }
    if (!(amt > 0)) {
      setError("Enter an amount greater than 0.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const res = await execute(
        `INSERT INTO expenses (branch_id, category_id, description, amount, expense_date, receipt_ref, notes, receipt_image)
         VALUES (1, ?, ?, ?, ?, ?, ?, ?)`,
        [
          categoryId ? Number(categoryId) : null,
          name,
          amt,
          expenseDate,
          receiptRef.trim() || null,
          notes.trim() || null,
          receiptImage,
        ],
      );
      const expenseId = res.lastInsertId;

      await execute(
        `INSERT INTO cashflow_entries (branch_id, entry_type, source, source_id, amount, description, entry_date, method)
         VALUES (1, 'expense', 'expense', ?, ?, ?, ?, ?)`,
        [expenseId, amt, name, toEntryTimestamp(expenseDate), paymentMethod],
      );

      navigate("/expenses");
    } catch (err) {
      setError(String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="sticky top-0 z-10 mb-4 flex items-center gap-2 bg-page pb-2">
        <Link
          to="/expenses"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface text-ink shadow-sm"
        >
          <ChevronLeft size={18} strokeWidth={2.2} />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-semibold text-ink">New expense</h1>
          <p className="truncate text-xs text-ink/50">One entry per expense</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        <label className="block rounded-2xl bg-surface p-3.5 shadow-sm">
          <span className="mb-1 block text-xs font-medium text-ink/50">Expense name</span>
          <input
            type="text"
            list="expense-name-suggestions"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="e.g. Meralco Bill"
            className="w-full text-sm font-medium text-ink outline-none placeholder:text-ink/30"
          />
          <datalist id="expense-name-suggestions">
            {pastNames.map((n) => (
              <option key={n} value={n} />
            ))}
          </datalist>
        </label>

        <label className="block rounded-2xl bg-surface p-3.5 shadow-sm">
          <span className="mb-1 block text-xs font-medium text-ink/50">Category</span>
          <select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className="w-full bg-transparent text-sm font-medium text-ink outline-none"
          >
            <option value="">None</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>

        <div className="grid grid-cols-2 gap-2">
          <label className="block rounded-2xl bg-surface p-3.5 shadow-sm">
            <span className="mb-1 block text-xs font-medium text-ink/50">Amount</span>
            <input
              type="number"
              inputMode="decimal"
              min="0"
              step="any"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              className="w-full text-sm font-medium text-ink outline-none placeholder:text-ink/30"
            />
          </label>
          <label className="block rounded-2xl bg-surface p-3.5 shadow-sm">
            <span className="mb-1 block text-xs font-medium text-ink/50">Date</span>
            <input
              type="date"
              value={expenseDate}
              onChange={(e) => setExpenseDate(e.target.value)}
              className="w-full text-sm font-medium text-ink outline-none"
            />
          </label>
        </div>

        <div className="flex gap-1.5 rounded-2xl bg-surface p-1.5 shadow-sm">
          {(["cash", "gcash"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setPaymentMethod(m)}
              className={
                "flex-1 rounded-xl py-1.5 text-xs font-semibold transition-colors " +
                (paymentMethod === m ? "bg-brand-500 text-white" : "text-ink/50")
              }
            >
              {m === "gcash" ? "E-wallet" : "Cash"}
            </button>
          ))}
        </div>

        <label className="block rounded-2xl bg-surface p-3.5 shadow-sm">
          <span className="mb-1 block text-xs font-medium text-ink/50">Receipt / reference #</span>
          <input
            type="text"
            value={receiptRef}
            onChange={(e) => setReceiptRef(e.target.value)}
            placeholder="e.g. OR #1234"
            className="w-full text-sm font-medium text-ink outline-none placeholder:text-ink/30"
          />
        </label>

        <label className="block rounded-2xl bg-surface p-3.5 shadow-sm">
          <span className="mb-1 block text-xs font-medium text-ink/50">Notes</span>
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full text-sm font-medium text-ink outline-none"
          />
        </label>

        <div className="rounded-2xl bg-surface p-3.5 shadow-sm">
          <span className="mb-2 block text-xs font-medium text-ink/50">Receipt photo</span>
          {receiptImage ? (
            <div className="relative inline-block">
              <img src={receiptImage} alt="Receipt" className="h-28 w-28 rounded-xl object-cover" />
              <button
                type="button"
                onClick={() => setReceiptImage(null)}
                className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-brand-900 text-white shadow-sm"
                aria-label="Remove photo"
              >
                <X size={13} strokeWidth={2.5} />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              className="flex h-14 w-14 items-center justify-center rounded-xl bg-brand-200/50 text-brand-600"
              aria-label="Add receipt photo"
            >
              <Camera size={20} strokeWidth={2} />
            </button>
          )}
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleFile}
            className="hidden"
          />
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={saving}
          className="w-full rounded-2xl bg-brand-500 py-3 text-sm font-semibold text-white shadow-sm disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save expense"}
        </button>
      </form>
    </div>
  );
}
