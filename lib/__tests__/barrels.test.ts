import { describe, it, expect } from "vitest";
import { CODE128_PATTERNS, code128Decode, code128Modules, code128Ok, code128Svg, code128Symbols } from "../code128";
import {
  BARREL_DEFAULTS,
  allowedDiffKg,
  barrelCode,
  barrelLink,
  findBarrelCode,
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
  it("lets a barrel wait for days, and lists one that has waited too long", () => {
    const old = new Date(NOW - 40 * 86_400_000).toISOString();
    expect(barrelFlags(B(1, { grossKg: 218, grossAt: old }), null, NOW).map((x) => x.code)).toEqual(["STILL_FULL"]);
    const recent = new Date(NOW - 10 * 86_400_000).toISOString();
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

// ---------------------------------------------------------------------------
// Register, weigh time and QR-link additions
// ---------------------------------------------------------------------------
import { checkWeighedAt, registerCsv, registerRows, registerTotals, type ShapedReceipt } from "@/lib/barrels";

describe("typed weighing time", () => {
  const now = Date.parse("2026-10-11T08:00:00Z");
  it("defaults to now and accepts a recent time", () => {
    expect((checkWeighedAt(undefined, now) as { at: Date }).at.getTime()).toBe(now);
    expect((checkWeighedAt("2026-10-10T05:00:00Z", now) as { at: Date }).at.toISOString()).toBe("2026-10-10T05:00:00.000Z");
  });
  it("refuses the future, the distant past and rubbish", () => {
    expect(checkWeighedAt("2026-10-11T09:00:00Z", now)).toHaveProperty("error");
    expect(checkWeighedAt("2026-08-01T00:00:00Z", now)).toHaveProperty("error");
    expect(checkWeighedAt("not a date", now)).toHaveProperty("error");
  });
  it("flags a weight whose time is far from when it was saved", () => {
    const rec = new Date(now).toISOString();
    const odd = barrelFlags(B(1, { grossKg: 192, grossAt: "2026-10-09T08:00:00Z", grossRecordedAt: rec, grossSource: "MANUAL" }), null, now);
    expect(odd.map((f) => f.code)).toContain("BACKDATED");
    const fine = barrelFlags(B(1, { grossKg: 192, grossAt: new Date(now - 60_000).toISOString(), grossRecordedAt: rec, grossSource: "SCALE" }), null, now);
    expect(fine.map((f) => f.code)).not.toContain("BACKDATED");
  });
});

describe("barrel register", () => {
  const NOWMS = Date.parse("2026-10-11T08:00:00Z");
  const lot = (barrels: ReturnType<typeof B>[], extra: Record<string, unknown> = {}) =>
    ({
      id: "lot1", lotNo: "R261001-1", date: "2026-10-01", status: "OPEN", supplierName: "Sri Balaji", product: "Sunflower oil", vehicleNo: "KA38A1", challanNo: "C-9", tankTarget: null,
      rateInrPerKg: null, declaredNetKg: null, declaredBarrels: null,
      barrels: barrels.map((b) => ({ ...b, net: barrelNet(b), state: barrelState(b) })),
      summary: receiptSummary({ declaredNetKg: null, declaredBarrels: null, rateInrPerKg: null }, barrels, NOWMS),
      ...extra,
    }) as unknown as ShapedReceipt;
  const day = (n: number) => new Date(NOWMS - n * 86_400_000).toISOString();
  const done = (seq: number, gross: number, empty: number) => B(seq, { grossKg: gross, grossAt: day(10), grossSource: "SCALE", emptyKg: empty, emptyAt: day(9), emptySource: "SCALE" });

  it("gives gross − tare = net per barrel, like barrel 1: 192 − 12 = 180", () => {
    const rows = registerRows([lot([done(1, 192, 12)])], NOWMS);
    expect(rows[0]).toMatchObject({ code: barrelCode("R261010-1", 1), grossKg: 192, emptyKg: 12, netKg: 180, state: "DONE", waitingDays: null });
  });
  it("counts days waiting and estimates oil inside a barrel that is still full", () => {
    const waiting = B(2, { grossKg: 190, grossAt: day(5), grossSource: "SCALE" });
    const rows = registerRows([lot([done(1, 192, 12), waiting])], NOWMS);
    const r = rows.find((x) => x.seq === 2)!;
    expect(r.state).toBe("FULL");
    expect(r.waitingDays).toBe(5);
    expect(r.netKg).toBeNull();
    expect(r.estNetKg).toBe(178); // 190 − the lot's typical empty barrel (12)
  });
  it("gives no estimate when there is no empty barrel to compare with", () => {
    const rows = registerRows([lot([B(1, { grossKg: 190, grossAt: day(2), grossSource: "SCALE" })])], NOWMS);
    expect(rows[0].estNetKg).toBeNull();
  });
  it("totals gross, tare and net over emptied barrels only, so they always agree", () => {
    const rows = registerRows([lot([done(1, 192, 12), done(2, 200.5, 12.5), B(3, { grossKg: 190, grossAt: day(40), grossSource: "SCALE" })])], NOWMS);
    const t = registerTotals(rows);
    expect(t).toMatchObject({ barrels: 3, emptied: 2, waiting: 1, waitingOldestDays: 40, grossKg: 392.5, tareKg: 24.5, netKg: 368 });
    expect(t.grossKg - t.tareKg).toBeCloseTo(t.netKg, 5);
  });
  it("keeps the supplier's figures out of staff rows (they arrive as null) and out of the staff CSV", () => {
    const rows = registerRows([lot([done(1, 192, 12)])], NOWMS);
    const csv = registerCsv(rows, false);
    expect(csv).not.toContain("Supplier kg");
    expect(csv.split("\r\n")[1]).toContain("180");
    expect(registerCsv(rows, true)).toContain("Supplier kg");
  });
});


describe("FULL / EMPTY weight labels", () => {
  it("reads the -F / -E tail as the weighing step and keeps the plain code", () => {
    expect(parseBarrelCode("R261013-1-01-F")).toMatchObject({ code: "R261013-1-01", phase: "GROSS" });
    expect(parseBarrelCode("r261013-1-02-e")).toMatchObject({ code: "R261013-1-02", phase: "EMPTY" });
    expect(parseBarrelCode("R261013-1-01")?.phase).toBeUndefined();
    expect(parseBarrelCode("R261013-1-01-X")).toBeNull();
  });
  it("reads the phase from a QR link", () => {
    expect(findBarrelCode("https://x.app/barrels?barrel=R261013-1-03&phase=EMPTY")).toMatchObject({ code: "R261013-1-03", phase: "EMPTY" });
    expect(findBarrelCode("https://x.app/barrels?barrel=R261013-1-03")?.phase).toBeUndefined();
    expect(barrelLink("https://x.app/", "R261013-1-03", "GROSS")).toBe("https://x.app/barrels?barrel=R261013-1-03&phase=GROSS");
  });
});

import { labelSize, slipSize, customSize, pageCss, labelLayout, LABEL_SIZES, SLIP_SIZES } from "../printSizes";
describe("print sizes", () => {
  it("offers the common sticker and receipt sizes", () => {
    const ids = LABEL_SIZES.map((s) => s.id);
    expect(ids).toEqual(expect.arrayContaining(["4x6", "2x2", "50x30", "50x25", "50x75", "75x50", "100x50", "a4"]));
    expect(SLIP_SIZES.map((s) => s.id)).toEqual(expect.arrayContaining(["80mm", "58mm", "50mm", "4x6", "2x2", "a4"]));
    expect(pageCss(labelSize("4x6"), "label")).toBe("@page { size: 101.6mm 152.4mm; margin: 0 }");
    expect(pageCss(labelSize("50x25"), "label")).toBe("@page { size: 50mm 25mm; margin: 0 }");
    expect(pageCss(slipSize("58mm"), "slip")).toBe("@page { size: 58mm auto; margin: 2mm }");
  });
  it("keeps the old thermal links working and falls back safely", () => {
    expect(labelSize("thermal").id).toBe("50x30");
    expect(slipSize("thermal").id).toBe("80mm");
    expect(labelSize("nonsense").id).toBe("a4");
    expect(slipSize(null).id).toBe("80mm");
  });
  it("accepts a typed size in mm and rejects silly ones", () => {
    expect(labelSize("c60x40")).toMatchObject({ w: 60, h: 40, custom: true });
    expect(customSize(60, 40)?.id).toBe("c60x40");
    expect(customSize(5, 40)).toBeNull();
    expect(customSize(60, "")).toBeNull();
    expect(customSize(58, "", true)).toMatchObject({ w: 58, h: null });
    expect(slipSize("c58x0")).toMatchObject({ w: 58, h: null });
  });
  it("uses the compact layout for labels under 38 mm tall", () => {
    expect(labelLayout(labelSize("50x25")).compact).toBe(true);
    expect(labelLayout(labelSize("50x75")).compact).toBe(false);
    expect(labelLayout(labelSize("4x6")).roomy).toBe(true);
  });
});

describe("printer models", () => {
  it("has the shop printers with sizes that exist", async () => {
    const m = await import("@/lib/printSizes");
    expect(m.printerModel("h30c")?.maxWidth).toBe(108);
    expect(m.printerModel("posiflow80b")?.type).toBe("receipt");
    for (const p of m.PRINTER_MODELS) {
      for (const id of p.labelSizes ?? []) expect(m.LABEL_SIZES.some((x) => x.id === id)).toBe(true);
      for (const id of p.slipSizes ?? []) expect(m.SLIP_SIZES.some((x) => x.id === id)).toBe(true);
    }
  });
});
