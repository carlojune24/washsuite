import { useEffect, useRef, useState, type FormEvent } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { ChevronLeft, Trash2, ImagePlus, X, Check, Sparkles } from "lucide-react";
import { execute, select } from "../lib/db";
import { fileToCompressedDataUrl } from "../lib/image";
import { doseFallbackLabel } from "../lib/dose";
import type { AddOn, InventoryItem, ServicePackage, ServiceType } from "../types";

interface ItemRow extends InventoryItem {
  current_cost: number | null;
}

interface ItemLine {
  quantity: string;
}

export default function ServicePackageForm() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const fileInput = useRef<HTMLInputElement>(null);

  const [serviceCatalog, setServiceCatalog] = useState<ServiceType[]>([]);
  const [inventoryItems, setInventoryItems] = useState<ItemRow[]>([]);
  const [addOnCatalog, setAddOnCatalog] = useState<AddOn[]>([]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("0");
  const [image, setImage] = useState<string | null>(null);
  const [serviceLines, setServiceLines] = useState<Record<number, ItemLine>>({});
  const [itemLines, setItemLines] = useState<Record<number, ItemLine>>({});
  const [selectedAddOns, setSelectedAddOns] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const [servicesRows, items, addOns] = await Promise.all([
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
      ]);
      setServiceCatalog(servicesRows);
      setInventoryItems(items);
      setAddOnCatalog(addOns);

      if (id) {
        const [[pkg], pkgServices, pkgItems, pkgAddOns] = await Promise.all([
          select<ServicePackage>("SELECT * FROM service_packages WHERE id = ?", [id]),
          select<{ service_type_id: number; quantity: number }>(
            "SELECT service_type_id, quantity FROM service_package_services WHERE package_id = ?",
            [id],
          ),
          select<{ item_id: number; quantity: number }>(
            "SELECT item_id, quantity FROM service_package_items WHERE package_id = ?",
            [id],
          ),
          select<{ add_on_id: number }>("SELECT add_on_id FROM service_package_add_ons WHERE package_id = ?", [id]),
        ]);
        if (pkg) {
          setName(pkg.name);
          setDescription(pkg.description ?? "");
          setPrice(String(pkg.price));
          setImage(pkg.image);
        }
        const svcLines: Record<number, ItemLine> = {};
        for (const s of pkgServices) svcLines[s.service_type_id] = { quantity: String(s.quantity) };
        setServiceLines(svcLines);
        const lines: Record<number, ItemLine> = {};
        for (const it of pkgItems) lines[it.item_id] = { quantity: String(it.quantity) };
        setItemLines(lines);
        setSelectedAddOns(new Set(pkgAddOns.map((a) => a.add_on_id)));
      }
      setLoading(false);
    })();
  }, [id]);

  function toggleService(serviceId: number) {
    setServiceLines((prev) => {
      const next = { ...prev };
      if (serviceId in next) delete next[serviceId];
      else next[serviceId] = { quantity: "1" };
      return next;
    });
  }

  function toggleItem(itemId: number) {
    setItemLines((prev) => {
      const next = { ...prev };
      if (itemId in next) {
        delete next[itemId];
      } else {
        const item = inventoryItems.find((it) => it.id === itemId);
        const defaultQty = item && item.dose_size > 0 ? item.dose_size : 1;
        next[itemId] = { quantity: String(defaultQty) };
      }
      return next;
    });
  }

  function toggleAddOn(addOnId: number) {
    setSelectedAddOns((prev) => {
      const next = new Set(prev);
      if (next.has(addOnId)) next.delete(addOnId);
      else next.add(addOnId);
      return next;
    });
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setImage(await fileToCompressedDataUrl(file));
    } catch {
      setError("Couldn't read that image, try another.");
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError("Name is required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      let packageId: number;
      const values = [name.trim(), description.trim() || null, Number(price) || 0, image];
      if (isEdit) {
        packageId = Number(id);
        await execute(
          `UPDATE service_packages SET name = ?, description = ?, price = ?, image = ?, updated_at = datetime('now') WHERE id = ?`,
          [...values, packageId],
        );
        await execute("DELETE FROM service_package_services WHERE package_id = ?", [packageId]);
        await execute("DELETE FROM service_package_items WHERE package_id = ?", [packageId]);
        await execute("DELETE FROM service_package_add_ons WHERE package_id = ?", [packageId]);
      } else {
        const res = await execute(
          `INSERT INTO service_packages (name, description, price, image) VALUES (?, ?, ?, ?)`,
          values,
        );
        packageId = Number(res.lastInsertId);
      }

      for (const [serviceId, line] of Object.entries(serviceLines)) {
        const qty = Number(line.quantity);
        if (qty > 0) {
          await execute(
            "INSERT INTO service_package_services (package_id, service_type_id, quantity) VALUES (?, ?, ?)",
            [packageId, Number(serviceId), qty],
          );
        }
      }
      for (const [itemId, line] of Object.entries(itemLines)) {
        const qty = Number(line.quantity);
        if (qty > 0) {
          await execute("INSERT INTO service_package_items (package_id, item_id, quantity) VALUES (?, ?, ?)", [
            packageId,
            Number(itemId),
            qty,
          ]);
        }
      }
      for (const addOnId of selectedAddOns) {
        await execute("INSERT INTO service_package_add_ons (package_id, add_on_id) VALUES (?, ?)", [
          packageId,
          addOnId,
        ]);
      }

      navigate(`/packages/${packageId}`);
    } catch (err) {
      setError(String(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!id) return;
    if (!confirm(`Remove ${name || "this package"}?`)) return;
    setSaving(true);
    try {
      await execute("UPDATE service_packages SET is_active = 0 WHERE id = ?", [id]);
      navigate("/packages");
    } catch (err) {
      setError(String(err));
      setSaving(false);
    }
  }

  if (loading) {
    return <p className="py-10 text-center text-sm text-ink/40">Loading…</p>;
  }

  const selectedServices = serviceCatalog.filter((s) => s.id in serviceLines);
  const selectedItems = inventoryItems.filter((it) => it.id in itemLines);

  return (
    <div>
      <div className="sticky top-0 z-10 mb-4 flex items-center gap-2 bg-page pb-2">
        <Link
          to={isEdit ? `/packages/${id}` : "/packages"}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface text-ink shadow-sm"
        >
          <ChevronLeft size={18} strokeWidth={2.2} />
        </Link>
        <h1 className="text-xl font-semibold text-ink">{isEdit ? "Edit package" : "Add package"}</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="rounded-2xl bg-surface p-3.5 shadow-sm">
          <span className="mb-2 block text-xs font-medium text-ink/50">Package image</span>
          {image ? (
            <div className="relative">
              <img src={image} alt="Package" className="h-32 w-full rounded-xl object-cover" />
              <button
                type="button"
                onClick={() => setImage(null)}
                className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-brand-900 text-white shadow-sm"
                aria-label="Remove image"
              >
                <X size={13} strokeWidth={2.5} />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              className="flex h-20 w-full items-center justify-center rounded-xl bg-brand-200/50 text-brand-600"
              aria-label="Add package image"
            >
              <ImagePlus size={22} strokeWidth={2} />
            </button>
          )}
          <input ref={fileInput} type="file" accept="image/*" onChange={handleFile} className="hidden" />
        </div>

        <label className="block rounded-2xl bg-surface p-3.5 shadow-sm">
          <span className="mb-1 block text-xs font-medium text-ink/50">Name *</span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Family Bundle"
            required
            autoFocus
            className="w-full text-sm font-medium text-ink outline-none placeholder:text-ink/30"
          />
        </label>

        <label className="block rounded-2xl bg-surface p-3.5 shadow-sm">
          <span className="mb-1 block text-xs font-medium text-ink/50">Description</span>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full text-sm font-medium text-ink outline-none"
          />
        </label>

        <label className="block rounded-2xl bg-surface p-3.5 shadow-sm">
          <span className="mb-1 block text-xs font-medium text-ink/50">Package price</span>
          <input
            type="number"
            inputMode="decimal"
            min="0"
            step="any"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            className="w-full text-sm font-medium text-ink outline-none"
          />
        </label>

        <div>
          <p className="mb-2 px-1 text-xs font-semibold tracking-wide text-ink/40 uppercase">
            Services included
          </p>
          <div className="flex flex-wrap gap-1.5">
            {serviceCatalog.map((s) => {
              const checked = s.id in serviceLines;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => toggleService(s.id)}
                  className={
                    "flex items-center gap-1 rounded-full py-1.5 pr-3 pl-2 text-xs font-medium shadow-sm transition-colors " +
                    (checked ? "bg-brand-500 text-white" : "bg-surface text-ink")
                  }
                >
                  <span
                    className={
                      "flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border " +
                      (checked ? "border-white/70 bg-white/20" : "border-ink/15")
                    }
                  >
                    {checked && <Check size={9} strokeWidth={3.5} />}
                  </span>
                  {s.name}
                </button>
              );
            })}
          </div>

          {selectedServices.length > 0 && (
            <div className="mt-2 space-y-1.5">
              {selectedServices.map((s) => (
                <div key={s.id} className="flex items-center gap-2 rounded-xl bg-surface py-1.5 pl-3 pr-2 shadow-sm">
                  <p className="min-w-0 flex-1 truncate text-sm font-medium text-ink">
                    {s.name} <span className="text-ink/40">(₱{s.price.toFixed(2)}/{s.unit})</span>
                  </p>
                  <input
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="any"
                    value={serviceLines[s.id].quantity}
                    onChange={(e) =>
                      setServiceLines((prev) => ({ ...prev, [s.id]: { quantity: e.target.value } }))
                    }
                    className="w-14 rounded-lg bg-surface-muted px-1.5 py-1.5 text-center text-sm font-medium text-ink outline-none"
                  />
                  <span className="w-8 shrink-0 text-xs text-ink/40">{s.unit}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          <p className="mb-2 px-1 text-xs font-semibold tracking-wide text-ink/40 uppercase">
            Items included
          </p>
          <div className="flex flex-wrap gap-1.5">
            {inventoryItems.map((it) => {
              const checked = it.id in itemLines;
              return (
                <button
                  key={it.id}
                  type="button"
                  onClick={() => toggleItem(it.id)}
                  className={
                    "flex items-center gap-1 rounded-full py-1.5 pr-3 pl-2 text-xs font-medium shadow-sm transition-colors " +
                    (checked ? "bg-brand-500 text-white" : "bg-surface text-ink")
                  }
                >
                  <span
                    className={
                      "flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border " +
                      (checked ? "border-white/70 bg-white/20" : "border-ink/15")
                    }
                  >
                    {checked && <Check size={9} strokeWidth={3.5} />}
                  </span>
                  {it.name}
                </button>
              );
            })}
          </div>

          {selectedItems.length > 0 && (
            <div className="mt-2 space-y-1.5">
              {selectedItems.map((it) => {
                const line = itemLines[it.id];
                const qty = Number(line.quantity) || 0;
                const hasDose = it.dose_size > 0;
                const doseCount = hasDose ? qty / it.dose_size : null;
                return (
                  <div key={it.id} className="flex items-center gap-2 rounded-xl bg-surface py-1.5 pl-3 pr-2 shadow-sm">
                    <p className="min-w-0 flex-1 truncate text-sm font-medium text-ink">{it.name}</p>
                    <input
                      type="number"
                      inputMode="decimal"
                      min="0"
                      step={hasDose ? "1" : "any"}
                      value={hasDose ? String(doseCount ?? 0) : line.quantity}
                      onChange={(e) => {
                        const raw = Number(e.target.value) || 0;
                        const quantity = hasDose ? String(Math.round(raw * it.dose_size * 1e6) / 1e6) : e.target.value;
                        setItemLines((prev) => ({ ...prev, [it.id]: { quantity } }));
                      }}
                      aria-label={`${it.name} dose quantity`}
                      className="w-14 rounded-lg bg-surface-muted px-1.5 py-1.5 text-center text-sm font-medium text-ink outline-none"
                    />
                    <span className="w-16 shrink-0 truncate text-xs text-ink/40">
                      {hasDose ? `× ${it.dose_label || doseFallbackLabel(it.dose_size, it.unit)}` : it.unit}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {addOnCatalog.length > 0 && (
          <div>
            <p className="mb-2 px-1 text-xs font-semibold tracking-wide text-ink/40 uppercase">
              Available add-ons
            </p>
            <div className="flex flex-wrap gap-1.5">
              {addOnCatalog.map((a) => {
                const checked = selectedAddOns.has(a.id);
                return (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => toggleAddOn(a.id)}
                    className={
                      "flex items-center gap-1 rounded-full py-1.5 pr-3 pl-2 text-xs font-medium shadow-sm transition-colors " +
                      (checked ? "bg-brand-500 text-white" : "bg-surface text-ink")
                    }
                  >
                    <Sparkles size={12} strokeWidth={2.2} className={checked ? "text-white" : "text-brand-500"} />
                    {a.name} · +₱{a.price.toFixed(2)}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex gap-2 pt-2">
          <button
            type="submit"
            disabled={saving}
            className="flex-1 rounded-2xl bg-brand-500 py-3 text-sm font-semibold text-white shadow-sm disabled:opacity-60"
          >
            {saving ? "Saving…" : isEdit ? "Save changes" : "Add package"}
          </button>
          {isEdit && (
            <button
              type="button"
              onClick={handleDelete}
              disabled={saving}
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-surface text-red-600 shadow-sm disabled:opacity-60"
              aria-label="Remove package"
            >
              <Trash2 size={17} strokeWidth={2.2} />
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
