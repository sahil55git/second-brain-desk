// Shared types and small helpers for the barrel fleet screens.
import type { FleetFlag, FleetSummary } from "@/lib/barrelFleet";

export interface FBarrel {
  id: string;
  code: string;
  mark: string | null;
  capacityKg: number;
  tareKg: number | null;
  tareAt: string | null;
  tareBy: string | null;
  status: "NEW" | "EMPTY" | "FULL";
  product: string | null;
  grossKg: number | null;
  grossAt: string | null;
  netKg: number | null;
  lastGrossDiffKg: number | null;
  lastEmptyKg: number | null;
  lastEmptyAt: string | null;
  location: string;
  holder: string | null;
  sinceAt: string;
  condition: string;
  notes: string | null;
  active: boolean;
  flags: FleetFlag[];
  awayDays: number | null;
}

export interface FEvent {
  id: string;
  barrelCode: string;
  action: string;
  at: string;
  recordedAt: string;
  by: string;
  source: string | null;
  scale: string | null;
  kg: number | null;
  tareKg: number | null;
  netKg: number | null;
  product: string | null;
  fromLoc: string | null;
  toLoc: string | null;
  party: string | null;
  vehicleNo: string | null;
  purpose: string | null;
  ref: string | null;
  note: string | null;
  detail: Record<string, unknown> | null;
}

export interface FleetList {
  data: FBarrel[];
  summary: FleetSummary;
  parties: string[];
  isOwner: boolean;
  defaults: { capacityKg: number; usualFillKg: number };
}

/** Oils the shop handles. The "Other" box covers anything else. */
export const PRODUCTS = ["Sunflower oil", "Rice bran oil", "Soyabean oil", "Groundnut oil", "Mustard oil", "Karadi (safflower) oil", "Goldrop"];

/** `datetime-local` value for "now" in the browser's clock. */
export function localNow(): string {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

/** "191.300" or "191,3" → number (0 when empty / not a number). */
export const toNum = (v: string) => {
  const n = Number(v.trim().replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};

export function downloadText(name: string, text: string, type = "text/csv;charset=utf-8") {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const STATUS_CHIP: Record<string, { en: string; cls: string }> = {
  NEW: { en: "No tare yet", cls: "o" },
  EMPTY: { en: "Empty", cls: "" },
  FULL: { en: "Full", cls: "g" },
};
