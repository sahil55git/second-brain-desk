// Mill Desk (Mill 1 floor screen, /mill): the records the screen keeps and how a job maps onto
// the app's job-work intake. Pure functions only, so the money mapping is covered by tests
// (lib/__tests__/millDesk.test.ts). Rates and the 50/50 split come from lib/calculations.ts —
// the Mill Desk never invents its own numbers.
import type { Prisma } from "@prisma/client";
import { CAN_TYPES, defaultPaySplit, expectedSettlementWithRate, STANDARD_RATE, type CakeOwnership, type CansInput } from "@/lib/calculations";

/** Record kinds kept in OpsRecord (no new tables). */
export const MILL_KIND = {
  job: "mill_job", // a customer's job-work token (also mirrored to JobWorkIntake)
  q: "mill_q", // one weighing waiting for the counter person (status open | sorted)
  run: "mill_run", // one crushing run of our own seed (status = state)
  own: "mill_own", // our own weighings: seed to crush, oil cans to tanks, khali, buy/sell
  cust: "mill_cust", // job-work customer (name and/or village, mobile)
  barrel: "mill_barrel", // fleet barrel full / empty / out as weighed at the mill
} as const;
export type MillEntity = keyof typeof MILL_KIND;
export const LIST_KINDS: MillEntity[] = ["job", "q", "run", "cust", "barrel"];

export const MAX_ITEM_BYTES = 20_000;
export const MAX_BATCH = 400;
const ID = /^[A-Za-z0-9._|\- \u0080-￿]{1,80}$/;

export function validId(v: unknown): v is string {
  return typeof v === "string" && ID.test(v);
}

/** Plain JSON object of a sane size, or null. */
export function cleanItem(v: unknown): Record<string, unknown> | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  if (!validId(o.id)) return null;
  let s: string;
  try {
    s = JSON.stringify(o);
  } catch {
    return null;
  }
  if (s.length > MAX_ITEM_BYTES) return null;
  return JSON.parse(s);
}

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : Number(v) || 0);

export interface MillJob {
  id: string;
  tok: string;
  customer: string;
  place?: string;
  mobile?: string;
  seedKg: number;
  nb?: number;
  lines?: number[];
  cake: CakeOwnership;
  advC?: number;
  advA?: number;
  /** Advance the customer gave back; it takes that much off the advance already counted. */
  advR?: number;
  /** Same for the tempo (auto) advance. */
  advRA?: number;
  cans?: Record<string, number>;
  crushed?: boolean;
  settled?: boolean;
  given?: boolean;
  method?: string;
  oilKg?: number;
  khaliKg?: number;
}

/** Shape check for a job coming from the screen. Returns an error text or null. */
export function jobError(j: Record<string, unknown>): string | null {
  if (typeof j.tok !== "string" || !/^JW-\d{1,7}$/.test(j.tok)) return "Invoice number missing.";
  if (typeof j.customer !== "string" || !j.customer.trim()) return "Customer or village needed.";
  const kg = num(j.seedKg);
  if (!(kg > 0) || kg > 100_000) return "Seed weight is not right.";
  if (j.cake !== "SHOP" && j.cake !== "CUSTOMER") return "Who keeps the khali?";
  if (num(j.advC) < 0 || num(j.advA) < 0 || num(j.advR) < 0 || num(j.advRA) < 0) return "Advance cannot be negative.";
  if (j.cans && (typeof j.cans !== "object" || Array.isArray(j.cans))) return "Cans are not right.";
  return null;
}

export const tokNo = (tok: string) => Number(String(tok).replace(/\D/g, "")) || 0;
export const tokOf = (n: number) => "JW-" + String(n).padStart(4, "0");

/** Cans as the job-work intake stores them: {can15: {qty, rate}} with today's rate. */
export function intakeCans(cans: Record<string, number> | undefined): CansInput {
  const out: CansInput = {};
  for (const [k, q] of Object.entries(cans || {})) {
    if (k in CAN_TYPES && num(q) > 0) out[k as keyof typeof CAN_TYPES] = { qty: num(q), rate: CAN_TYPES[k as keyof typeof CAN_TYPES].rate };
  }
  return out;
}

/** The money on a job, from the app's own job-work rules. */
/** The customer advance still standing after any part of it was given back. */
export const netAdvA = (j: Pick<MillJob, "advA" | "advRA">) => Math.max(0, num(j.advA) - num(j.advRA));
export const netAdvC = (j: Pick<MillJob, "advC" | "advR">) => Math.max(0, num(j.advC) - num(j.advR));

export function jobMoney(j: Pick<MillJob, "seedKg" | "cake" | "advC" | "advA" | "advR" | "advRA" | "cans">) {
  const entry = { advanceGiven: true, seedKg: num(j.seedKg), cakeOwnership: j.cake, advanceCustomerInr: netAdvC(j), advanceAutoInr: netAdvA(j), cans: intakeCans(j.cans) };
  const rate = STANDARD_RATE[j.cake];
  const due = expectedSettlementWithRate(entry, rate);
  const split = defaultPaySplit(entry, rate);
  return { rate, due, customer: split.customer, auto: split.auto };
}

export const millMark = (id: string) => `[mill:${id}]`;

/** JobWorkIntake fields for a Mill Desk job (the intake is the record the register and cash closing read). */
export function intakeData(j: MillJob, by: string | null, serial: number | null) {
  const m = jobMoney(j);
  const place = j.place && j.place !== j.customer ? j.place : "";
  const notes = [
    "Mill Desk",
    `Inv ${j.tok.replace("JW-", "#")}`,
    serial ? `Token ${serial}` : "",
    place ? `Village ${place}` : j.customer === j.place ? "Village only" : "",
    j.mobile ? `Mobile ${j.mobile}` : "",
    j.nb ? `${j.nb} bag${j.nb === 1 ? "" : "s"}` : "",
    j.settled && j.method ? `Paid by ${String(j.method).toUpperCase()}` : "",
    j.oilKg ? `Oil ${num(j.oilKg).toFixed(1)} kg` : "",
    j.khaliKg ? `Khali out ${num(j.khaliKg).toFixed(1)} kg` : "",
    millMark(j.id),
  ]
    .filter(Boolean)
    .join(" · ");
  return {
    customer: (place ? `${j.customer} (${place})` : j.customer).slice(0, 120),
    seedKg: num(j.seedKg),
    cakeOwnership: j.cake,
    advanceCustomerInr: netAdvC(j),
    advanceAutoInr: netAdvA(j),
    cans: intakeCans(j.cans) as Prisma.InputJsonValue,
    notes: notes.slice(0, 900),
    createdByName: by,
    settled: !!j.settled,
    settlementCustomerInr: j.settled ? m.customer : null,
    settlementAutoInr: j.settled ? m.auto : null,
    settlementRatePerKg: j.settled ? m.rate : null,
    settlementAmountInr: j.settled ? m.due : null,
    settlementMode: j.settled ? (String(j.method || "").toLowerCase() === "upi" ? "UPI" : "CASH") : null,
    settledByName: j.settled ? by : null,
  };
}

/** A job is closed once its money is settled and the oil has gone out. */
export const jobClosed = (j: Pick<MillJob, "settled" | "given">) => !!(j.settled && j.given);

/** "WS-0031" → 31 */
export const slipNo = (s: unknown) => (typeof s === "string" ? Number(s.replace(/\D/g, "")) || 0 : 0);

/** IST business date "YYYY-MM-DD". */
export function bizDate(at: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(at);
}
