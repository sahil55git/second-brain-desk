import { describe, expect, it } from "vitest";
import { basisFor, ledgerCounts, ledgerDays, ledgerMoves, ledgerSettings, LEDGER_DEFAULT, productKeyFor, stockLedger, type CountPoint, type LedgerMove } from "@/lib/stockLedger";
import type { BizData } from "@/lib/bizReports";

const at = (date: string, hhmm: string) => Date.parse(`${date}T${hhmm}:00+05:30`);
const move = (product: string, date: string, hhmm: string, kg: number, dir: "in" | "out", approx = false): LedgerMove => ({ product, date, at: at(date, hhmm), kg, dir, source: dir === "in" ? "register purchase" : "register sale", approx });
const count = (product: string, date: string, session: "AFTERNOON" | "NIGHT", kg: number): CountPoint => ({ product, date, session, at: at(date, session === "NIGHT" ? "21:00" : "13:00"), kg });
const row = (l: ReturnType<typeof stockLedger>, key: string) => l.rows.find((r) => r.key === key)!;

describe("productKeyFor", () => {
  it("maps the names people type to the ten tallied oils", () => {
    const cases: [string, string | null][] = [
      ["sunflower", "sf"], ["Sun Flower Oil 15kg tin", "sf"], ["sf", "sf"], ["karadi", "karadi1"], ["Safflower oil", "karadi1"], ["K2 tank", "k2"], ["k-2", "k2"],
      ["Groundnut Oil", "groundnut"], ["shenga", "groundnut"], ["Gold Drop", "golddrop"], ["goldrop", "golddrop"], ["Soyabean tank", "soyabean"], ["soya oil", "soyabean"],
      ["Coconut Oil", "coconut"], ["tea powder", "teapowder"], ["Til Oil", "til"], ["Mustard", "mustard"], ["karadi1", "karadi1"],
      ["cake", null], ["Ekatva", null], ["seed", null], ["diesel", null], ["", null], ["tilak", null], ["steam", null],
    ];
    for (const [name, key] of cases) expect(productKeyFor(name), name).toBe(key);
    expect(productKeyFor(null)).toBeNull();
  });
  it("prefers Gold Drop over Sunflower when a name has both", () => {
    expect(productKeyFor("Gold Drop sunflower oil")).toBe("golddrop");
  });
});

describe("settings and modes", () => {
  it("falls back to hybrid and drops anything it does not know", () => {
    expect(ledgerSettings(null)).toEqual(LEDGER_DEFAULT);
    expect(ledgerSettings({ mode: "magic", perProduct: { sf: "book", nope: "book", til: "x" }, bookStart: "1 Nov" })).toEqual({ mode: "hybrid", perProduct: { sf: "book" }, bookStart: null });
    expect(ledgerSettings({ mode: "book", bookStart: "2026-11-01" })).toMatchObject({ mode: "book", bookStart: "2026-11-01" });
  });
  it("physical and book apply to every oil; hybrid follows tank or not, with the owner's overrides", () => {
    const s = ledgerSettings;
    expect(["sf", "til"].map((k) => basisFor(k, s({ mode: "physical" })))).toEqual(["physical", "physical"]);
    expect(["sf", "til"].map((k) => basisFor(k, s({ mode: "book" })))).toEqual(["book", "book"]);
    expect(["sf", "golddrop", "karadi1", "k2", "groundnut", "soyabean"].map((k) => basisFor(k, s({ mode: "hybrid" })))).toEqual(Array(6).fill("physical"));
    expect(["coconut", "teapowder", "til", "mustard"].map((k) => basisFor(k, s({ mode: "hybrid" })))).toEqual(Array(4).fill("book"));
    expect(basisFor("sf", s({ mode: "hybrid", perProduct: { sf: "book" } }))).toBe("book");
    expect(basisFor("sf", s({ mode: "physical", perProduct: { sf: "book" } }))).toBe("physical"); // overrides are for hybrid only
  });
});

describe("stockLedger", () => {
  const counts = [count("sf", "2026-11-01", "NIGHT", 1000), count("sf", "2026-11-05", "NIGHT", 1350)];
  const moves = [
    move("sf", "2026-11-02", "10:00", 900, "in"),
    move("sf", "2026-11-03", "11:00", 500, "out"),
    move("sf", "2026-11-05", "22:30", 40, "out"), // after the closing count on the 5th
    move("sf", "2026-11-06", "09:00", 60, "out"),
  ];
  it("carries the last count forward, runs the book from the first count, and shows the gap", () => {
    const r = row(stockLedger(moves, counts, [], "2026-11-06", { mode: "physical" }), "sf");
    expect(r.counted).toEqual({ kg: 1350, date: "2026-11-05", session: "NIGHT" });
    expect(r).toMatchObject({ inSinceKg: 0, outSinceKg: 100, carriedKg: 1250 });
    expect(r.bookFrom).toEqual({ kg: 1000, date: "2026-11-01" });
    expect(r).toMatchObject({ bookInKg: 900, bookOutKg: 600, bookKg: 1300, gapKg: -50, gapPct: -3.85, flag: true, countAgeDays: 1 });
    expect(r).toMatchObject({ basis: "physical", stockKg: 1250 });
  });
  it("switching mode changes only which figure is the stock", () => {
    const phys = row(stockLedger(moves, counts, [], "2026-11-06", { mode: "physical" }), "sf");
    const book = row(stockLedger(moves, counts, [], "2026-11-06", { mode: "book" }), "sf");
    expect(book).toMatchObject({ basis: "book", stockKg: 1300 });
    expect({ ...book, basis: 0, stockKg: 0 }).toEqual({ ...phys, basis: 0, stockKg: 0 });
    expect(row(stockLedger(moves, counts, [], "2026-11-06", { mode: "hybrid", perProduct: { sf: "book" } }), "sf").stockKg).toBe(1300);
  });
  it("answers for an earlier day: later counts and movements are not seen", () => {
    const r = row(stockLedger(moves, counts, [], "2026-11-04", { mode: "physical" }), "sf");
    expect(r.counted!.date).toBe("2026-11-01");
    expect(r).toMatchObject({ carriedKg: 1400, bookKg: 1400, gapKg: 0, flag: false, countAgeDays: 3 });
  });
  it("starts the book from the first count on or after the owner's start date", () => {
    const r = row(stockLedger(moves, counts, [], "2026-11-06", { mode: "book", bookStart: "2026-11-03" }), "sf");
    expect(r.bookFrom).toEqual({ kg: 1350, date: "2026-11-05" });
    expect(r).toMatchObject({ bookKg: 1250, gapKg: 0 });
  });
  it("does not flag a small gap: under 1 kg, or 1 % or less of the book", () => {
    const base = [count("sf", "2026-11-01", "NIGHT", 1000)];
    const small = stockLedger([move("sf", "2026-11-02", "10:00", 0.6, "out")], [...base, count("sf", "2026-11-02", "NIGHT", 1000)], [], "2026-11-02");
    expect(row(small, "sf")).toMatchObject({ gapKg: 0.6, flag: false });
    const onePct = stockLedger([], [...base, count("sf", "2026-11-02", "NIGHT", 990)], [], "2026-11-02");
    expect(row(onePct, "sf")).toMatchObject({ gapKg: -10, gapPct: -1, flag: false });
    const more = stockLedger([], [...base, count("sf", "2026-11-02", "NIGHT", 985)], [], "2026-11-02");
    expect(row(more, "sf").flag).toBe(true);
  });
  it("an oil never counted has no stock figure, however much moved", () => {
    const l = stockLedger([move("til", "2026-11-02", "10:00", 50, "in")], [], [], "2026-11-06", { mode: "book" });
    expect(row(l, "til")).toMatchObject({ stockKg: null, counted: null, carriedKg: null, bookKg: null, gapKg: null, flag: false, countAgeDays: null });
    expect(l.totals.neverCounted).toBe(l.rows.length);
  });
  it("adds Karadi tank 1 and K2 into one line, so oil moved between them makes no gap", () => {
    const c = [count("karadi1", "2026-11-01", "NIGHT", 300), count("k2", "2026-11-01", "NIGHT", 200), count("karadi1", "2026-11-03", "NIGHT", 380), count("k2", "2026-11-03", "NIGHT", 70)];
    const m = [move("karadi1", "2026-11-02", "10:00", 50, "out")]; // 130 kg went K2 → tank 1, not logged
    const l = stockLedger(m, c, [], "2026-11-03", { mode: "physical" });
    expect(l.rows.some((r) => r.key === "karadi1" || r.key === "k2")).toBe(false);
    expect(row(l, "karadi")).toMatchObject({ members: ["karadi1", "k2"], counted: { kg: 450, date: "2026-11-03", session: "NIGHT" }, carriedKg: 450, bookKg: 450, gapKg: 0 });
  });
  it("the Karadi line still works when only one of the two tanks was ever counted", () => {
    const l = stockLedger([move("k2", "2026-11-02", "10:00", 100, "in")], [count("karadi1", "2026-11-01", "NIGHT", 300)], [], "2026-11-03", { mode: "physical" });
    expect(row(l, "karadi")).toMatchObject({ counted: { kg: 300 }, carriedKg: 300, bookKg: 300 }); // the uncounted tank adds nothing
  });
  it("marks a row that used litre entries and totals the stock", () => {
    const l = stockLedger([move("sf", "2026-11-02", "10:00", 9.1, "out", true)], [count("sf", "2026-11-01", "NIGHT", 100), count("til", "2026-11-01", "NIGHT", 20)], [], "2026-11-02", { mode: "physical" });
    expect(row(l, "sf")).toMatchObject({ approx: true, stockKg: 90.9 });
    expect(l.totals).toMatchObject({ stockKg: 110.9, flagged: 0 });
  });
});

describe("ledgerMoves", () => {
  const empty: BizData = { sales: [], purchases: [], expenses: [], register: [], jobWork: [], mfg: [], closings: [], items: [] };
  const reg = (o: Record<string, unknown>) => ({ id: "r", date: "2026-11-02", kind: "SALE", item: null, itemLabel: null, qty: null, unit: null, rateInr: null, amountInr: 100, paymentMode: "CASH", partyName: null, notes: null, createdAt: "2026-11-02T05:00:00.000Z", ...o }) as BizData["register"][number];
  it("reads register sales and purchases, converting litres and keeping the entry's own time", () => {
    const { moves } = ledgerMoves({ ...empty, register: [reg({ item: "sunflower", qty: 5, unit: "kg" }), reg({ kind: "PURCHASE", item: "other", itemLabel: "Soyabean oil", qty: 100, unit: "ltr" })] });
    expect(moves).toEqual([
      { product: "sf", date: "2026-11-02", at: Date.parse("2026-11-02T05:00:00.000Z"), kg: 5, dir: "out", source: "register sale", approx: false },
      { product: "soyabean", date: "2026-11-02", at: Date.parse("2026-11-02T05:00:00.000Z"), kg: 91, dir: "in", source: "register purchase", approx: true },
    ]);
  });
  it("puts an entry typed on another day at noon of its business date", () => {
    const { moves } = ledgerMoves({ ...empty, register: [reg({ item: "sunflower", qty: 5, unit: "kg", date: "2026-11-01" })] });
    expect(moves[0].at).toBe(at("2026-11-01", "12:00"));
  });
  it("reports what it cannot count instead of dropping it", () => {
    const { moves, notCounted } = ledgerMoves({ ...empty, register: [reg({}), reg({}), reg({ item: "cake", qty: 500, unit: "kg" }), reg({ item: "sunflower", qty: 3, unit: "pcs" }), reg({ item: "sunflower", qty: null })] });
    expect(moves).toEqual([]);
    expect(notCounted).toEqual([
      { name: "Total sale", why: "sale saved as one total, no item", entries: 2, qty: 0 },
      { name: "cake", why: "not a tallied oil", entries: 1, qty: 500 },
      { name: "sunflower", why: "unit is not kg or litre", entries: 1, qty: 3 },
    ]);
  });
  it("fresh crush adds only the extra oil, to the tank it was poured into", () => {
    const { moves } = ledgerMoves({ ...empty, register: [reg({ kind: "FRESH_CRUSH", item: "groundnut", qty: 4, unit: "kg", details: { seedKg: 20, oilKg: 8, soldKg: 4, extraKg: 4, extraTo: "Groundnut tank", cakeKg: 11.8 } }), reg({ kind: "FRESH_CRUSH", item: "karadi", qty: 4, unit: "kg", details: { extraKg: 0 } })] });
    expect(moves).toHaveLength(1);
    expect(moves[0]).toMatchObject({ product: "groundnut", kg: 4, dir: "in", source: "fresh crush to tank" });
  });
  it("reads bills (kept quantity only), mill transfers and packing runs", () => {
    const d = {
      ...empty,
      sales: [{ date: "2026-11-02", createdAt: "2026-11-02T06:00:00.000Z", lineItems: [{ name: "Sunflower Oil", qty: 15, unit: "kg", returnedQty: 5 }, { name: "Karadi oil", qty: 2, unit: "kg", returnedQty: 2 }] }],
      purchases: [{ date: "2026-11-02", lineItems: [{ name: "Gold Drop", qty: 180, unit: "kg" }] }],
    } as unknown as BizData;
    const ops = [
      { id: "o1", kind: "mill_transfer", date: "2026-11-02", data: { toTank: "k2", oilKg: 150 } },
      { id: "o2", kind: "mill_transfer", date: "2026-11-02", data: { toTank: "tank1", oilKg: 30 } },
      { id: "o3", kind: "pack_run", date: "2026-11-02", data: { sku: "Karadi 1L", units: 50, oilKg: 45.5, fromTank: "Karadi tank" } },
      { id: "o4", kind: "pack_run", date: "2026-11-02", data: { sku: "Karadi 1L", units: 50 } }, // older run: no oil recorded
    ];
    const got = ledgerMoves(d, ops).moves.map((m) => [m.product, m.dir, m.kg, m.source]);
    expect(got).toEqual(expect.arrayContaining([["sf", "out", 10, "sales bill"], ["golddrop", "in", 180, "purchase bill"], ["k2", "in", 150, "mill transfer"], ["karadi1", "in", 30, "mill transfer"], ["karadi1", "out", 45.5, "packing"]]));
    expect(got).toHaveLength(5);
  });
});

describe("ledgerCounts", () => {
  it("lists counts oldest first, ignores blanks, and a corrected session replaces the earlier save", () => {
    const closings = [
      { date: "2026-11-02", session: "NIGHT", stock: { sf: { today: 900 }, til: { today: null } } },
      { date: "2026-11-01", session: "NIGHT", stock: { sf: { today: 1000 } } },
      { date: "2026-11-02", session: "NIGHT", stock: { sf: { today: 905 } } },
      { date: "2026-11-02", session: "AFTERNOON", stock: null },
    ] as unknown as BizData["closings"];
    expect(ledgerCounts(closings).map((c) => [c.date, c.session, c.kg])).toEqual([["2026-11-01", "NIGHT", 1000], ["2026-11-02", "NIGHT", 905]]);
  });
});

describe("ledgerDays", () => {
  const counts = [count("sf", "2026-11-01", "NIGHT", 1000), count("sf", "2026-11-03", "NIGHT", 1380)];
  const moves = [move("sf", "2026-11-02", "10:00", 900, "in"), move("sf", "2026-11-03", "11:00", 500, "out")];
  it("shows each day's movement, what was expected and what was counted, newest first", () => {
    expect(ledgerDays("sf", moves, counts, "2026-11-01", "2026-11-04")).toEqual([
      { date: "2026-11-03", inKg: 0, outKg: 500, countedKg: 1380, expectedKg: 1400, gapKg: -20, sources: ["register sale"] },
      { date: "2026-11-02", inKg: 900, outKg: 0, countedKg: null, expectedKg: 1900, gapKg: null, sources: ["register purchase"] },
      { date: "2026-11-01", inKg: 0, outKg: 0, countedKg: 1000, expectedKg: null, gapKg: null, sources: [] },
    ]);
  });
  it("for Karadi, a tank not counted that day adds nothing to the day's gap", () => {
    const c = [count("karadi1", "2026-11-01", "NIGHT", 300), count("k2", "2026-11-01", "NIGHT", 200), count("karadi1", "2026-11-02", "NIGHT", 240)];
    const m = [move("karadi1", "2026-11-02", "10:00", 50, "out"), move("k2", "2026-11-02", "12:00", 100, "in")];
    const day = ledgerDays("karadi", m, c, "2026-11-02", "2026-11-02")[0];
    expect(day).toMatchObject({ inKg: 100, outKg: 50, countedKg: 540, expectedKg: 550, gapKg: -10 }); // tank 1: 240 vs 250; K2 carried at 300 on both sides
  });
  it("is empty for bad dates or days with nothing", () => {
    expect(ledgerDays("sf", moves, counts, "x", "y")).toEqual([]);
    expect(ledgerDays("til", moves, counts, "2026-11-01", "2026-11-04")).toEqual([]);
  });
});
