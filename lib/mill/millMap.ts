// Mill Desk → main app: how each mill record maps onto the app's own records. Pure functions (tested in
// lib/__tests__/millMap.test.ts). Nothing here invents a second copy of anything:
//   - every mill item gets ONE fixed id in the main table (so a retry or a re-sync updates the same row);
//   - oil goes into the app's stock ledger through the existing "mill_transfer" record (lib/stockLedger.ts);
//   - a crushing run becomes ONE Manufacturing batch (MfgBatch);
//   - barrels follow the fleet's own weighing rules (lib/barrelFleet.ts);
//   - khali stock is worked out from the weighed bags and the khali sales, never stored.
import { grossOutcome, emptyOutcome, type FleetBarrelLike } from "@/lib/barrelFleet";

const r1 = (n: number) => Math.round(n * 10) / 10;
const r2 = (n: number) => Math.round(n * 100) / 100;
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : Number(v) || 0);

/** The oil the Mill Desk crushes for itself is Karadi (safflower) oil. Change here if Mill 1 crushes another seed. */
export const OWN_OIL = { product: "Karadi oil", mill: "Mill 1" } as const;

// --------------------------------------------------------------------------- fixed ids
// A fixed primary key means a second save of the same mill item cannot make a second row.
export const ids = {
  job: (millId: string) => `mj_${millId}`.slice(0, 80),
  transfer: (ownId: string) => `mx_${ownId}`.slice(0, 80),
  own: (ownId: string) => `mo_${ownId}`.slice(0, 80),
  batch: (runId: string) => `mr_${runId}`.slice(0, 80),
};
/** Marker kept on the main-app row, so rows made before fixed ids can still be found. */
export const runMark = (runId: string) => `[mill-run:${runId}]`;

// --------------------------------------------------------------------------- oil to tank
/** Which tank the oil counts into in the app's stock. Floor barrel and small tank hold the same Karadi oil. */
export const tankKey = (): "k2" => "k2";

export interface OwnOil {
  id: string;
  kg: number;
  tank: string;
}
/** An own-oil weighing as the screen stores it: v = [kg, tank]. */
export function ownOil(id: string, v: unknown): OwnOil | null {
  if (!Array.isArray(v)) return null;
  const kg = r2(num(v[0]));
  if (!(kg > 0) || kg > 5000) return null;
  return { id, kg, tank: String(v[1] || "K2").slice(0, 30) };
}

/** The `mill_transfer` record data (what lib/stockLedger.ts reads): oil that came into Karadi stock. */
export function transferData(o: OwnOil) {
  return {
    mill: OWN_OIL.mill,
    batchId: null,
    batchLabel: null,
    toTank: tankKey(),
    oilKg: o.kg,
    note: `Mill Desk · ${o.tank}`.slice(0, 200),
    from: "mill-desk",
  };
}

// --------------------------------------------------------------------------- run → Manufacturing batch
export interface MillRunLike {
  id: string;
  time?: string;
  seedKg?: number;
  nb?: number;
  state?: string;
  oil?: [number, string][];
}
export const runOilKg = (r: MillRunLike) => r2((r.oil || []).reduce((a, x) => a + num(Array.isArray(x) ? x[0] : 0), 0));

/** The batch fields for a run. Made once the first oil of the run is weighed. */
export function batchFields(r: MillRunLike, serial: number, date: string) {
  const seedKg = r1(num(r.seedKg));
  const oil = runOilKg(r);
  return {
    mill: OWN_OIL.mill,
    barrel: `Run ${serial}`,
    productItem: OWN_OIL.product,
    date,
    suppliers: [{ name: "Own seed (Mill Desk)", seedKg }],
    step1Kg: oil > 0 ? oil : null,
    notes: [`Mill Desk · Run ${serial}`, r.nb ? `${r.nb} bag${r.nb === 1 ? "" : "s"}` : "", r.state ? `state ${r.state}` : "", runMark(r.id)].filter(Boolean).join(" · ").slice(0, 300),
  };
}
/** A run makes a batch only when it has seed and some oil. */
export const runNeedsBatch = (r: MillRunLike) => num(r.seedKg) > 0 && runOilKg(r) > 0;

// --------------------------------------------------------------------------- barrels → fleet
export interface MillBarrel {
  id: string; // BRL-03
  full?: number | null;
  empty?: number | null;
  out?: boolean;
}
export type FleetStep =
  | { do: "skip"; why: string }
  | { do: "weigh"; phase: "GROSS" | "EMPTY"; kg: number; setsTare: boolean; netKg: number | null };

/**
 * What the fleet should record for one mill barrel, judged against the barrel as the fleet holds it now.
 * The same rules as the fleet's weigh route: a full weight needs a tare; the first empty weight is the tare.
 * A barrel already showing this weight is skipped, so saving the same state twice records nothing twice.
 */
export function fleetStep(
  b: Pick<FleetBarrelLike, "status" | "tareKg" | "grossKg" | "netKg" | "capacityKg" | "lastEmptyKg" | "active" | "condition" | "code">,
  m: MillBarrel
): FleetStep {
  if (!b.active || b.condition === "RETIRED") return { do: "skip", why: `${b.code} is retired` };
  const full = num(m.full);
  const empty = num(m.empty);
  // the latest weighing wins: "empty" is set after "full" when the barrel was poured
  if (empty > 0) {
    if (b.status === "EMPTY" && b.lastEmptyKg != null && Math.abs(b.lastEmptyKg - empty) < 0.001) return { do: "skip", why: "already recorded" };
    if (b.status === "FULL" && b.grossKg != null && empty >= b.grossKg) return { do: "skip", why: "empty weight is not below the full weight" };
    const o = emptyOutcome(b, empty, false);
    return { do: "weigh", phase: "EMPTY", kg: empty, setsTare: o.setsTare, netKg: o.pouredKg };
  }
  if (full > 0) {
    if (b.tareKg == null) return { do: "skip", why: `${b.code} has no tare yet: weigh it empty once` };
    if (full <= b.tareKg) return { do: "skip", why: "full weight is not above the barrel's own weight" };
    if (b.status === "FULL" && b.grossKg != null && Math.abs(b.grossKg - full) < 0.001) return { do: "skip", why: "already recorded" };
    const o = grossOutcome(b, full);
    return { do: "weigh", phase: "GROSS", kg: full, setsTare: false, netKg: o.netKg };
  }
  return { do: "skip", why: m.out ? "sent out: name who has it in Barrel Fleet" : "nothing weighed" };
}

// --------------------------------------------------------------------------- khali stack
export interface KhaliStack {
  /** khali bags weighed at the mill since the first one */
  inKg: number;
  bags: number;
  /** khali sold (register sales of oil cake, in kg) since that day */
  soldKg: number;
  /** what should be in the stack */
  stackKg: number;
  since: string | null;
}
/** Khali stack = bags weighed in − khali sold in kg. Sales before the first weighed bag are not counted. */
export function khaliStack(bags: { date: string; kg: number }[], sales: { date: string; kg: number }[]): KhaliStack {
  const since = bags.length ? bags.reduce((m, b) => (b.date < m ? b.date : m), bags[0].date) : null;
  const inKg = r1(bags.reduce((a, b) => a + num(b.kg), 0));
  const soldKg = since ? r1(sales.filter((s) => s.date >= since).reduce((a, s) => a + num(s.kg), 0)) : 0;
  return { inKg, bags: bags.length, soldKg, stackKg: r1(inKg - soldKg), since };
}
