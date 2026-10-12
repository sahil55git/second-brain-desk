// Held bill drafts — shape and validation shared by the held-bills API and
// the sales form. Pure, so it is unit-tested without a database.

export interface HeldLine {
  itemId: string;
  name: string;
  hsnCode: string;
  qty: string;
  unit: string;
  rateInr: string;
  gstRatePct: string;
  discountPct: string;
}

export interface HeldDraft {
  partyId: string;
  date: string;
  paymentMode: "CASH" | "UPI" | "BANK" | "CREDIT" | "OTHER";
  notes: string;
  lines: HeldLine[];
}

const MODES = ["CASH", "UPI", "BANK", "CREDIT", "OTHER"] as const;
const str = (v: unknown, max = 200) => (typeof v === "string" ? v.slice(0, max) : "");

/** Discount is a percentage between 0 and 100. */
export function clampDiscount(v: unknown): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.min(100, Math.max(0, n));
}

/** Validate an incoming draft. Returns null when it is not a usable draft. */
export function parseHeldDraft(raw: unknown): HeldDraft | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const lines = Array.isArray(r.lines) ? r.lines : [];
  const cleanLines: HeldLine[] = lines
    .filter((l): l is Record<string, unknown> => !!l && typeof l === "object")
    .map((l) => ({
      itemId: str(l.itemId, 64),
      name: str(l.name),
      hsnCode: str(l.hsnCode, 16),
      qty: str(l.qty, 20),
      unit: str(l.unit, 20) || "kg",
      rateInr: str(l.rateInr, 20),
      gstRatePct: str(l.gstRatePct, 10),
      discountPct: String(clampDiscount(l.discountPct)),
    }));
  if (cleanLines.length === 0) return null;
  const mode = typeof r.paymentMode === "string" && (MODES as readonly string[]).includes(r.paymentMode) ? (r.paymentMode as HeldDraft["paymentMode"]) : "CASH";
  return {
    partyId: str(r.partyId, 64),
    date: str(r.date, 10),
    paymentMode: mode,
    notes: str(r.notes, 500),
    lines: cleanLines,
  };
}

/** The label shown in the held list. */
export function holdLabel(partyName: string | null | undefined): string {
  const n = (partyName || "").trim();
  return n || "Walk-in customer";
}
