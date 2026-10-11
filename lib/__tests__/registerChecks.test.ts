import { describe, expect, it } from "vitest";
import { hasAlert, registerChecks, type RegCheckCtx, type RegDraft, type RegHistoryEntry } from "@/lib/registerChecks";

const NOW = Date.parse("2026-10-11T10:00:00+05:30");
const mins = (m: number) => new Date(NOW - m * 60_000).toISOString();

const sale = (o: Partial<RegDraft> = {}): RegDraft => ({
  kind: "SALE", item: "sunflower", qty: 10, unit: "kg", rate: 140, amount: 1400, amountTyped: false,
  mode: "CASH", party: "", date: "2026-10-11", ...o,
});
const hist = (o: Partial<RegHistoryEntry> = {}): RegHistoryEntry => ({
  kind: "SALE", item: "sunflower", qty: 5, unit: "kg", rateInr: 140, amountInr: 700, partyName: null, createdAt: mins(120), ...o,
});
const ctx = (o: Partial<RegCheckCtx> = {}): RegCheckCtx => ({ entries: [], today: "2026-10-11", nowMs: NOW, ...o });
const has = (cs: ReturnType<typeof registerChecks>, re: RegExp) => cs.some((c) => re.test(c.en));

describe("registerChecks", () => {
  it("says nothing about a normal entry", () => {
    expect(registerChecks(sale(), ctx({ entries: [hist(), hist({ amountInr: 1400 }), hist({ amountInr: 280 })] }))).toEqual([]);
  });

  it("every message comes in English and Kannada", () => {
    const cs = registerChecks(sale({ amount: 14000, amountTyped: true }), ctx());
    expect(cs.length).toBeGreaterThan(0);
    for (const c of cs) {
      expect(c.en.length).toBeGreaterThan(0);
      expect(/[ಀ-೿]/.test(c.kn)).toBe(true);
    }
  });

  it("catches a slipped zero in a hand-typed amount (alert)", () => {
    const cs = registerChecks(sale({ amount: 14000, amountTyped: true }), ctx());
    expect(cs[0].level).toBe("alert");
    expect(cs[0].en).toMatch(/quantity × rate = ₹1,400/);
    expect(cs[0].en).toMatch(/zero/);
  });
  it("a small amount ≠ qty × rate is a warning, not an alert; an auto amount is never flagged", () => {
    const warn = registerChecks(sale({ amount: 1500, amountTyped: true }), ctx());
    expect(warn[0].level).toBe("warn");
    expect(registerChecks(sale({ amount: 1500, amountTyped: false }), ctx())).toEqual([]);
    // a rounding gap of ₹1 is fine
    expect(registerChecks(sale({ amount: 1400.5, amountTyped: true }), ctx())).toEqual([]);
  });

  it("flags a rate far from the usual — from recent same-item entries first, remembered rate otherwise", () => {
    const entries = [hist(), hist({ rateInr: 142 }), hist({ rateInr: 138 })];
    const high = registerChecks(sale({ rate: 190, amount: 1900 }), ctx({ entries }));
    expect(high[0].level).toBe("warn");
    expect(high[0].en).toMatch(/above the usual ₹140/);
    const slip = registerChecks(sale({ rate: 1400, amount: 14000 }), ctx({ entries }));
    expect(slip.some((c) => c.level === "alert" && /zero/.test(c.en))).toBe(true);
    const viaSaved = registerChecks(sale({ rate: 100, amount: 1000 }), ctx({ savedRate: 140 }));
    expect(has(viaSaved, /below the usual ₹140/)).toBe(true);
    // a different item or unit is not compared
    expect(has(registerChecks(sale({ item: "karadi", rate: 400, amount: 4000 }), ctx({ entries })), /^Rate /)).toBe(false);
    expect(has(registerChecks(sale({ unit: "ltr", rate: 400, amount: 4000 }), ctx({ entries })), /^Rate /)).toBe(false);
  });

  it("alerts on the same entry saved minutes ago; only warns for a named repeat later", () => {
    const e = [hist({ amountInr: 1400, createdAt: mins(3) })];
    const soon = registerChecks(sale(), ctx({ entries: e }));
    expect(soon[0].level).toBe("alert");
    expect(soon[0].en).toMatch(/3 min ago/);
    // same amount hours ago, no name → two real customers, say nothing
    expect(registerChecks(sale(), ctx({ entries: [hist({ amountInr: 1400, createdAt: mins(180) })] }))).toEqual([]);
    // same named customer + amount hours ago → a gentle warning
    const named = registerChecks(sale({ party: "Ramesh" }), ctx({ entries: [hist({ amountInr: 1400, partyName: "ramesh", createdAt: mins(180) })] }));
    expect(named[0].level).toBe("warn");
    expect(named[0].en).toMatch(/already entered today/);
  });

  it("udhaar needs a name", () => {
    expect(registerChecks(sale({ mode: "CREDIT" }), ctx())[0]).toMatchObject({ level: "alert" });
    expect(registerChecks(sale({ mode: "CREDIT", party: "Ramesh" }), ctx())).toEqual([]);
    const r = registerChecks(sale({ kind: "UDHAAR_IN", item: null, qty: null, unit: null, rate: null, amount: 500 }), ctx());
    expect(r[0].en).toMatch(/Whose udhaar/);
  });

  it("points at an amount far above the usual, and a large one when there is no history", () => {
    const entries = [hist({ amountInr: 500 }), hist({ amountInr: 700, createdAt: mins(300) }), hist({ amountInr: 600, createdAt: mins(400) })];
    expect(has(registerChecks(sale({ qty: null, rate: null, amount: 9000 }), ctx({ entries })), /× the usual sale/)).toBe(true);
    expect(has(registerChecks(sale({ qty: null, rate: null, amount: 150000 }), ctx()), /large amount/)).toBe(true);
  });

  it("a very large quantity, future date and back-dated entry", () => {
    expect(has(registerChecks(sale({ qty: 6000, amount: 840000 }), ctx()), /very large quantity/)).toBe(true);
    expect(registerChecks(sale({ date: "2026-10-12" }), ctx())[0]).toMatchObject({ level: "alert" });
    const back = registerChecks(sale({ date: "2026-10-09" }), ctx());
    expect(back).toHaveLength(1);
    expect(back[0].level).toBe("info");
  });

  it("warns when cash going out is more than the counter should hold — cash only", () => {
    const pay = (o: Partial<RegDraft>) => registerChecks({ ...sale(), kind: "EXPENSE", item: "diesel", qty: null, unit: null, rate: null, amount: 3000, ...o }, ctx({ cashNow: 2000 }));
    expect(has(pay({}), /counter should have only ₹2,000/)).toBe(true);
    expect(pay({ mode: "UPI" })).toEqual([]);
    expect(has(pay({ kind: "PIGMEE", mode: "CASH" }), /counter should have only/)).toBe(true);
    // money coming in never triggers it
    expect(has(registerChecks(sale({ amount: 99999, qty: null, rate: null }), ctx({ cashNow: 10 })), /counter should have/)).toBe(false);
  });

  it("sorts alerts first, and hasAlert drives the 'Save anyway' wording", () => {
    const cs = registerChecks(sale({ amount: 14000, amountTyped: true, date: "2026-10-09", mode: "CREDIT" }), ctx());
    expect(cs.map((c) => c.level)).toEqual([...cs.map((c) => c.level)].sort((a, b) => ({ alert: 0, warn: 1, info: 2 }[a] - { alert: 0, warn: 1, info: 2 }[b])));
    expect(hasAlert(cs)).toBe(true);
    expect(hasAlert([{ level: "warn", en: "x", kn: "x" }])).toBe(false);
  });
});
