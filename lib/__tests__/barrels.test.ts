import { describe, it, expect } from "vitest";
import { CODE128_PATTERNS, code128Decode, code128Modules, code128Ok, code128Svg, code128Symbols } from "../code128";
import {
  BARREL_DEFAULTS,
  allowedDiffKg,
  barrelCode,
  barrelFlags,
  barrelNet,
  barrelState,
  checkWeigh,
  lotNoFor,
  median,
  parseBarrelCode,
  receiptSummary,
  tickFresh,
  type BarrelLike,
} from "../barrels";

describe("Code 128", () => {
  it("every symbol pattern is 11 modules wide", () => {
    expect(CODE128_PATTERNS).toHaveLength(106);
    for (const p of CODE128_PATTERNS) expect(p.split("").reduce((s, c) => s + Number(c), 0)).toBe(11);
    // 6 elements each, so 3 bars + 3 spaces
    for (const p of CODE128_PATTERNS) expect(p).toHaveLength(6);
  });
  it("uses start B, symbol = ASCII − 32, and the weighted mod-103 checksum", () => {
    // "123" is only 3 digits, so the encoder stays in code set B throughout.
    const vals = "PJJ123C".split("").map((c) => c.charCodeAt(0) - 32);
    const sum = 104 + vals.reduce((s, v, i) => s + v * (i + 1), 0);
    expect(code128Symbols("PJJ123C")).toEqual([104, ...vals, sum % 103]);
  });
  it("switches to code set C for long digit runs", () => {
    const s = code128Symbols("12345678");
    expect(s[0]).toBe(105);
    expect(s.slice(1, 5)).toEqual([12, 34, 56, 78]);
  });
  it("round-trips barrel codes and odd mixes", () => {
    for (const t of ["R261010-1-03", "R261010-12-101", "Hello 128", "A1234567B", "12345", "R2610-1"]) {
      expect(code128Decode(code128Modules(t))).toBe(t);
    }
  });
  it("rejects text it cannot draw", () => {
    expect(code128Ok("")).toBe(false);
    expect(code128Ok("ರಮೇಶ್")).toBe(false);
    expect(code128Ok("x".repeat(41))).toBe(false);
    expect(() => code128Symbols("ok\n")).toThrow();
  });
  it("makes an SVG with a quiet zone", () => {
    const { svg, width } = code128Svg("R261010-1-03", { moduleWidth: 2, height: 50 });
    expect(svg).toContain("<svg");
    expect(svg).toContain('aria-label="R261010-1-03"');
    expect(width).toBe(code128Modules("R261010-1-03").length * 2);
  });
});

describe("codes", () => {
  it("builds lot numbers and barrel codes", () => {
    expect(lotNoFor("2026-10-10", 1)).toBe("R261010-1");
    expect(barrelCode("R261010-1", 3)).toBe("R261010-1-03");
  });
  it("reads codes back, tolerating a scanner that drops dashes or changes case", () => {
    expect(parseBarrelCode("R261010-1-03")?.code).toBe("R261010-1-03");
    expect(parseBarrelCode(" r261010-1-03 ")?.code).toBe("R261010-1-03");
    expect(parseBarrelCode("R261010103")?.code).toBe("R261010-1-03");
    expect(parseBarrelCode("R261010-12-101")).toMatchObject({ lotNo: "R261010-12", seq: 101 });
    expect(parseBarrelCode("hello")).toBeNull();
    expect(parseBarrelCode("")).toBeNull();
  });
});

const B = (seq: number, over: Partial<BarrelLike> = {}): BarrelLike => ({
  id: "b" + seq,
  seq,
  code: barrelCode("R261010-1", seq),
  declaredNetKg: null,
  grossKg: null,
  grossAt: null,
  grossSource: null,
  emptyKg: null,
  emptyAt: null,
  emptySource: null,
  ...over,
});
const NOW = Date.UTC(2026, 9, 10, 12, 0, 0);

describe("weighing rules", () => {
  it("net = full − empty, only when both exist", () => {
    expect(barrelNet({ grossKg: 218.4, emptyKg: 18.2 })).toBe(200.2);
    expect(barrelNet({ grossKg: 218.4, emptyKg: null })).toBeNull();
    expect(barrelState({ grossKg: null, emptyKg: null })).toBe("NEW");
    expect(barrelState({ grossKg: 200, emptyKg: null })).toBe("FULL");
    expect(barrelState({ grossKg: 200, emptyKg: 18 })).toBe("DONE");
  });
  it("blocks impossible or repeated weighments", () => {
    expect(checkWeigh("GROSS", 0, { grossKg: null, emptyKg: null })).toMatch(/more than 0/);
    expect(checkWeigh("GROSS", NaN, { grossKg: null, emptyKg: null })).toMatch(/more than 0/);
    expect(checkWeigh("GROSS", 5000, { grossKg: null, emptyKg: null })).toMatch(/at most/);
    expect(checkWeigh("GROSS", 218, { grossKg: null, emptyKg: null })).toBeNull();
    expect(checkWeigh("GROSS", 218, { grossKg: 218, emptyKg: null })).toMatch(/already saved/);
    expect(checkWeigh("GROSS", 218, { grossKg: 218, emptyKg: null }, { reweigh: true })).toBeNull();
    expect(checkWeigh("EMPTY", 18, { grossKg: null, emptyKg: null })).toMatch(/full first/);
    expect(checkWeigh("EMPTY", 230, { grossKg: 218, emptyKg: null })).toMatch(/cannot weigh as much/);
    expect(checkWeigh("EMPTY", 18, { grossKg: 218, emptyKg: null })).toBeNull();
    expect(checkWeigh("EMPTY", 18, { grossKg: 218, emptyKg: 18 })).toMatch(/already saved/);
  });
});

describe("barrel flags", () => {
  it("flags hand-typed weights", () => {
    const f = barrelFlags(B(1, { grossKg: 218, grossSource: "MANUAL", emptyKg: 18, emptySource: "SCALE" }), null, NOW);
    expect(f.map((x) => x.code)).toEqual(["MANUAL_GROSS"]);
  });
  it("flags a barrel whose empty weight is close to its full weight", () => {
    const f = barrelFlags(B(1, { grossKg: 20, emptyKg: 19.5 }), null, NOW);
    expect(f[0].code).toBe("EMPTY_NOT_LIGHTER");
    expect(f[0].level).toBe("alert");
  });
  it("flags an empty barrel far from the other empties", () => {
    expect(barrelFlags(B(1, { grossKg: 218, emptyKg: 20.4 }), 18.2, NOW).map((x) => x.code)).toContain("EMPTY_OUTLIER");
    expect(barrelFlags(B(1, { grossKg: 218, emptyKg: 18.9 }), 18.2, NOW)).toHaveLength(0);
  });
  it("flags net short / excess against the supplier's per-barrel figure, with a tolerance", () => {
    const base = { grossKg: 218.2, emptyKg: 18.2 }; // 200 kg
    expect(barrelFlags(B(1, { ...base, declaredNetKg: 200.5 }), null, NOW)).toHaveLength(0); // within 0.5 kg
    const short = barrelFlags(B(1, { ...base, declaredNetKg: 203 }), null, NOW);
    expect(short[0]).toMatchObject({ code: "NET_SHORT", level: "alert", kg: -3 });
    const extra = barrelFlags(B(1, { ...base, declaredNetKg: 196 }), null, NOW);
    expect(extra[0]).toMatchObject({ code: "NET_EXCESS", level: "warn", kg: 4 });
    expect(allowedDiffKg(200)).toBe(1); // 0.5% of 200
    expect(allowedDiffKg(20)).toBe(0.5); // floor
  });
  it("lists a barrel that has been full for too long", () => {
    const old = new Date(NOW - 30 * 3600_000).toISOString();
    expect(barrelFlags(B(1, { grossKg: 218, grossAt: old }), null, NOW).map((x) => x.code)).toEqual(["STILL_FULL"]);
    const recent = new Date(NOW - 2 * 3600_000).toISOString();
    expect(barrelFlags(B(1, { grossKg: 218, grossAt: recent }), null, NOW)).toHaveLength(0);
  });
});

describe("lot summary", () => {
  const done = (seq: number, gross: number, empty: number, extra: Partial<BarrelLike> = {}) =>
    B(seq, { grossKg: gross, grossAt: new Date(NOW - 3600_000), grossSource: "SCALE", emptyKg: empty, emptyAt: new Date(NOW), emptySource: "SCALE", ...extra });

  it("is not started with no weights", () => {
    const s = receiptSummary({ declaredNetKg: 800, declaredBarrels: 4, rateInrPerKg: 130 }, [B(1), B(2), B(3), B(4)], NOW);
    expect(s.state).toBe("NOT_STARTED");
    expect(s.notWeighed).toBe(4);
    expect(s.diffKg).toBeNull();
  });
  it("tracks weighing in, unloading, then reconciles against the challan", () => {
    const r = { declaredNetKg: 800, declaredBarrels: 4, rateInrPerKg: 130 };
    const mid = receiptSummary(r, [done(1, 218, 18), B(2, { grossKg: 218, grossAt: new Date(NOW) }), B(3), B(4)], NOW);
    expect(mid.state).toBe("WEIGHING_IN");
    expect(mid.pending).toBe(1);
    const unloading = receiptSummary(r, [done(1, 218, 18), B(2, { grossKg: 218, grossAt: new Date(NOW) }), B(3, { grossKg: 218, grossAt: new Date(NOW) }), B(4, { grossKg: 218, grossAt: new Date(NOW) })], NOW);
    expect(unloading.state).toBe("UNLOADING");
    const ok = receiptSummary(r, [done(1, 218, 18), done(2, 218.2, 18.1), done(3, 218, 18), done(4, 217.9, 18)], NOW);
    expect(ok.state).toBe("RECONCILED");
    expect(ok.measuredNetKg).toBeCloseTo(200 + 200.1 + 200 + 199.9, 5);
    expect(ok.flags).toHaveLength(0);
  });
  it("flags a short lot and prices the shortage", () => {
    const r = { declaredNetKg: 800, declaredBarrels: 4, rateInrPerKg: 130 };
    const s = receiptSummary(r, [done(1, 218, 18), done(2, 218, 18), done(3, 218, 18), done(4, 212, 18)], NOW);
    expect(s.measuredNetKg).toBe(794);
    expect(s.shortKg).toBe(6);
    expect(s.shortValueInr).toBe(780);
    expect(s.flags.map((f) => f.code)).toContain("LOT_SHORT");
  });
  it("uses per-barrel declarations when there is no challan total", () => {
    const s = receiptSummary({ declaredNetKg: null, declaredBarrels: null, rateInrPerKg: null }, [done(1, 218, 18, { declaredNetKg: 200 }), done(2, 218, 18, { declaredNetKg: 200 })], NOW);
    expect(s.declaredNetKg).toBe(400);
    expect(s.diffKg).toBe(0);
  });
  it("does not compare an incomplete lot", () => {
    const s = receiptSummary({ declaredNetKg: 800, declaredBarrels: 4, rateInrPerKg: 130 }, [done(1, 218, 18), done(2, 218, 18), B(3), B(4)], NOW);
    expect(s.diffKg).toBeNull();
    expect(s.shortValueInr).toBeNull();
  });
  it("flags fewer labelled barrels than the challan", () => {
    const s = receiptSummary({ declaredNetKg: 800, declaredBarrels: 4, rateInrPerKg: null }, [B(1), B(2)], NOW);
    expect(s.flags.map((f) => f.code)).toContain("BARRELS_FEWER");
  });
  it("needs three other empties before judging an outlier", () => {
    const two = receiptSummary({ declaredNetKg: null, declaredBarrels: null, rateInrPerKg: null }, [done(1, 218, 18), done(2, 218, 22)], NOW);
    expect(two.flags.map((f) => f.code)).not.toContain("EMPTY_OUTLIER");
    const four = receiptSummary({ declaredNetKg: null, declaredBarrels: null, rateInrPerKg: null }, [done(1, 218, 18), done(2, 218, 18.1), done(3, 218, 18.2), done(4, 222, 22)], NOW);
    expect(four.flags.filter((f) => f.code === "EMPTY_OUTLIER").map((f) => f.seq)).toEqual([4]);
  });
});

describe("misc", () => {
  it("medians", () => {
    expect(median([])).toBeNull();
    expect(median([3, 1, 2])).toBe(2);
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });
  it("accepts only recent scale readings", () => {
    expect(tickFresh(NOW - 30_000, NOW)).toBe(true);
    expect(tickFresh(NOW - (BARREL_DEFAULTS.tickMaxAgeSec + 1) * 1000, NOW)).toBe(false);
    expect(tickFresh(NOW + 60_000, NOW)).toBe(false);
  });
});
