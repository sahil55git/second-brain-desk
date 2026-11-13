// Lot numbers for packed oil (SOP packaged line, step 2: a lot number and date per filling run,
// for FSSAI traceability and recall). A filling run is an OpsRecord of kind "pack_run"; this adds
// the lot, the oil used and the tank it came from to that same record. Pure, tested.

export interface PackRunRec {
  id: string;
  date: string;
  by?: string | null;
  data: Record<string, unknown>;
}
export interface PackRunRow {
  id: string;
  date: string;
  sku: string;
  units: number;
  lot: string | null;
  oilKg: number | null;
  fromTank: string | null;
  /** oil per unit in kg, when both are known */
  kgPerUnit: number | null;
}

/** "Karadi 1L" → "KAR", "Ekatva 500 ml" → "EKA". Letters only; "LOT" when there are none. */
export function lotPrefix(sku: string): string {
  const letters = sku.toUpperCase().replace(/[^A-Z]/g, "");
  return letters.slice(0, 3) || "LOT";
}

/** Next lot for this product and day: KAR-261113-1, then -2 … Never reuses a number already on a run. */
export function nextLot(sku: string, date: string, existingLots: (string | null | undefined)[]): string {
  const base = `${lotPrefix(sku)}-${date.slice(2, 4)}${date.slice(5, 7)}${date.slice(8, 10)}-`;
  let max = 0;
  for (const l of existingLots) {
    if (typeof l !== "string" || !l.startsWith(base)) continue;
    const n = Number(l.slice(base.length));
    if (Number.isInteger(n) && n > max) max = n;
  }
  return `${base}${max + 1}`;
}

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : null);
const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

/** Filling runs, newest first. Older runs saved before lots existed show with no lot. */
export function packRuns(recs: PackRunRec[]): PackRunRow[] {
  return recs
    .map((r) => {
      const units = num(r.data.units) ?? 0;
      const oilKg = num(r.data.oilKg);
      return { id: r.id, date: r.date, sku: str(r.data.sku) ?? "", units, lot: str(r.data.lot), oilKg, fromTank: str(r.data.fromTank), kgPerUnit: oilKg && units ? Math.round((oilKg / units) * 1000) / 1000 : null };
    })
    .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
}
