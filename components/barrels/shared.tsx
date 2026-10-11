// Shared bits for the barrel desk screens: types, tiny helpers, bilingual label.
import type { BarrelState, ReceiptSummary } from "@/lib/barrels";

export interface BarrelRow {
  id: string;
  seq: number;
  code: string;
  supplierMark: string | null;
  declaredNetKg: number | null;
  grossKg: number | null;
  grossAt: string | null;
  grossBy: string | null;
  grossSource: string | null;
  grossScale: string | null;
  grossNote: string | null;
  grossRecordedAt?: string | null;
  emptyKg: number | null;
  emptyAt: string | null;
  emptyBy: string | null;
  emptySource: string | null;
  emptyScale: string | null;
  emptyNote: string | null;
  emptyRecordedAt?: string | null;
  net: number | null;
  state: BarrelState;
}
export interface Lot {
  id: string;
  lotNo: string;
  date: string;
  supplierName: string;
  product: string;
  vehicleNo: string | null;
  challanNo: string | null;
  rateInrPerKg: number | null;
  declaredNetKg: number | null;
  declaredBarrels: number | null;
  tankTarget: string | null;
  status: string;
  closeNote: string | null;
  notes: string | null;
  createdBy: string;
  barrels: BarrelRow[];
  summary: ReceiptSummary;
}
export interface Tick {
  id: string;
  source: string;
  weightKg: number;
  settledAt: string;
  usedAt: string | null;
  usedBarrelCode: string | null;
}
export interface EventRow {
  id: string;
  action: string;
  barrelCode: string | null;
  detail: Record<string, unknown> | null;
  by: string;
  at: string;
}

export const kg = (n: number | null | undefined) => (n == null ? "—" : `${Math.round(n * 100) / 100}`);
export const kg1 = (n: number | null | undefined) => (n == null ? "—" : (Math.round(n * 10) / 10).toFixed(1));
export const rs = (n: number) => "₹" + Math.round(n).toLocaleString("en-IN");
export const pad = (n: number) => String(n).padStart(2, "0");

/** "11 Oct, 1:49 pm" in Indian time. */
export const when = (t: string | null | undefined) =>
  t ? new Date(t).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" }) : "";
/** "11 Oct 2026, 1:49:05 pm" — full stamp for slips and reports. */
export const whenFull = (t: string | null | undefined) =>
  t ? new Date(t).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", second: "2-digit", hour12: true, timeZone: "Asia/Kolkata" }) : "";
export const dmy = (d: string) => d.split("-").reverse().join("-");

export async function api<T = unknown>(path: string, init?: RequestInit & { json?: unknown }): Promise<T & { error?: string }> {
  const res = await fetch(path, {
    ...init,
    headers: init?.json ? { "Content-Type": "application/json" } : undefined,
    body: init?.json ? JSON.stringify(init.json) : undefined,
    cache: "no-store",
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error || `Something went wrong (${res.status})`);
  return j;
}

export const L = ({ en, kn }: { en: string; kn: string }) => (
  <>
    {en}
    <span className="bd-kn">{kn}</span>
  </>
);

export const STATE_CHIP: Record<string, { en: string; kn: string; cls: string }> = {
  NOT_STARTED: { en: "Not started", kn: "ಶುರುವಾಗಿಲ್ಲ", cls: "" },
  WEIGHING_IN: { en: "Weighing full", kn: "ತುಂಬಿದ ತೂಕ ನಡೆಯುತ್ತಿದೆ", cls: "o" },
  UNLOADING: { en: "Emptying", kn: "ಖಾಲಿ ಮಾಡುತ್ತಿದ್ದಾರೆ", cls: "b" },
  RECONCILED: { en: "All weighed", kn: "ಎಲ್ಲಾ ತೂಕ ಆಯಿತು", cls: "g" },
};

export const BARREL_CHIP: Record<BarrelState, { en: string; cls: string }> = {
  NEW: { en: "Not weighed", cls: "" },
  FULL: { en: "Full — waiting to empty", cls: "o" },
  DONE: { en: "Emptied ✓", cls: "g" },
};
