// Mill Counter Desk (/mill/counter): the barrel receiving counter for the mill. It does NOT keep its own
// records: every lot, gross (full) weight, tare (empty) weight and net is the app's own OilReceipt / Barrel
// (the same rows the /barrels desk shows). This file holds the small pure rules the screen needs, so they can
// be tested: which barrel is next, what a lot adds up to, which full barrels are still waiting.
import { barrelNet, checkWeigh, type Phase } from "@/lib/barrels";

export interface CBarrel {
  seq: number;
  code: string;
  grossKg: number | null;
  emptyKg: number | null;
  grossAt?: string | null;
}
export interface CLot {
  id: string;
  lotNo: string;
  date: string;
  supplierName: string;
  product: string;
  status: string;
  barrels: CBarrel[];
}

export type Step = "GROSS" | "EMPTY" | "DONE";
/** What a barrel needs next: its full weight (gross), its empty weight (tare), or nothing. */
export const stepOf = (b: Pick<CBarrel, "grossKg" | "emptyKg">): Step => (b.grossKg == null ? "GROSS" : b.emptyKg == null ? "EMPTY" : "DONE");

/** The next barrel (after `afterSeq`, then wrapping round) that still needs this weighing. */
export function nextBarrel<T extends CBarrel>(barrels: T[], afterSeq: number, phase: Phase): T | null {
  const need = (b: T) => stepOf(b) === phase;
  const sorted = [...barrels].sort((a, b) => a.seq - b.seq);
  return sorted.find((b) => b.seq > afterSeq && need(b)) ?? sorted.find((b) => need(b)) ?? null;
}

export interface LotTotals {
  barrels: number;
  fullWeighed: number; // barrels with a gross weight
  done: number; // barrels with gross and tare
  waiting: number; // full, not yet emptied
  notWeighed: number;
  /** Sums over DONE barrels only, so gross − tare = net always agrees. */
  grossKg: number;
  tareKg: number;
  netKg: number;
}
export function lotTotals(barrels: Pick<CBarrel, "grossKg" | "emptyKg">[]): LotTotals {
  let gross = 0;
  let tare = 0;
  let done = 0;
  let full = 0;
  for (const b of barrels) {
    if (b.grossKg != null) full++;
    if (b.grossKg != null && b.emptyKg != null) {
      done++;
      gross += b.grossKg;
      tare += b.emptyKg;
    }
  }
  const r = (n: number) => Math.round(n * 100) / 100;
  return {
    barrels: barrels.length,
    fullWeighed: full,
    done,
    waiting: full - done,
    notWeighed: barrels.length - full,
    grossKg: r(gross),
    tareKg: r(tare),
    netKg: r(gross - tare),
  };
}

export interface WaitingRow {
  lotId: string;
  lotNo: string;
  supplierName: string;
  product: string;
  code: string;
  seq: number;
  grossKg: number;
  since: string | null;
  days: number;
}
/** Every full barrel in an open lot that has not been emptied yet, oldest first. */
export function waitingBarrels(lots: CLot[], nowMs: number): WaitingRow[] {
  const rows: WaitingRow[] = [];
  for (const l of lots) {
    if (l.status !== "OPEN") continue;
    for (const b of l.barrels) {
      if (stepOf(b) !== "EMPTY") continue;
      const t = b.grossAt ? Date.parse(b.grossAt) : NaN;
      rows.push({ lotId: l.id, lotNo: l.lotNo, supplierName: l.supplierName, product: l.product, code: b.code, seq: b.seq, grossKg: b.grossKg as number, since: b.grossAt ?? null, days: Number.isFinite(t) ? Math.max(0, Math.floor((nowMs - t) / 86_400_000)) : 0 });
    }
  }
  return rows.sort((a, b) => (a.since ?? "").localeCompare(b.since ?? "") || a.lotNo.localeCompare(b.lotNo) || a.seq - b.seq);
}

/** Net oil received on one business day, over barrels that have both weights. */
export function netOnDay(lots: CLot[], date: string): number {
  return Math.round(lots.filter((l) => l.date === date).reduce((s, l) => s + lotTotals(l.barrels).netKg, 0) * 100) / 100;
}

/** One line for the result of a save, in plain words: "192 (full) − 12 (empty) = 180 kg oil". */
export function weighResult(phase: Phase, savedKg: number, b: Pick<CBarrel, "grossKg" | "emptyKg">): string {
  const n = (x: number) => String(Math.round(x * 100) / 100);
  if (phase === "GROSS") return `Full ${n(savedKg)} kg saved`;
  const net = barrelNet(b);
  return b.grossKg != null && net != null ? `${n(b.grossKg)} (full) − ${n(savedKg)} (empty) = ${n(net)} kg oil` : `Empty ${n(savedKg)} kg saved`;
}

/** What the screen may do with the reading on offer: save it, or say why not. Same rules the server applies. */
export function weighProblem(phase: Phase, kg: number | null, b: Pick<CBarrel, "grossKg" | "emptyKg">): string | null {
  if (kg == null) return null;
  return checkWeigh(phase, kg, b);
}

export const MANUAL_REASONS = ["Scale not working", "Weighed at the weighbridge", "Other"] as const;

/** Client id for "save this once": the server keeps the first and answers "already saved" to repeats. */
export function newClientId(rand: () => number = Math.random, now: number = Date.now()): string {
  const s = (now.toString(36) + Math.floor(rand() * 36 ** 6).toString(36).padStart(6, "0") + Math.floor(rand() * 36 ** 6).toString(36).padStart(6, "0")).toLowerCase();
  return "c" + s.replace(/[^a-z0-9]/g, "").slice(0, 24);
}
