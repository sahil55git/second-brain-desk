// Line-item helpers for the Purchase and Sales forms (pure, testable):
// put AI-drafted lines into the form, and add an item from a scanned code.
import { matchItem, type FilledLine, type ItemLike } from "@/lib/smartEntry";

export interface DraftLine {
  itemId: string;
  name: string;
  hsnCode: string;
  qty: string;
  unit: string;
  rateInr: string;
  gstRatePct: string;
}

export const blankLine = (): DraftLine => ({ itemId: "", name: "", hsnCode: "", qty: "", unit: "kg", rateInr: "", gstRatePct: "" });
const isBlank = (l: DraftLine) => !l.itemId && !l.name.trim() && !l.qty.trim() && !l.rateInr.trim();
const s = (v: number | null | undefined) => (v == null ? "" : String(v));

export interface AppliedLines {
  lines: DraftLine[];
  /** "PAWAN REF SUNFLOWER → Refined Sunflower Oil" — shown so the person can see what was matched. */
  matched: string[];
  /** Names that match no item: they stay as free-text lines. */
  unmatched: string[];
}

/** Put AI-drafted lines into the form: replace the form's lines when they are all blank, else add below. */
export function applyFilledLines(prev: DraftLine[], filled: FilledLine[], items: ItemLike[]): AppliedLines {
  const matched: string[] = [];
  const unmatched: string[] = [];
  const mapped = filled.map((f): DraftLine => {
    const m = matchItem(f.name, items);
    if (m) {
      if (m.item.name.toLowerCase() !== f.name.toLowerCase()) matched.push(`${f.name} → ${m.item.name}`);
    } else unmatched.push(f.name);
    const it = m?.item;
    return {
      itemId: it?.id ?? "",
      name: it?.name ?? f.name,
      hsnCode: f.hsnCode || it?.hsnCode || "",
      qty: s(f.qty),
      unit: f.unit || it?.unit || "kg",
      rateInr: s(f.rateInr),
      gstRatePct: f.gstRatePct != null ? s(f.gstRatePct) : it?.gstRatePct != null ? s(it.gstRatePct) : "",
    };
  });
  if (!mapped.length) return { lines: prev, matched, unmatched };
  const keep = prev.filter((l) => !isBlank(l));
  return { lines: [...keep, ...mapped], matched, unmatched };
}

/**
 * A scanned item → the form. Packs (pcs, tin, bottle…) add 1 to an existing line
 * of the same item; loose items (kg/ltr) get a new line, with the steady scale
 * weight when one is given. Returns the line to focus.
 */
export function addScannedItem(prev: DraftLine[], item: ItemLike, opts: { weightKg?: number | null } = {}): { lines: DraftLine[]; index: number } {
  const unit = (item.unit || "kg").toLowerCase();
  const loose = unit === "kg" || unit === "ltr" || unit === "l" || unit === "g";
  if (!loose) {
    const at = prev.findIndex((l) => l.itemId === item.id);
    if (at >= 0) {
      const lines = prev.map((l, i) => (i === at ? { ...l, qty: String((Number(l.qty) || 0) + 1) } : l));
      return { lines, index: at };
    }
  }
  const line: DraftLine = {
    itemId: item.id,
    name: item.name,
    hsnCode: item.hsnCode || "",
    qty: loose ? (opts.weightKg != null && opts.weightKg > 0 ? opts.weightKg.toFixed(2) : "") : "1",
    unit: item.unit || "kg",
    rateInr: "",
    gstRatePct: item.gstRatePct != null ? String(item.gstRatePct) : "",
  };
  const blankAt = prev.findIndex(isBlank);
  if (blankAt >= 0) return { lines: prev.map((l, i) => (i === blankAt ? line : l)), index: blankAt };
  return { lines: [...prev, line], index: prev.length };
}

/** Lines in the shape the checks need. */
export const toLite = (lines: DraftLine[]) =>
  lines.map((l) => ({ itemId: l.itemId || null, name: l.name, qty: Number(l.qty) || 0, rateInr: Number(l.rateInr) || 0 }));

/** One-paragraph summary of the form for the AI terminal's checks. */
export function formSummary(head: Record<string, string | number | null | undefined>, lines: DraftLine[], extra: string[] = []): string {
  const h = Object.entries(head)
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(([k, v]) => `${k}: ${v}`)
    .join("; ");
  const ls = lines
    .filter((l) => !isBlank(l))
    .map((l, i) => `  ${i + 1}. ${l.name || "?"} ${l.qty || "?"} ${l.unit} @ ₹${l.rateInr || "?"}${l.gstRatePct ? ` GST ${l.gstRatePct}%` : ""}${l.hsnCode ? ` HSN ${l.hsnCode}` : ""}`)
    .join("\n");
  return [h, ls ? `Lines:\n${ls}` : "Lines: none yet", ...extra].join("\n");
}
