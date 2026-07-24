import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ChevronLeft, Star, Trash2, PlusCircle } from "lucide-react";
import { toast } from "sonner";
import { execute, select } from "../lib/db";
import type { LoyaltySettings as LoyaltySettingsType, LoyaltyTier } from "../types";

interface TierDraft {
  id: number | null;
  name: string;
  minPoints: string;
}

export default function LoyaltySettings() {
  const navigate = useNavigate();

  const [mode, setMode] = useState<"per_amount" | "flat">("per_amount");
  const [amountPerPoint, setAmountPerPoint] = useState("100");
  const [flatPointsPerOrder, setFlatPointsPerOrder] = useState("1");
  const [redeemValuePerPoint, setRedeemValuePerPoint] = useState("1");
  const [maxRedemptionPercent, setMaxRedemptionPercent] = useState("50");
  const [tiers, setTiers] = useState<TierDraft[]>([]);
  const [removedTierIds, setRemovedTierIds] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      select<LoyaltySettingsType>("SELECT * FROM loyalty_settings WHERE id = 1"),
      select<LoyaltyTier>("SELECT * FROM loyalty_tiers WHERE is_active = 1 ORDER BY min_points"),
    ]).then(([[s], t]) => {
      if (s) {
        setMode(s.mode);
        setAmountPerPoint(String(s.amount_per_point));
        setFlatPointsPerOrder(String(s.flat_points_per_order));
        setRedeemValuePerPoint(String(s.redeem_value_per_point));
        setMaxRedemptionPercent(String(s.max_redemption_percent));
      }
      setTiers(t.map((tier) => ({ id: tier.id, name: tier.name, minPoints: String(tier.min_points) })));
      setLoading(false);
    });
  }, []);

  function updateTier(index: number, patch: Partial<TierDraft>) {
    setTiers((prev) => prev.map((t, i) => (i === index ? { ...t, ...patch } : t)));
  }

  function addTier() {
    setTiers((prev) => [...prev, { id: null, name: "", minPoints: "0" }]);
  }

  function removeTier(index: number) {
    const tier = tiers[index];
    if (tier.id != null) setRemovedTierIds((prev) => [...prev, tier.id!]);
    setTiers((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSave() {
    const amt = Number(amountPerPoint);
    const flat = Number(flatPointsPerOrder);
    const redeemValue = Number(redeemValuePerPoint);
    const maxPercent = Number(maxRedemptionPercent);
    if (mode === "per_amount" && !(amt > 0)) {
      setError("Enter an amount greater than 0 for the points rate.");
      return;
    }
    if (mode === "flat" && !(flat >= 0)) {
      setError("Enter a valid flat points value.");
      return;
    }
    if (!(redeemValue > 0)) {
      setError("Enter a redeem value greater than 0.");
      return;
    }
    if (!(maxPercent > 0 && maxPercent <= 100)) {
      setError("Max redemption must be between 1 and 100%.");
      return;
    }
    for (const t of tiers) {
      if (!t.name.trim()) {
        setError("Every tier needs a name.");
        return;
      }
    }

    setSaving(true);
    setError(null);
    try {
      await execute(
        `UPDATE loyalty_settings
         SET mode = ?, amount_per_point = ?, flat_points_per_order = ?, redeem_value_per_point = ?, max_redemption_percent = ?
         WHERE id = 1`,
        [mode, amt || 0, flat || 0, redeemValue, maxPercent],
      );

      for (const id of removedTierIds) {
        await execute("UPDATE loyalty_tiers SET is_active = 0 WHERE id = ?", [id]);
      }
      for (const t of tiers) {
        const minPoints = Number(t.minPoints) || 0;
        if (t.id != null) {
          await execute("UPDATE loyalty_tiers SET name = ?, min_points = ? WHERE id = ?", [
            t.name.trim(),
            minPoints,
            t.id,
          ]);
        } else {
          await execute("INSERT INTO loyalty_tiers (name, min_points) VALUES (?, ?)", [t.name.trim(), minPoints]);
        }
      }

      toast.success("Loyalty settings saved");
      navigate("/customers");
    } catch (err) {
      setError(String(err));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <p className="py-10 text-center text-sm text-ink/40">Loading…</p>;
  }

  return (
    <div>
      <div className="sticky top-0 z-10 mb-4 flex items-center gap-2 bg-page pb-2">
        <Link
          to="/customers"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface text-ink shadow-sm"
        >
          <ChevronLeft size={18} strokeWidth={2.2} />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-semibold text-ink">Loyalty Settings</h1>
          <p className="truncate text-xs text-ink/50">How points are earned, and tier thresholds</p>
        </div>
      </div>

      <p className="mb-2 px-1 text-xs font-semibold tracking-wide text-ink/40 uppercase">Points Earning</p>
      <div className="mb-4 space-y-3 rounded-2xl bg-surface p-4 shadow-sm">
        <div className="flex gap-1.5 rounded-2xl bg-surface-muted p-1.5">
          {(["per_amount", "flat"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={
                "flex-1 rounded-xl py-2 text-xs font-semibold transition-colors " +
                (mode === m ? "bg-brand-500 text-white" : "text-ink/50")
              }
            >
              {m === "per_amount" ? "Per Amount Spent" : "Flat Per Order"}
            </button>
          ))}
        </div>

        {mode === "per_amount" ? (
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-ink/50">Pesos spent per 1 point</span>
            <input
              type="number"
              inputMode="decimal"
              min="1"
              step="any"
              value={amountPerPoint}
              onChange={(e) => setAmountPerPoint(e.target.value)}
              className="w-full rounded-2xl bg-surface-muted px-3.5 py-2.5 text-sm font-medium text-ink outline-none"
            />
            <p className="mt-1 text-[11px] text-ink/40">
              e.g. ₱100 means a ₱250 order earns {Math.floor(250 / (Number(amountPerPoint) || 1))} points.
            </p>
          </label>
        ) : (
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-ink/50">Points per order</span>
            <input
              type="number"
              inputMode="decimal"
              min="0"
              step="any"
              value={flatPointsPerOrder}
              onChange={(e) => setFlatPointsPerOrder(e.target.value)}
              className="w-full rounded-2xl bg-surface-muted px-3.5 py-2.5 text-sm font-medium text-ink outline-none"
            />
            <p className="mt-1 text-[11px] text-ink/40">Every completed order earns this many points, regardless of amount.</p>
          </label>
        )}
      </div>

      <p className="mb-2 px-1 text-xs font-semibold tracking-wide text-ink/40 uppercase">Points Redemption</p>
      <div className="mb-4 space-y-3 rounded-2xl bg-surface p-4 shadow-sm">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-ink/50">Peso value per point redeemed</span>
          <input
            type="number"
            inputMode="decimal"
            min="0"
            step="any"
            value={redeemValuePerPoint}
            onChange={(e) => setRedeemValuePerPoint(e.target.value)}
            className="w-full rounded-2xl bg-surface-muted px-3.5 py-2.5 text-sm font-medium text-ink outline-none"
          />
          <p className="mt-1 text-[11px] text-ink/40">e.g. ₱1 means 50 points = ₱50 off an order.</p>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-ink/50">Max % of order coverable by points</span>
          <input
            type="number"
            inputMode="decimal"
            min="1"
            max="100"
            step="any"
            value={maxRedemptionPercent}
            onChange={(e) => setMaxRedemptionPercent(e.target.value)}
            className="w-full rounded-2xl bg-surface-muted px-3.5 py-2.5 text-sm font-medium text-ink outline-none"
          />
          <p className="mt-1 text-[11px] text-ink/40">
            Stops points from fully wiping out a large order — e.g. 50% means a customer can never cover more than
            half an order's subtotal with points, however many they have.
          </p>
        </label>
      </div>

      <div className="mb-2 flex items-center justify-between px-1">
        <p className="text-xs font-semibold tracking-wide text-ink/40 uppercase">Tiers</p>
        <button type="button" onClick={addTier} className="flex items-center gap-1 text-xs font-semibold text-brand-500">
          <PlusCircle size={14} strokeWidth={2.2} />
          Add tier
        </button>
      </div>
      <div className="mb-4 space-y-2 rounded-2xl bg-surface p-4 shadow-sm">
        {tiers.length === 0 && <p className="text-sm text-ink/40">No tiers yet — customers won't show as Loyal.</p>}
        {tiers.map((t, i) => (
          <div key={i} className="flex items-center gap-2 rounded-xl bg-surface-muted p-2.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-600">
              <Star size={14} strokeWidth={2.2} />
            </span>
            <input
              type="text"
              value={t.name}
              onChange={(e) => updateTier(i, { name: e.target.value })}
              placeholder="Tier name"
              className="min-w-0 flex-1 rounded-lg bg-surface px-2.5 py-1.5 text-sm font-medium text-ink outline-none placeholder:text-ink/30"
            />
            <input
              type="number"
              inputMode="numeric"
              min="0"
              value={t.minPoints}
              onChange={(e) => updateTier(i, { minPoints: e.target.value })}
              placeholder="Min pts"
              className="w-20 shrink-0 rounded-lg bg-surface px-2.5 py-1.5 text-sm font-medium text-ink outline-none placeholder:text-ink/30"
            />
            <button
              type="button"
              onClick={() => removeTier(i)}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-red-500"
              aria-label="Remove tier"
            >
              <Trash2 size={15} strokeWidth={2.2} />
            </button>
          </div>
        ))}
        <p className="px-1 text-[11px] text-ink/40">
          A customer's tier is the highest one their total points reach. Below every threshold shows as "No Tier".
        </p>
      </div>

      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}

      <button
        type="button"
        onClick={handleSave}
        disabled={saving}
        className="w-full rounded-2xl bg-brand-500 py-3 text-sm font-semibold text-white shadow-sm disabled:opacity-60"
      >
        {saving ? "Saving…" : "Save Settings"}
      </button>
    </div>
  );
}
