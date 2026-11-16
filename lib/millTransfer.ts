// Mill → tank transfer log (SOP self-crushing step 7): every time finished oil is moved from
// a mill barrel into K2 (or straight into tank 1) it gets its own entry: which mill, which
// batch, the date and the kg. The tank's own reading is not enough to show that it happened.
// Stored as OpsRecord kind "mill_transfer". Pure functions, tested.
import { WEIGH_MAX_KG } from "./barrels";

export const TRANSFER_TANKS = [
  { key: "k2", name: "K2 tank" },
  { key: "tank1", name: "Karadi tank 1" },
] as const;
export type TransferTank = (typeof TRANSFER_TANKS)[number]["key"];
export const MILLS = ["Mill 1", "Mill 2"] as const;
/** Finished oil should not sit in the mill barrel longer than this after the full decant. */
export const TRANSFER_WAIT_DAYS = 2;

export interface TransferData {
  mill: string;
  batchId: string | null;
  /** how the batch looked when it was logged, e.g. "12 Nov · Mill 1 · Barrel 2" */
  batchLabel: string | null;
  toTank: TransferTank;
  oilKg: number;
  note: string | null;
}

export type TransferCheck = { ok: true; data: TransferData } | { ok: false; error: string };

/** Checks what the form sent. Never guesses a missing mill, tank or weight. */
export function checkTransfer(input: unknown): TransferCheck {
  const b = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const mill = typeof b.mill === "string" ? b.mill.trim() : "";
  if (!(MILLS as readonly string[]).includes(mill)) return { ok: false, error: "Choose Mill 1 or Mill 2." };
  const toTank = b.toTank;
  if (toTank !== "k2" && toTank !== "tank1") return { ok: false, error: "Choose the tank the oil went into." };
  const oilKg = typeof b.oilKg === "number" ? b.oilKg : typeof b.oilKg === "string" && b.oilKg.trim() ? Number(b.oilKg) : NaN;
  if (!Number.isFinite(oilKg) || oilKg <= 0 || oilKg > WEIGH_MAX_KG) return { ok: false, error: "Enter the oil moved, in kg." };
  const str = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
  return { ok: true, data: { mill, batchId: str(b.batchId, 40), batchLabel: str(b.batchLabel, 80), toTank, oilKg: Math.round(oilKg * 100) / 100, note: str(b.note, 200) } };
}

export interface TransferRow {
  id: string;
  date: string;
  by: string | null;
  data: TransferData;
}
export interface BatchLite {
  id: string;
  date: string;
  mill: string | null;
  barrel: string;
  step3Kg: number | null;
  step3Date: string | null;
}
export interface BatchMoved {
  batchId: string;
  label: string;
  decantKg: number;
  movedKg: number;
  /** decanted oil not yet logged as moved (never below zero) */
  leftKg: number;
  daysSinceDecant: number;
  /** decanted more than TRANSFER_WAIT_DAYS ago and some oil is still not logged as moved */
  waiting: boolean;
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const days = (from: string, to: string) => Math.max(0, Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from.slice(0, 10)}T00:00:00Z`)) / 86400000));

export function batchLabel(b: BatchLite): string {
  return [b.date.slice(0, 10), b.mill || "mill ?", b.barrel ? `Barrel ${b.barrel}` : ""].filter(Boolean).join(" · ");
}

/**
 * For each batch whose full decant (step 3) is logged: how much of that oil has a transfer
 * entry. A kilo or less of difference is weighing noise, not oil left behind.
 */
export function transferSummary(batches: BatchLite[], transfers: TransferRow[], today: string): { batches: BatchMoved[]; unlinkedKg: number; totalKg: number } {
  const moved = new Map<string, number>();
  let unlinked = 0;
  let total = 0;
  for (const t of transfers) {
    total += t.data.oilKg;
    if (t.data.batchId) moved.set(t.data.batchId, (moved.get(t.data.batchId) || 0) + t.data.oilKg);
    else unlinked += t.data.oilKg;
  }
  const out: BatchMoved[] = [];
  for (const b of batches) {
    if (!(b.step3Kg && b.step3Kg > 0)) continue;
    const movedKg = r2(moved.get(b.id) || 0);
    const leftKg = r2(Math.max(0, b.step3Kg - movedKg));
    const since = days(b.step3Date || b.date, today);
    out.push({ batchId: b.id, label: batchLabel(b), decantKg: b.step3Kg, movedKg, leftKg, daysSinceDecant: since, waiting: leftKg > 1 && since > TRANSFER_WAIT_DAYS });
  }
  out.sort((a, b) => Number(b.waiting) - Number(a.waiting) || a.daysSinceDecant - b.daysSinceDecant);
  return { batches: out, unlinkedKg: r2(unlinked), totalKg: r2(total) };
}
