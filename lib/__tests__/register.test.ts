import { describe, expect, it } from "vitest";
import {
  dayTotals,
  denominationTotal,
  entryCashEffect,
  itemsFor,
  jobWorkCashEvents,
  learnItem,
  normalizeConfig,
  openingFor,
  systemCash,
  toClosingBuckets,
  toCsv,
  type RegisterEntryLike,
} from "../register";
import { computeSystemCash, expectedSettlement } from "../calculations";

const T = (h: number, m = 0) => new Date(Date.UTC(2026, 9, 3, h - 5, m - 30)).toISOString(); // IST helper

const entries: RegisterEntryLike[] = [
  { kind: "SALE", amountInr: 1540, paymentMode: "CASH", createdAt: T(10) },
  { kind: "SALE", amountInr: 900, paymentMode: "UPI", createdAt: T(11) },
  { kind: "SALE", amountInr: 700, paymentMode: "CREDIT", createdAt: T(11, 30) },
  { kind: "UDHAAR_IN", amountInr: 800, paymentMode: "CASH", createdAt: T(12) },
  { kind: "EXPENSE", amountInr: 500, paymentMode: "CASH", item: "diesel", createdAt: T(13) },
  { kind: "PAYMENT", amountInr: 2000, paymentMode: "CASH", item: "salary", createdAt: T(17) },
  { kind: "PURCHASE", amountInr: 2100, paymentMode: "CASH", item: "tins", createdAt: T(15) },
  { kind: "PIGMEE", amountInr: 1000, paymentMode: "CASH", createdAt: T(16) },
  { kind: "OWNER_DRAW", amountInr: 3000, paymentMode: "CASH", createdAt: T(21) },
];

describe("entryCashEffect", () => {
  it("only cash moves the counter; UPI and udhaar do not", () => {
    expect(entryCashEffect(entries[0])).toBe(1540);
    expect(entryCashEffect(entries[1])).toBe(0);
    expect(entryCashEffect(entries[2])).toBe(0);
    expect(entryCashEffect(entries[4])).toBe(-500);
  });
  it("pigmee and owner draw always leave the counter", () => {
    expect(entryCashEffect(entries[7])).toBe(-1000);
    expect(entryCashEffect({ ...entries[8], paymentMode: "UPI" })).toBe(-3000);
  });
});

describe("dayTotals", () => {
  it("separates cash, UPI, udhaar and not-expense movements", () => {
    const t = dayTotals(entries);
    expect(t.cashIn).toBe(2340);
    expect(t.cashOut).toBe(4600);
    expect(t.upiIn).toBe(900);
    expect(t.creditGiven).toBe(700);
    expect(t.pigmee).toBe(1000);
    expect(t.ownerDraw).toBe(3000);
  });
});

describe("job-work cash events reuse expectedSettlement's sign convention", () => {
  it("SHOP keeps cake: advance and payout leave the counter", () => {
    const j = {
      cakeOwnership: "SHOP" as const,
      seedKg: 100,
      advanceCustomerInr: 50,
      advanceAutoInr: 0,
      cans: { can15: { qty: 1, rate: 50 } },
    };
    const due = expectedSettlement(j); // 600 - 50 - 50
    expect(due).toBe(500);
    const ev = jobWorkCashEvents({
      ...j,
      settled: true,
      settlementAmountInr: due,
      settledAt: T(18),
      createdAt: T(9),
    });
    expect(ev.map((e) => e.amount)).toEqual([-50, -500]);
  });
  it("CUSTOMER keeps cake: advance and settlement come into the counter", () => {
    const ev = jobWorkCashEvents({
      cakeOwnership: "CUSTOMER",
      advanceCustomerInr: 100,
      advanceAutoInr: 0,
      settled: true,
      settlementAmountInr: 400,
      settledAt: T(18),
      createdAt: T(9),
    });
    expect(ev.map((e) => e.amount)).toEqual([100, 400]);
  });
});

describe("systemCash + toClosingBuckets", () => {
  const jw = jobWorkCashEvents({
    cakeOwnership: "SHOP",
    advanceCustomerInr: 50,
    advanceAutoInr: 0,
    settled: true,
    settlementAmountInr: 500,
    settledAt: T(14),
    createdAt: T(9),
  });

  it("midday tally only counts what was logged before the count", () => {
    const at = +new Date(T(14, 30));
    // opening 5000 +1540 +800 -500 (diesel) -50 -500 (job-work) = 6290
    expect(systemCash(5000, entries, jw, at)).toBe(6290);
  });

  it("closing buckets always sum to the same system cash (₹300 rule reused)", () => {
    for (const upto of [+new Date(T(14, 30)), undefined]) {
      const b = toClosingBuckets(5000, entries, jw, upto);
      expect(computeSystemCash(b)).toBe(systemCash(5000, entries, jw, upto));
    }
    const b = toClosingBuckets(5000, entries, jw);
    expect(b.cashOutDraw).toBe(4000);
    expect(b.cashOutSalary).toBe(2000);
    expect(b.cashOutGrn).toBe(550);
    expect(b.cashOutUpi).toBe(0);
  });
});

describe("openingFor", () => {
  const closings = [
    { date: "2026-10-01", session: "NIGHT" as const, counterCashInr: 4000, createdAt: "2026-10-01T15:30:00Z" },
    { date: "2026-10-02", session: "AFTERNOON" as const, counterCashInr: 9000, createdAt: "2026-10-02T08:30:00Z" },
    { date: "2026-10-02", session: "NIGHT" as const, counterCashInr: 12000, createdAt: "2026-10-02T15:30:00Z" },
  ];
  it("uses the last NIGHT count of an earlier day plus later movements", () => {
    const r = openingFor("2026-10-03", {}, closings, (d) => (d === "2026-10-02" ? -3000 : 0));
    expect(r).toMatchObject({ value: 9000, source: "lastClosing", fromDate: "2026-10-02" });
  });
  it("a manual override wins", () => {
    expect(openingFor("2026-10-03", { "2026-10-03": 7777 }, closings, () => 0).value).toBe(7777);
  });
  it("no earlier count -> 0", () => {
    expect(openingFor("2026-10-01", {}, closings, () => 0)).toMatchObject({ value: 0, source: "none" });
  });
});

describe("library + misc", () => {
  it("learned custom items appear before Other and are idempotent", () => {
    const cfg = normalizeConfig(null);
    const a = learnItem(cfg, "EXPENSE", "Petrol");
    const b = learnItem(a.cfg, "EXPENSE", "petrol ");
    expect(b.key).toBe(a.key);
    const list = itemsFor("EXPENSE", b.cfg).map((i) => i.en);
    expect(list.slice(-2)).toEqual(["Petrol", "Other"]);
    expect(learnItem(cfg, "EXPENSE", "diesel").key).toBe("diesel");
  });
  it("denomination total", () => {
    expect(denominationTotal({ "500": 12, "200": 4, "100": 20, "50": 3 }, 1650)).toBe(10600);
  });
  it("csv escapes commas and quotes", () => {
    const csv = toCsv([
      { date: "d", time: "t", side: "in", type: "Sale", item: 'a,"b"', qty: "", unit: "", rate: "", party: "", mode: "CASH", amount: 1, notes: "" },
    ]);
    expect(csv.split("\n")[1]).toContain('"a,""b"""');
  });
});

import { freshCrushStats, freshCrushTotals, normalizeFreshCrush, suggestedExtraKg } from "../register";

describe("fresh crush sale", () => {
  it("is money in and counts as sales in the closing buckets", () => {
    const e = { kind: "FRESH_CRUSH" as const, amountInr: 2400, paymentMode: "CASH" as const, createdAt: T(11) };
    expect(entryCashEffect(e)).toBe(2400);
    expect(toClosingBuckets(0, [e], []).cashInSales).toBe(2400);
    expect(toClosingBuckets(0, [{ ...e, paymentMode: "UPI" }], []).cashInSales).toBe(0);
  });
  it("yield, mass-balance loss and the 2% flag (same rule as oil_yield_tracker.py)", () => {
    const ok = freshCrushStats({ seedKg: 100, oilKg: 32, extraKg: 2, cakeKg: 67, soldKg: 30 });
    expect(ok.yieldPct).toBe(32);
    expect(ok.lossKg).toBe(1);
    expect(ok.lossFlag).toBe(false);
    expect(ok.unaccountedOilKg).toBe(0);
    const bad = freshCrushStats({ seedKg: 100, oilKg: 32, extraKg: 0, cakeKg: 60 });
    expect(bad.lossPct).toBe(8);
    expect(bad.lossFlag).toBe(true);
  });
  it("suggests extra-to-tank only when the sale is in kg and fits", () => {
    expect(suggestedExtraKg(32, 30)).toBe(2);
    expect(suggestedExtraKg(32, null)).toBeNull();
    expect(suggestedExtraKg(32, 40)).toBeNull();
  });
  it("rejects impossible numbers", () => {
    expect(normalizeFreshCrush({ seedKg: 100, oilKg: 120 })).toBeNull(); // more oil than seed
    expect(normalizeFreshCrush({ seedKg: 100, oilKg: 30, extraKg: 40 })).toBeNull(); // extra > oil
    expect(normalizeFreshCrush({ seedKg: 100, oilKg: 30, cakeKg: 90 })).toBeNull(); // oil+cake > seed
    expect(normalizeFreshCrush({ seedKg: 100, oilKg: 30, soldKg: 25, extraKg: 10 })).toBeNull(); // sold+extra > oil
    expect(normalizeFreshCrush({ seedKg: 100, oilKg: 30, soldKg: 25, extraKg: 5, extraTo: " Barrel A1 " })).toMatchObject({
      extraTo: "Barrel A1",
      cakeKg: 0,
    });
  });
  it("totals by seed and by tank", () => {
    const t = freshCrushTotals([
      { kind: "FRESH_CRUSH", item: "groundnut", amountInr: 2000, details: { seedKg: 50, oilKg: 20, extraKg: 2, extraTo: "Tank 1", cakeKg: 29.5 } },
      { kind: "FRESH_CRUSH", item: "groundnut", amountInr: 1000, details: { seedKg: 25, oilKg: 10, extraKg: 0, cakeKg: 14.8 } },
      { kind: "SALE", item: "groundnut", amountInr: 999 },
    ]);
    expect(t.count).toBe(2);
    expect(t.amount).toBe(3000);
    expect(t.bySeed.groundnut).toMatchObject({ seedKg: 75, oilKg: 30, extraKg: 2, count: 2 });
    expect(t.extraByTank).toEqual({ "Tank 1": 2 });
  });
});
