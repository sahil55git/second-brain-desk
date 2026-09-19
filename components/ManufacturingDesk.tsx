"use client";

import React, { useMemo, useState } from "react";
import type { MfgBatchDTO, BatchSupplierDTO } from "@/lib/types";
import {
  computeBarrelYield,
  YIELD_BAND_LABELS,
  OIL_TYPES,
  type BarrelBatchInput,
  type BarrelYieldResult,
} from "@/lib/mfgCalculations";
import AiTerminal from "@/components/AiTerminal";
import { useCustomize, visibleOrderedIds } from "@/lib/customize";
import { WIDGET_DEFS, COLUMN_DEFS } from "@/lib/desksConfig";

const MFG_WIDGET_IDS = WIDGET_DEFS.mfg.map((w) => w.id);
const MFG_COLUMN_IDS = COLUMN_DEFS.mfg.map((c) => c.id);

function kg(n: number | null | undefined, digits = 1) {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return `${n.toFixed(digits)} kg`;
}
function pct(n: number | null | undefined) {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return `${n.toFixed(1)}%`;
}
function fmtDateTime(iso: string) {
  // Pinned timezone — see JobWorkDesk fmtTime: keeps server (UTC) and
  // client (IST) output identical so React hydration doesn't mismatch.
  return new Date(iso).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Kolkata",
  });
}
function nowTime() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
function today() {
  return new Date().toISOString().slice(0, 10);
}

function batchToInput(b: MfgBatchDTO): BarrelBatchInput {
  return {
    suppliers: (b.suppliers || []).map((s) => ({ name: s.name, seedKg: s.seedKg })),
    step1Kg: b.step1Kg,
    step2Kg: b.step2Kg,
    step3Kg: b.step3Kg,
    step4Kg: b.step4Kg,
    refOilPct: b.refOilPct,
    moisturePct: b.moisturePct,
    systemOilKgOverride: b.systemOilKgOverride,
  };
}

function bandPill(y: BarrelYieldResult) {
  if (!y.complete || !y.yieldBand) return null;
  const cls =
    y.yieldBand === "poor"
      ? "bg-amber-100 text-amber-800"
      : y.yieldBand === "standard"
      ? "bg-black/10 dark:bg-white/15"
      : "bg-green-100 text-green-800";
  return (
    <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] ${cls}`}>
      {YIELD_BAND_LABELS[y.yieldBand]}
    </span>
  );
}

const CRIT = "bg-red-100 text-red-800";

export default function ManufacturingDesk({
  initialBatches,
  dbConnected,
}: {
  initialBatches: MfgBatchDTO[];
  dbConnected: boolean;
}) {
  const [batches, setBatches] = useState<MfgBatchDTO[]>(initialBatches);
  const [tab, setTab] = useState<"start" | "update">("start");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { prefs } = useCustomize();
  const visibleWidgetIds = visibleOrderedIds(MFG_WIDGET_IDS, prefs.widgets.mfg);
  const visibleColIds = visibleOrderedIds(MFG_COLUMN_IDS, prefs.columns.mfg);
  const totalCols = visibleColIds.length;

  async function refetch() {
    try {
      const res = await fetch("/api/manufacturing");
      const json = await res.json();
      if (res.ok) setBatches(json.data);
    } catch {
      /* keep as-is */
    }
  }

  // ---- Start batch form state ----
  const [mill, setMill] = useState("");
  const [barrel, setBarrel] = useState("");
  const [productItem, setProductItem] = useState<string>("Karadi oil");
  const [customItem, setCustomItem] = useState("");
  const [date, setDate] = useState(today());
  const [refOilPct, setRefOilPct] = useState("22");
  const [suppliers, setSuppliers] = useState<{ name: string; seedKg: string }[]>([
    { name: "", seedKg: "" },
  ]);
  const [step1Kg, setStep1Kg] = useState("");
  const [seedQuality, setSeedQuality] = useState("");
  const [systemOilOverride, setSystemOilOverride] = useState("");
  const [moisturePct, setMoisturePct] = useState("");
  const [notes, setNotes] = useState("");

  function resetStartForm() {
    setMill("");
    setBarrel("");
    setProductItem("Karadi oil");
    setCustomItem("");
    setDate(today());
    setRefOilPct("22");
    setSuppliers([{ name: "", seedKg: "" }]);
    setStep1Kg("");
    setSeedQuality("");
    setSystemOilOverride("");
    setMoisturePct("");
    setNotes("");
  }

  async function submitStart(e: React.FormEvent) {
    e.preventDefault();
    if (!barrel.trim()) return;
    const sup = suppliers
      .map((s) => ({ name: s.name.trim(), seedKg: parseFloat(s.seedKg) || 0 }))
      .filter((s) => s.name || s.seedKg > 0);
    if (sup.length === 0) {
      setError("Add at least one supplier with seed weight.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/manufacturing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mill: mill || null,
          barrel: barrel.trim(),
          productItem: productItem === "Other" ? customItem || "Other" : productItem,
          date,
          suppliers: sup,
          step1Kg: step1Kg === "" ? null : parseFloat(step1Kg),
          refOilPct: refOilPct === "" ? 22 : parseFloat(refOilPct),
          seedQuality: seedQuality || null,
          systemOilKgOverride: systemOilOverride === "" ? null : parseFloat(systemOilOverride),
          moisturePct: moisturePct === "" ? null : parseFloat(moisturePct),
          notes: notes || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) setError(json.error || "Failed to start batch");
      else {
        setBatches((prev) => [json.data, ...prev]);
        resetStartForm();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start batch");
    } finally {
      setLoading(false);
      refetch();
    }
  }

  function handleAiFill(fields: Record<string, unknown>) {
    if (typeof fields.mill === "string") setMill(fields.mill);
    if (typeof fields.barrel === "string") setBarrel(fields.barrel);
    if (typeof fields.productItem === "string") {
      if ((OIL_TYPES as readonly string[]).includes(fields.productItem)) {
        setProductItem(fields.productItem);
      } else {
        setProductItem("Other");
        setCustomItem(fields.productItem);
      }
    }
    if (typeof fields.date === "string") setDate(fields.date);
    if (typeof fields.refOilPct === "number") setRefOilPct(String(fields.refOilPct));
    if (typeof fields.step1Kg === "number") setStep1Kg(String(fields.step1Kg));
    if (typeof fields.seedQuality === "string") setSeedQuality(fields.seedQuality);
    if (typeof fields.notes === "string") setNotes(fields.notes);

    const s1n = typeof fields.supplier1Name === "string" ? fields.supplier1Name : undefined;
    const s1k = typeof fields.supplier1SeedKg === "number" ? String(fields.supplier1SeedKg) : undefined;
    const s2n = typeof fields.supplier2Name === "string" ? fields.supplier2Name : undefined;
    const s2k = typeof fields.supplier2SeedKg === "number" ? String(fields.supplier2SeedKg) : undefined;
    if (s1n !== undefined || s1k !== undefined || s2n !== undefined || s2k !== undefined) {
      setSuppliers((prev) => {
        const next = [...prev];
        if (!next[0]) next[0] = { name: "", seedKg: "" };
        if (s1n !== undefined) next[0] = { ...next[0], name: s1n };
        if (s1k !== undefined) next[0] = { ...next[0], seedKg: s1k };
        if (s2n !== undefined || s2k !== undefined) {
          if (!next[1]) next[1] = { name: "", seedKg: "" };
          if (s2n !== undefined) next[1] = { ...next[1], name: s2n };
          if (s2k !== undefined) next[1] = { ...next[1], seedKg: s2k };
        }
        return next;
      });
    }
  }

  // ---- Update / complete form state ----
  const [selBatchId, setSelBatchId] = useState<string>("");
  const [uStep2, setUStep2] = useState("");
  const [uStep2Date, setUStep2Date] = useState("");
  const [uStep2Time, setUStep2Time] = useState("");
  const [uStep3, setUStep3] = useState("");
  const [uStep3Date, setUStep3Date] = useState("");
  const [uStep3Time, setUStep3Time] = useState("");
  const [uStep4, setUStep4] = useState("");
  const [uStep4Date, setUStep4Date] = useState("");
  const [uStep4Time, setUStep4Time] = useState("");

  // Settling batches first, then recent complete ones, for the picker.
  const pickerBatches = useMemo(() => {
    const withY = batches.map((b) => ({ b, y: computeBarrelYield(batchToInput(b)) }));
    const settling = withY.filter((x) => !x.y.complete).map((x) => x.b);
    const complete = withY.filter((x) => x.y.complete).map((x) => x.b);
    return [...settling, ...complete];
  }, [batches]);

  function loadBatchIntoUpdate(id: string) {
    setSelBatchId(id);
    const b = batches.find((x) => x.id === id);
    if (!b) return;
    setUStep2(b.step2Kg?.toString() ?? "");
    setUStep2Date(b.step2Date ?? "");
    setUStep2Time(b.step2Time ?? "");
    setUStep3(b.step3Kg?.toString() ?? "");
    setUStep3Date(b.step3Date ?? "");
    setUStep3Time(b.step3Time ?? "");
    setUStep4(b.step4Kg?.toString() ?? "");
    setUStep4Date(b.step4Date ?? "");
    setUStep4Time(b.step4Time ?? "");
  }

  // Auto-stamp a step's date/time when its kg is first entered.
  function onStepKg(
    val: string,
    setKg: (v: string) => void,
    d: string,
    setD: (v: string) => void,
    t: string,
    setT: (v: string) => void
  ) {
    setKg(val);
    if (val !== "" && d === "" && t === "") {
      setD(today());
      setT(nowTime());
    }
  }

  const selBatch = batches.find((b) => b.id === selBatchId) || null;
  const updatePreview = useMemo(() => {
    if (!selBatch) return null;
    return computeBarrelYield({
      ...batchToInput(selBatch),
      step2Kg: uStep2 === "" ? null : parseFloat(uStep2),
      step3Kg: uStep3 === "" ? null : parseFloat(uStep3),
      step4Kg: uStep4 === "" ? null : parseFloat(uStep4),
    });
  }, [selBatch, uStep2, uStep3, uStep4]);

  async function submitUpdate(e: React.FormEvent) {
    e.preventDefault();
    if (!selBatchId) {
      setError("Pick a batch to update.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/manufacturing/${selBatchId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          step2Kg: uStep2 === "" ? null : parseFloat(uStep2),
          step2Date: uStep2Date || null,
          step2Time: uStep2Time || null,
          step3Kg: uStep3 === "" ? null : parseFloat(uStep3),
          step3Date: uStep3Date || null,
          step3Time: uStep3Time || null,
          step4Kg: uStep4 === "" ? null : parseFloat(uStep4),
          step4Date: uStep4Date || null,
          step4Time: uStep4Time || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) setError(json.error || "Failed to update batch");
      else {
        setBatches((prev) => prev.map((b) => (b.id === selBatchId ? json.data : b)));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update batch");
    } finally {
      setLoading(false);
      refetch();
    }
  }

  // ---- Derived widgets + flags ----
  const computed = useMemo(
    () => batches.map((b) => ({ b, y: computeBarrelYield(batchToInput(b)) })),
    [batches]
  );

  const settlingCount = computed.filter((x) => !x.y.complete).length;
  const weekMs = 7 * 24 * 60 * 60 * 1000;
  const oilThisWeek = computed
    .filter((x) => x.y.complete && Date.now() - new Date(x.b.updatedAt).getTime() < weekMs)
    .reduce((sum, x) => sum + (x.y.actualOilKg || 0), 0);
  const khaliWaste = computed
    .filter((x) => x.y.complete)
    .reduce((sum, x) => sum + (x.b.step4Kg || 0), 0);
  const totalOilProduced = computed
    .filter((x) => x.y.complete)
    .reduce((sum, x) => sum + (x.y.actualOilKg || 0), 0);

  const flagged = computed.filter(
    (x) =>
      x.y.complete &&
      (x.y.massBalanceFlagged || x.y.shortExtraFlagged || x.y.cakeFlagged || x.y.yieldPoor)
  );

  return (
    <div className="grid gap-6 lg:grid-cols-[420px_1fr]">
      {/* Entry panel */}
      <div className="rounded-xl border border-black/10 dark:border-white/10 p-4">
        <div className="flex gap-2 mb-3">
          {(["start", "update"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-3 py-1.5 rounded text-sm font-medium ${
                tab === t ? "bg-[var(--accent)] text-[var(--accent-contrast)]" : "bg-black/5 dark:bg-white/5"
              }`}
            >
              {t === "start" ? "Start batch" : "Update / complete"}
            </button>
          ))}
        </div>

        {tab === "start" ? (
          <>
            <AiTerminal desk="mfg-start" onFill={handleAiFill} title="AI Terminal — Start batch" />
            <form onSubmit={submitStart} className="space-y-3 text-sm">
            <div className="grid grid-cols-2 gap-2">
              <Field label="Mill (optional)">
                <input value={mill} onChange={(e) => setMill(e.target.value)} className={inp} placeholder="e.g. Mill 1" />
              </Field>
              <Field label="Barrel / batch">
                <input required value={barrel} onChange={(e) => setBarrel(e.target.value)} className={inp} placeholder="e.g. A1" />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Production item">
                <select value={productItem} onChange={(e) => setProductItem(e.target.value)} className={inp}>
                  {OIL_TYPES.map((o) => (
                    <option key={o} value={o}>{o}</option>
                  ))}
                </select>
              </Field>
              <Field label="Date">
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inp} />
              </Field>
            </div>
            {productItem === "Other" && (
              <Field label="Custom item name">
                <input value={customItem} onChange={(e) => setCustomItem(e.target.value)} className={inp} placeholder="e.g. Mustard oil" />
              </Field>
            )}
            <Field label="Reference oil yield % (editable)">
              <input type="number" step="0.1" value={refOilPct} onChange={(e) => setRefOilPct(e.target.value)} className={inp} />
            </Field>

            <div>
              <label className="block mb-1 opacity-70">Suppliers (seed in, up to 2)</label>
              {suppliers.map((s, i) => (
                <div key={i} className="flex gap-2 mb-1">
                  <input
                    placeholder="Supplier name"
                    value={s.name}
                    onChange={(e) => setSuppliers((prev) => prev.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
                    className={`${inp} flex-1`}
                  />
                  <input
                    placeholder="Seed kg"
                    type="number"
                    value={s.seedKg}
                    onChange={(e) => setSuppliers((prev) => prev.map((x, j) => (j === i ? { ...x, seedKg: e.target.value } : x)))}
                    className={`${inp} w-24`}
                  />
                </div>
              ))}
              {suppliers.length < 2 && (
                <button type="button" onClick={() => setSuppliers((p) => [...p, { name: "", seedKg: "" }])} className="text-xs underline opacity-70">
                  + Add second supplier
                </button>
              )}
            </div>

            <Field label="Step 1 — crude oil in (kg)">
              <input type="number" step="0.1" value={step1Kg} onChange={(e) => setStep1Kg(e.target.value)} className={inp} />
            </Field>

            <details className="rounded border border-black/10 dark:border-white/10 p-2">
              <summary className="cursor-pointer text-xs opacity-70">Advanced (optional)</summary>
              <div className="space-y-2 mt-2">
                <Field label="Seed quality (informational)">
                  <select value={seedQuality} onChange={(e) => setSeedQuality(e.target.value)} className={inp}>
                    <option value="">—</option>
                    <option value="Low">Low</option>
                    <option value="Standard">Standard</option>
                    <option value="Best">Best</option>
                  </select>
                </Field>
                <div className="grid grid-cols-2 gap-2">
                  <Field label="System oil override (kg)">
                    <input type="number" step="0.1" value={systemOilOverride} onChange={(e) => setSystemOilOverride(e.target.value)} className={inp} />
                  </Field>
                  <Field label="Moisture % (default 1.5)">
                    <input type="number" step="0.1" value={moisturePct} onChange={(e) => setMoisturePct(e.target.value)} className={inp} />
                  </Field>
                </div>
              </div>
            </details>

            <Field label="Notes (optional)">
              <input value={notes} onChange={(e) => setNotes(e.target.value)} className={inp} />
            </Field>

            {error && <div className="text-red-600 text-xs">{error}</div>}
            {!dbConnected && <DbWarn />}
            <button type="submit" disabled={loading} className={btn}>
              {loading ? "Saving…" : "Start batch"}
            </button>
            </form>
          </>
        ) : (
          <form onSubmit={submitUpdate} className="space-y-3 text-sm">
            <Field label="Batch (settling shown first)">
              <select value={selBatchId} onChange={(e) => loadBatchIntoUpdate(e.target.value)} className={inp}>
                <option value="">— pick a batch —</option>
                {pickerBatches.map((b) => {
                  const y = computeBarrelYield(batchToInput(b));
                  return (
                    <option key={b.id} value={b.id}>
                      {b.barrel} · {b.productItem} · {b.date} {y.complete ? "(complete)" : "(settling)"}
                    </option>
                  );
                })}
              </select>
            </Field>

            {selBatch && (
              <>
                <StepRow
                  label="Step 2 — partial skim (kg)"
                  kgVal={uStep2}
                  onKg={(v) => onStepKg(v, setUStep2, uStep2Date, setUStep2Date, uStep2Time, setUStep2Time)}
                  d={uStep2Date} onD={setUStep2Date} t={uStep2Time} onT={setUStep2Time}
                />
                <StepRow
                  label="Step 3 — full decant (kg)"
                  kgVal={uStep3}
                  onKg={(v) => onStepKg(v, setUStep3, uStep3Date, setUStep3Date, uStep3Time, setUStep3Time)}
                  d={uStep3Date} onD={setUStep3Date} t={uStep3Time} onT={setUStep3Time}
                />
                <StepRow
                  label="Step 4 — waste / oil-cake (kg)"
                  kgVal={uStep4}
                  onKg={(v) => onStepKg(v, setUStep4, uStep4Date, setUStep4Date, uStep4Time, setUStep4Time)}
                  d={uStep4Date} onD={setUStep4Date} t={uStep4Time} onT={setUStep4Time}
                />

                {updatePreview && (
                  <div className="rounded bg-black/5 dark:bg-white/5 px-3 py-2 text-xs space-y-1">
                    <div>
                      Actual oil: <strong>{kg(updatePreview.actualOilKg)}</strong> · Efficiency:{" "}
                      <strong>{pct(updatePreview.extractionEfficiencyPct)}</strong> {bandPill(updatePreview)}
                    </div>
                    <div>
                      Short/extra vs system: <strong>{kg(updatePreview.shortExtraOilKg)}</strong> · Unaccounted loss:{" "}
                      <strong>{kg(updatePreview.unaccountedLossKg)}</strong> ({pct(updatePreview.unaccountedLossPct)})
                    </div>
                    <div>
                      Oil cake: <strong>{kg(updatePreview.actualCakeKg)}</strong> vs expected{" "}
                      {kg(updatePreview.expectedCakeKg)}
                    </div>
                    {updatePreview.complete && (
                      <div className="flex flex-wrap gap-1 pt-1">
                        {updatePreview.massBalanceFlagged && <span className={`px-1.5 py-0.5 rounded ${CRIT}`}>Mass-balance</span>}
                        {updatePreview.shortExtraFlagged && <span className={`px-1.5 py-0.5 rounded ${CRIT}`}>Short/extra &gt;2kg</span>}
                        {updatePreview.cakeFlagged && <span className={`px-1.5 py-0.5 rounded ${CRIT}`}>Oil-cake gap</span>}
                      </div>
                    )}
                    {!updatePreview.complete && (
                      <div className="opacity-60">Still settling — needs Step 3 &amp; Step 4 to score.</div>
                    )}
                  </div>
                )}
              </>
            )}

            {error && <div className="text-red-600 text-xs">{error}</div>}
            {!dbConnected && <DbWarn />}
            <button type="submit" disabled={loading || !selBatchId} className={btn}>
              {loading ? "Saving…" : "Save batch"}
            </button>
          </form>
        )}
      </div>

      {/* Ledger panel */}
      <div>
        <div className="flex flex-wrap gap-3 mb-3">
          {(() => {
            const widgetNodes: Record<string, React.ReactNode> = {
              settling: <Stat label="Batches settling" value={String(settlingCount)} />,
              oilWeek: <Stat label="Oil produced (7d)" value={kg(oilThisWeek)} />,
              khaliWaste: <Stat label="Self-crush khali/waste" value={kg(khaliWaste)} />,
              totalOil: <Stat label="Total oil produced" value={kg(totalOilProduced)} />,
            };
            return visibleWidgetIds.map((id) => <React.Fragment key={id}>{widgetNodes[id]}</React.Fragment>);
          })()}
        </div>

        {flagged.length > 0 && (
          <div className="mb-3 rounded-lg border border-red-300 bg-red-50 dark:bg-red-950/30 dark:border-red-800 px-3 py-2 text-xs">
            <div className="font-semibold text-red-800 dark:text-red-300 mb-1">Needs attention</div>
            <ul className="space-y-0.5">
              {flagged.map(({ b, y }) => (
                <li key={b.id}>
                  <strong>{b.barrel}</strong> ({b.productItem}) —{" "}
                  {[
                    y.massBalanceFlagged && `mass-balance loss ${pct(y.unaccountedLossPct)}`,
                    y.shortExtraFlagged && `short/extra ${kg(y.shortExtraOilKg)}`,
                    y.cakeFlagged && `oil-cake gap ${kg(y.cakeGapKg)}`,
                    y.yieldPoor && "poor yield",
                  ]
                    .filter(Boolean)
                    .join("; ")}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="overflow-x-auto rounded-xl border border-black/10 dark:border-white/10">
          <table className="w-full text-sm">
            <thead className="bg-black/5 dark:bg-white/5 text-left">
              <tr>
                {visibleColIds.map((id) => (
                  <th key={id} className="p-2">
                    {COLUMN_DEFS.mfg.find((c) => c.id === id)?.label ?? id}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {batches.length === 0 && (
                <tr>
                  <td colSpan={totalCols} className="p-4 text-center opacity-60">No batches yet.</td>
                </tr>
              )}
              {computed.map(({ b, y }) => {
                const cells: Record<string, React.ReactNode> = {
                  date: (
                    <>
                      {b.date}
                      <div className="opacity-50 text-[10px]">{fmtDateTime(b.createdAt)}</div>
                    </>
                  ),
                  barrel: (
                    <>
                      {b.barrel}
                      {b.mill ? <div className="opacity-50 text-[10px]">{b.mill}</div> : null}
                    </>
                  ),
                  item: b.productItem,
                  suppliers: (
                    <>
                      {(b.suppliers || []).map((s: BatchSupplierDTO, i) => (
                        <div key={i}>
                          {s.name || "—"} · {s.seedKg}kg
                        </div>
                      ))}
                    </>
                  ),
                  steps: (
                    <>
                      {b.step1Kg ?? "—"} / {b.step2Kg ?? "—"} / {b.step3Kg ?? "—"} / {b.step4Kg ?? "—"}
                    </>
                  ),
                  status: y.complete ? (
                    <span className="text-green-700 dark:text-green-400 font-medium">Complete</span>
                  ) : (
                    <span className="text-[var(--accent-ink)] font-medium">Settling</span>
                  ),
                  oil: (
                    <>
                      {kg(y.actualOilKg)}
                      {y.extractionEfficiencyPct !== null && (
                        <div className="opacity-60 text-[10px]">
                          {pct(y.extractionEfficiencyPct)} {y.yieldBand && bandPill(y)}
                        </div>
                      )}
                    </>
                  ),
                  cake: (
                    <>
                      {kg(y.actualCakeKg)}
                      <div className="opacity-50 text-[10px]">exp {kg(y.expectedCakeKg)}</div>
                    </>
                  ),
                  flags: (
                    <div className="flex flex-col gap-0.5">
                      {y.massBalanceFlagged && <span className={`px-1 rounded text-[10px] ${CRIT}`}>mass-bal</span>}
                      {y.shortExtraFlagged && <span className={`px-1 rounded text-[10px] ${CRIT}`}>short/extra</span>}
                      {y.cakeFlagged && <span className={`px-1 rounded text-[10px] ${CRIT}`}>cake</span>}
                      {y.complete && !y.massBalanceFlagged && !y.shortExtraFlagged && !y.cakeFlagged && (
                        <span className="opacity-40 text-[10px]">—</span>
                      )}
                    </div>
                  ),
                };
                const NOWRAP = new Set(["date", "steps", "oil", "cake"]);
                return (
                  <tr key={b.id} className="border-t border-black/5 dark:border-white/5 align-top">
                    {visibleColIds.map((id) => (
                      <td
                        key={id}
                        className={`p-2 ${NOWRAP.has(id) ? "whitespace-nowrap" : ""} ${
                          id === "suppliers" || id === "steps" ? "text-xs" : ""
                        }`}
                      >
                        {cells[id]}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

const inp =
  "w-full rounded border border-black/20 dark:border-white/20 bg-transparent px-2 py-1.5";
const btn =
  "w-full rounded bg-[var(--accent)] text-[var(--accent-contrast)] py-2 font-medium disabled:opacity-50";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block mb-1 opacity-70">{label}</label>
      {children}
    </div>
  );
}

function StepRow({
  label, kgVal, onKg, d, onD, t, onT,
}: {
  label: string;
  kgVal: string;
  onKg: (v: string) => void;
  d: string; onD: (v: string) => void;
  t: string; onT: (v: string) => void;
}) {
  return (
    <div>
      <label className="block mb-1 opacity-70">{label}</label>
      <div className="flex gap-2">
        <input type="number" step="0.1" value={kgVal} onChange={(e) => onKg(e.target.value)} className={`${inp} w-24`} placeholder="kg" />
        <input type="date" value={d} onChange={(e) => onD(e.target.value)} className={`${inp} flex-1`} />
        <input type="time" value={t} onChange={(e) => onT(e.target.value)} className={`${inp} w-28`} />
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-black/10 dark:border-white/10 px-3 py-2 text-sm">
      <div className="opacity-60 text-xs">{label}</div>
      <div className="font-semibold">{value}</div>
    </div>
  );
}

function DbWarn() {
  return (
    <div className="text-amber-700 dark:text-amber-400 text-xs">
      Database not connected — this will fail to save until DATABASE_URL is set.
    </div>
  );
}
