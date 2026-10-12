// Stock corrections — pure rules, unit-tested. Each correction is its own
// entry; the book figure is never overwritten.

export const ADJUST_REASONS = [
  { key: "COUNT_DIFFERENCE", en: "Count difference", kn: "ಎಣಿಕೆ ವ್ಯತ್ಯಾಸ" },
  { key: "BREAKAGE", en: "Breakage / leak", kn: "ಒಡೆದದ್ದು / ಸೋರಿಕೆ" },
  { key: "SPILLAGE", en: "Spillage", kn: "ಚೆಲ್ಲಿದ್ದು" },
  { key: "OPENING_CORRECTION", en: "Opening balance fix", kn: "ಆರಂಭಿಕ ಬಾಕಿ ತಿದ್ದುಪಡಿ" },
  { key: "OTHER", en: "Other (note required)", kn: "ಇತರೆ (ಟಿಪ್ಪಣಿ ಅಗತ್ಯ)" },
] as const;

export type AdjustReason = (typeof ADJUST_REASONS)[number]["key"] | "REVERSAL";

const round3 = (n: number) => Math.round(n * 1000) / 1000;

export interface AdjustRecord {
  id: string;
  itemId: string;
  date: string;
  bookQty: number;
  actualQty: number;
  qtyDelta: number;
  reason: AdjustReason;
  note: string | null;
  reversesId: string | null;
}

/** The change a count implies: actual minus book, rounded to 3 dp. Null when nothing changes. */
export function deltaFor(bookQty: number, actualQty: number): number | null {
  if (!Number.isFinite(bookQty) || !Number.isFinite(actualQty) || actualQty < 0) return null;
  const d = round3(actualQty - bookQty);
  return d === 0 ? null : d;
}

export function validateCorrection(input: { actualQty: unknown; reason: unknown; note: unknown }): { ok: true; reason: AdjustReason; note: string | null; actualQty: number } | { ok: false; error: string } {
  const actual = Number(input.actualQty);
  if (input.actualQty === "" || input.actualQty === null || input.actualQty === undefined || !Number.isFinite(actual) || actual < 0) {
    return { ok: false, error: "Enter the counted quantity (zero or more)." };
  }
  const reason = ADJUST_REASONS.map((r) => r.key as string).includes(String(input.reason)) ? (input.reason as AdjustReason) : null;
  if (!reason) return { ok: false, error: "Choose a reason for the correction." };
  const note = typeof input.note === "string" && input.note.trim() ? input.note.trim().slice(0, 300) : null;
  if (reason === "OTHER" && !note) return { ok: false, error: "Write a note when the reason is Other." };
  return { ok: true, reason, note, actualQty: round3(actual) };
}

/** Quantity book at the time of a correction: opening + bought - sold kept + all earlier corrections. */
export function bookQtyFor(
  itemId: string,
  data: {
    openingStockQty: number;
    purchaseQty: number;
    soldKeptQty: number;
    adjustments: Pick<AdjustRecord, "itemId" | "qtyDelta">[];
  }
): number {
  const adj = data.adjustments.filter((a) => a.itemId === itemId).reduce((s, a) => s + a.qtyDelta, 0);
  return round3(data.openingStockQty + data.purchaseQty - data.soldKeptQty + adj);
}

/** The reversing entry for a correction. Refused for reversals and for corrections already undone. */
export function reversalFor(orig: AdjustRecord, all: AdjustRecord[]): { ok: true; qtyDelta: number } | { ok: false; error: string } {
  if (orig.reason === "REVERSAL") return { ok: false, error: "A reversal cannot itself be undone." };
  if (all.some((a) => a.reversesId === orig.id)) return { ok: false, error: "This correction has already been undone." };
  return { ok: true, qtyDelta: round3(-orig.qtyDelta) };
}

export function reasonLabel(reason: AdjustReason): string {
  if (reason === "REVERSAL") return "Undo";
  return ADJUST_REASONS.find((r) => r.key === reason)?.en ?? reason;
}
