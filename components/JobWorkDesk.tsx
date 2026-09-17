"use client";

import React, { useMemo, useState } from "react";
import type { JobWorkIntakeDTO } from "@/lib/types";
import {
  CAN_TYPES,
  CanKey,
  STANDARD_RATE,
  defaultPaySplit,
  expectedSettlementWithRate,
  KHALI_SPLIT,
} from "@/lib/calculations";

function inr(n: number | null | undefined) {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

function fmtTime(iso: string) {
  // Pin the timezone so the Vercel server (UTC) and the browser (IST)
  // render the SAME string — otherwise the text differs and React throws
  // a hydration mismatch (#418/#425) that breaks interactivity.
  return new Date(iso).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Kolkata",
  });
}

const emptyCans: Record<CanKey, number> = { can15: 0, can5new: 0, can5old: 0 };

export default function JobWorkDesk({
  initialEntries,
  dbConnected,
}: {
  initialEntries: JobWorkIntakeDTO[];
  dbConnected: boolean;
}) {
  const [entries, setEntries] = useState<JobWorkIntakeDTO[]>(initialEntries);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Intake form state
  const [customer, setCustomer] = useState("");
  const [vehicleNo, setVehicleNo] = useState("");
  const [seedKg, setSeedKg] = useState<string>("");
  const [cakeOwnership, setCakeOwnership] = useState<"SHOP" | "CUSTOMER">("SHOP");
  const [advanceCustomerInr, setAdvanceCustomerInr] = useState<string>("0");
  const [advanceAutoInr, setAdvanceAutoInr] = useState<string>("0");
  const [cans, setCans] = useState<Record<CanKey, number>>(emptyCans);
  const [notes, setNotes] = useState("");

  // Pay/Edit row state
  const [payRowId, setPayRowId] = useState<string | null>(null);
  const [payRate, setPayRate] = useState<string>("");
  const [payCustomer, setPayCustomer] = useState<string>("");
  const [payAuto, setPayAuto] = useState<string>("");
  const [editRowId, setEditRowId] = useState<string | null>(null);
  const [editState, setEditState] = useState<Partial<JobWorkIntakeDTO> | null>(null);

  async function refetch() {
    try {
      const res = await fetch("/api/job-work");
      const json = await res.json();
      if (res.ok) setEntries(json.data);
    } catch {
      // leave entries as-is; UI already shows a db-not-connected state via props
    }
  }

  const seedKgNum = parseFloat(seedKg) || 0;
  const advCustomerNum = parseFloat(advanceCustomerInr) || 0;
  const advAutoNum = parseFloat(advanceAutoInr) || 0;
  const cansForCalc = useMemo(() => {
    const out: Record<string, { qty: number; rate: number }> = {};
    (Object.keys(CAN_TYPES) as CanKey[]).forEach((key) => {
      if (cans[key] > 0) out[key] = { qty: cans[key], rate: CAN_TYPES[key].rate };
    });
    return out;
  }, [cans]);

  const previewDue = useMemo(() => {
    return expectedSettlementWithRate(
      {
        seedKg: seedKgNum,
        cakeOwnership,
        advanceCustomerInr: advCustomerNum,
        advanceAutoInr: advAutoNum,
        cans: cansForCalc,
      },
      STANDARD_RATE[cakeOwnership]
    );
  }, [seedKgNum, cakeOwnership, advCustomerNum, advAutoNum, cansForCalc]);

  const khaliStock = useMemo(() => {
    return entries
      .filter((e) => e.cakeOwnership === "SHOP")
      .reduce((sum, e) => sum + (e.seedKg * KHALI_SPLIT.khaliPct) / 100, 0);
  }, [entries]);

  const unsettledCount = useMemo(() => entries.filter((e) => !e.settled).length, [entries]);

  async function submitIntake(e: React.FormEvent) {
    e.preventDefault();
    if (!customer || seedKgNum <= 0) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/job-work", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer,
          vehicleNo: vehicleNo || null,
          seedKg: seedKgNum,
          cakeOwnership,
          advanceCustomerInr: advCustomerNum,
          advanceAutoInr: advAutoNum,
          cans: cansForCalc,
          notes: notes || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "Failed to save intake");
      } else {
        setEntries((prev) => [json.data, ...prev]);
        setCustomer("");
        setVehicleNo("");
        setSeedKg("");
        setCakeOwnership("SHOP");
        setAdvanceCustomerInr("0");
        setAdvanceAutoInr("0");
        setCans(emptyCans);
        setNotes("");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save intake");
    } finally {
      setLoading(false);
      refetch();
    }
  }

  function openPayRow(entry: JobWorkIntakeDTO) {
    setEditRowId(null);
    setPayRowId(entry.id);
    const rate = STANDARD_RATE[entry.cakeOwnership];
    setPayRate(String(rate));
    const split = defaultPaySplit(entry, rate);
    setPayCustomer(split.customer.toFixed(2));
    setPayAuto(split.auto.toFixed(2));
  }

  function recomputeSplitForRate(entry: JobWorkIntakeDTO, rateStr: string) {
    const rate = parseFloat(rateStr) || STANDARD_RATE[entry.cakeOwnership];
    const split = defaultPaySplit(entry, rate);
    setPayCustomer(split.customer.toFixed(2));
    setPayAuto(split.auto.toFixed(2));
  }

  async function submitPay(entry: JobWorkIntakeDTO) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/job-work/${entry.id}/settle`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ratePerKg: parseFloat(payRate) || undefined,
          settlementCustomerInr: parseFloat(payCustomer) || 0,
          settlementAutoInr: parseFloat(payAuto) || 0,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "Failed to record payment");
      } else {
        setEntries((prev) => prev.map((e) => (e.id === entry.id ? json.data : e)));
        setPayRowId(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to record payment");
    } finally {
      setLoading(false);
      refetch();
    }
  }

  function openEditRow(entry: JobWorkIntakeDTO) {
    setPayRowId(null);
    setEditRowId(entry.id);
    setEditState({ ...entry });
  }

  async function submitEdit(entry: JobWorkIntakeDTO) {
    if (!editState) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/job-work/${entry.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editState),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "Failed to save edit");
      } else {
        setEntries((prev) => prev.map((e) => (e.id === entry.id ? json.data : e)));
        setEditRowId(null);
        setEditState(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save edit");
    } finally {
      setLoading(false);
      refetch();
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
      {/* Form panel */}
      <div className="rounded-xl border border-black/10 dark:border-white/10 p-4">
        <h2 className="font-semibold mb-3">New intake</h2>
        <form onSubmit={submitIntake} className="space-y-3 text-sm">
          <div>
            <label className="block mb-1 opacity-70">Customer</label>
            <input
              required
              value={customer}
              onChange={(e) => setCustomer(e.target.value)}
              className="w-full rounded border border-black/20 dark:border-white/20 bg-transparent px-2 py-1.5"
              placeholder="e.g. Ramesh Patil"
            />
          </div>
          <div>
            <label className="block mb-1 opacity-70">Auto / vehicle no. (optional)</label>
            <input
              value={vehicleNo}
              onChange={(e) => setVehicleNo(e.target.value)}
              className="w-full rounded border border-black/20 dark:border-white/20 bg-transparent px-2 py-1.5"
              placeholder="e.g. KA-38-A-1234"
            />
          </div>
          <div>
            <label className="block mb-1 opacity-70">Seed (kg)</label>
            <input
              required
              type="number"
              min="0.1"
              step="0.1"
              value={seedKg}
              onChange={(e) => setSeedKg(e.target.value)}
              className="w-full rounded border border-black/20 dark:border-white/20 bg-transparent px-2 py-1.5"
            />
          </div>
          <div>
            <label className="block mb-1 opacity-70">Who keeps the cake?</label>
            <div className="flex gap-3">
              <label className="flex items-center gap-1.5">
                <input
                  type="radio"
                  checked={cakeOwnership === "SHOP"}
                  onChange={() => setCakeOwnership("SHOP")}
                />
                Shop keeps cake (₹6/kg to customer)
              </label>
            </div>
            <div className="flex gap-3 mt-1">
              <label className="flex items-center gap-1.5">
                <input
                  type="radio"
                  checked={cakeOwnership === "CUSTOMER"}
                  onChange={() => setCakeOwnership("CUSTOMER")}
                />
                Customer keeps cake (₹10/kg from customer)
              </label>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block mb-1 opacity-70">Advance to customer (₹)</label>
              <input
                type="number"
                min="0"
                value={advanceCustomerInr}
                onChange={(e) => setAdvanceCustomerInr(e.target.value)}
                className="w-full rounded border border-black/20 dark:border-white/20 bg-transparent px-2 py-1.5"
              />
            </div>
            <div>
              <label className="block mb-1 opacity-70">Advance to auto (₹)</label>
              <input
                type="number"
                min="0"
                value={advanceAutoInr}
                onChange={(e) => setAdvanceAutoInr(e.target.value)}
                className="w-full rounded border border-black/20 dark:border-white/20 bg-transparent px-2 py-1.5"
              />
            </div>
          </div>
          <div>
            <label className="block mb-1 opacity-70">Oil cans taken</label>
            <div className="space-y-1">
              {(Object.keys(CAN_TYPES) as CanKey[]).map((key) => (
                <div key={key} className="flex items-center gap-2">
                  <span className="w-40 opacity-80">
                    {CAN_TYPES[key].label} (₹{CAN_TYPES[key].rate})
                  </span>
                  <input
                    type="number"
                    min="0"
                    value={cans[key]}
                    onChange={(e) =>
                      setCans((prev) => ({ ...prev, [key]: parseInt(e.target.value) || 0 }))
                    }
                    className="w-20 rounded border border-black/20 dark:border-white/20 bg-transparent px-2 py-1"
                  />
                </div>
              ))}
            </div>
          </div>
          <div>
            <label className="block mb-1 opacity-70">Notes (optional)</label>
            <input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full rounded border border-black/20 dark:border-white/20 bg-transparent px-2 py-1.5"
            />
          </div>

          <div className="rounded bg-black/5 dark:bg-white/5 px-3 py-2 text-xs">
            Expected settlement at standard rate: <strong>{inr(previewDue)}</strong>
          </div>

          {error && <div className="text-red-600 text-xs">{error}</div>}
          {!dbConnected && (
            <div className="text-amber-700 dark:text-amber-400 text-xs">
              Database not connected — this will fail to save until DATABASE_URL is set.
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded bg-amber-600 text-white py-2 font-medium disabled:opacity-50"
          >
            {loading ? "Saving…" : "Log intake"}
          </button>
        </form>
      </div>

      {/* Ledger panel */}
      <div>
        <div className="flex gap-3 mb-3">
          <div className="rounded-lg border border-black/10 dark:border-white/10 px-3 py-2 text-sm">
            <div className="opacity-60 text-xs">Khali (cake) stock</div>
            <div className="font-semibold">{khaliStock.toFixed(1)} kg</div>
          </div>
          <div className="rounded-lg border border-black/10 dark:border-white/10 px-3 py-2 text-sm">
            <div className="opacity-60 text-xs">Unsettled entries</div>
            <div className="font-semibold">{unsettledCount}</div>
          </div>
        </div>

        <div className="overflow-x-auto rounded-xl border border-black/10 dark:border-white/10">
          <table className="w-full text-sm">
            <thead className="bg-black/5 dark:bg-white/5 text-left">
              <tr>
                <th className="p-2">Time</th>
                <th className="p-2">Customer</th>
                <th className="p-2">Auto/Vehicle</th>
                <th className="p-2">Seed kg</th>
                <th className="p-2">Cake</th>
                <th className="p-2">Notes</th>
                <th className="p-2">Status</th>
                <th className="p-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {entries.length === 0 && (
                <tr>
                  <td colSpan={8} className="p-4 text-center opacity-60">
                    No entries yet.
                  </td>
                </tr>
              )}
              {entries.map((entry) => {
                const due = expectedSettlementWithRate(entry, STANDARD_RATE[entry.cakeOwnership]);
                const cansCharge = entry.cans
                  ? Object.values(entry.cans).reduce((s, c) => s + c.qty * c.rate, 0)
                  : 0;
                return (
                  <React.Fragment key={entry.id}>
                    <tr className="border-t border-black/5 dark:border-white/5 align-top">
                      <td className="p-2 whitespace-nowrap">{fmtTime(entry.createdAt)}</td>
                      <td className="p-2">
                        {entry.customer}
                        {entry.advanceCustomerInr > 0 && (
                          <span className="opacity-60"> (adv ₹{entry.advanceCustomerInr})</span>
                        )}
                        {cansCharge > 0 && <span className="opacity-60"> (cans ₹{cansCharge})</span>}
                      </td>
                      <td className="p-2">
                        {entry.vehicleNo || "—"}
                        {entry.advanceAutoInr > 0 && (
                          <span className="opacity-60"> (adv ₹{entry.advanceAutoInr})</span>
                        )}
                      </td>
                      <td className="p-2">{entry.seedKg}</td>
                      <td className="p-2">{entry.cakeOwnership === "SHOP" ? "Shop" : "Customer"}</td>
                      <td className="p-2 max-w-[160px] truncate" title={entry.notes || ""}>
                        {entry.notes || "—"}
                      </td>
                      <td className="p-2">
                        {entry.settled ? (
                          <span className="text-green-700 dark:text-green-400 font-medium">Paid</span>
                        ) : (
                          <span className="text-amber-700 dark:text-amber-400 font-medium">
                            Due {inr(due)}
                          </span>
                        )}
                      </td>
                      <td className="p-2 whitespace-nowrap">
                        {!entry.settled && (
                          <button
                            onClick={() => openPayRow(entry)}
                            className="text-amber-700 dark:text-amber-400 underline mr-2"
                          >
                            Pay
                          </button>
                        )}
                        <button onClick={() => openEditRow(entry)} className="underline opacity-80">
                          Edit
                        </button>
                      </td>
                    </tr>
                    {payRowId === entry.id && (
                      <tr className="bg-amber-50 dark:bg-amber-950/30">
                        <td colSpan={8} className="p-3">
                          <div className="flex flex-wrap items-end gap-3 text-xs">
                            <div>
                              <label className="block mb-1 opacity-70">Rate override (₹/kg)</label>
                              <input
                                value={payRate}
                                onChange={(e) => {
                                  setPayRate(e.target.value);
                                  recomputeSplitForRate(entry, e.target.value);
                                }}
                                className="w-24 rounded border border-black/20 dark:border-white/20 bg-transparent px-2 py-1"
                              />
                            </div>
                            {entry.cakeOwnership === "SHOP" ? (
                              <>
                                <div>
                                  <label className="block mb-1 opacity-70">To customer (₹)</label>
                                  <input
                                    value={payCustomer}
                                    onChange={(e) => setPayCustomer(e.target.value)}
                                    className="w-28 rounded border border-black/20 dark:border-white/20 bg-transparent px-2 py-1"
                                  />
                                </div>
                                <div>
                                  <label className="block mb-1 opacity-70">To auto (₹)</label>
                                  <input
                                    value={payAuto}
                                    onChange={(e) => setPayAuto(e.target.value)}
                                    className="w-28 rounded border border-black/20 dark:border-white/20 bg-transparent px-2 py-1"
                                  />
                                </div>
                              </>
                            ) : (
                              <div>
                                <label className="block mb-1 opacity-70">Amount (₹, customer pays shop)</label>
                                <input
                                  value={payCustomer}
                                  onChange={(e) => setPayCustomer(e.target.value)}
                                  className="w-28 rounded border border-black/20 dark:border-white/20 bg-transparent px-2 py-1"
                                />
                              </div>
                            )}
                            <button
                              onClick={() => submitPay(entry)}
                              disabled={loading}
                              className="rounded bg-amber-600 text-white px-3 py-1.5 font-medium disabled:opacity-50"
                            >
                              Save payment
                            </button>
                            <button onClick={() => setPayRowId(null)} className="underline opacity-70">
                              Cancel
                            </button>
                          </div>
                        </td>
                      </tr>
                    )}
                    {editRowId === entry.id && editState && (
                      <tr className="bg-black/5 dark:bg-white/5">
                        <td colSpan={8} className="p-3">
                          <div className="flex flex-wrap items-end gap-3 text-xs">
                            <div>
                              <label className="block mb-1 opacity-70">Customer</label>
                              <input
                                value={editState.customer ?? ""}
                                onChange={(e) =>
                                  setEditState((s) => ({ ...s, customer: e.target.value }))
                                }
                                className="w-36 rounded border border-black/20 dark:border-white/20 bg-transparent px-2 py-1"
                              />
                            </div>
                            <div>
                              <label className="block mb-1 opacity-70">Auto/Vehicle</label>
                              <input
                                value={editState.vehicleNo ?? ""}
                                onChange={(e) =>
                                  setEditState((s) => ({ ...s, vehicleNo: e.target.value }))
                                }
                                className="w-32 rounded border border-black/20 dark:border-white/20 bg-transparent px-2 py-1"
                              />
                            </div>
                            <div>
                              <label className="block mb-1 opacity-70">Seed kg</label>
                              <input
                                type="number"
                                value={editState.seedKg ?? 0}
                                onChange={(e) =>
                                  setEditState((s) => ({ ...s, seedKg: parseFloat(e.target.value) || 0 }))
                                }
                                className="w-20 rounded border border-black/20 dark:border-white/20 bg-transparent px-2 py-1"
                              />
                            </div>
                            <div>
                              <label className="block mb-1 opacity-70">Notes</label>
                              <input
                                value={editState.notes ?? ""}
                                onChange={(e) => setEditState((s) => ({ ...s, notes: e.target.value }))}
                                className="w-40 rounded border border-black/20 dark:border-white/20 bg-transparent px-2 py-1"
                              />
                            </div>
                            <button
                              onClick={() => submitEdit(entry)}
                              disabled={loading}
                              className="rounded bg-amber-600 text-white px-3 py-1.5 font-medium disabled:opacity-50"
                            >
                              Save
                            </button>
                            <button
                              onClick={() => {
                                setEditRowId(null);
                                setEditState(null);
                              }}
                              className="underline opacity-70"
                            >
                              Cancel
                            </button>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
