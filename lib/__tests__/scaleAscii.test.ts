import { describe, expect, it } from "vitest";
import { btSourceName, bytesToAscii, LineFramer, parseWeightLine, SettleDetector, StabilityTracker } from "@/lib/scaleAscii";
import { checkTickInput, istDayRange } from "@/lib/scaleTickInput";

describe("parseWeightLine", () => {
  it("reads the iScale style: sign, fixed decimals, space, kg", () => {
    expect(parseWeightLine("+ 012.345 kg")).toMatchObject({ weightKg: 12.345, unit: "kg", decimals: 3, flag: null });
    expect(parseWeightLine("+012.34 kg")).toMatchObject({ weightKg: 12.34, decimals: 2 });
    expect(parseWeightLine("  185.50 kg  ")).toMatchObject({ weightKg: 185.5 });
    expect(parseWeightLine("0.000kg")).toMatchObject({ weightKg: 0 });
  });
  it("keeps the sign and never returns minus zero", () => {
    expect(parseWeightLine("- 1.250 kg")!.weightKg).toBe(-1.25);
    expect(Object.is(parseWeightLine("-0.000 kg")!.weightKg, 0)).toBe(true);
  });
  it("reads the common indicator format with a steady / moving flag", () => {
    expect(parseWeightLine("ST,GS,+0014.55kg")).toMatchObject({ weightKg: 14.55, flag: "stable" });
    expect(parseWeightLine("US,NT,+  14.55 kg")).toMatchObject({ weightKg: 14.55, flag: "moving" });
    expect(parseWeightLine("\x02wn0012.34kg\x03")).toMatchObject({ weightKg: 12.34, flag: null });
  });
  it("converts grams and refuses every other unit", () => {
    expect(parseWeightLine("+ 2500 g")).toMatchObject({ weightKg: 2.5, unit: "g" });
    expect(parseWeightLine("12.5 lb")).toBeNull();
    expect(parseWeightLine("12.5 oz")).toBeNull();
    expect(parseWeightLine("3 pcs")).toBeNull();
  });
  it("drops a number without a unit unless told the scale sends none", () => {
    expect(parseWeightLine("+ 12.345")).toBeNull();
    expect(parseWeightLine("+ 12.345", { unitless: "kg" })!.weightKg).toBe(12.345);
  });
  it("drops anything that is not clearly one weight", () => {
    for (const bad of ["", "   ", "OL", "-----", "ERR 3", "kg", "12 1.50 kg", "1.2.3 kg", "+ 12,345 kg", "ÿþ\u0001", "x".repeat(60) + " 1 kg", "99999 kg", "+ 12.34567 kg"]) {
      expect(parseWeightLine(bad), JSON.stringify(bad)).toBeNull();
    }
  });
});

describe("bytesToAscii + LineFramer", () => {
  it("joins a line that arrives in pieces and splits several lines in one piece", () => {
    const f = new LineFramer();
    expect(f.push("+ 012.3")).toEqual([]);
    expect(f.push("45 kg\r\n+ 012.350 kg\r\n+ 01")).toEqual(["+ 012.345 kg", "+ 012.350 kg"]);
    expect(f.push("2.355 kg\n")).toEqual(["+ 012.355 kg"]);
  });
  it("accepts CR, LF or both and skips empty lines", () => {
    expect(new LineFramer().push("a\rb\nc\r\n\r\n")).toEqual(["a", "b", "c"]);
  });
  it("throws away noise that never ends a line, then recovers", () => {
    const f = new LineFramer();
    expect(f.push("#".repeat(200))).toEqual([]);
    expect(f.push("+ 1.000 kg\r\n")).toEqual(["+ 1.000 kg"]);
  });
  it("drops bytes that are not printable text (wrong speed gives these)", () => {
    expect(bytesToAscii(new Uint8Array([0, 255, 43, 32, 49, 46, 53, 32, 107, 103, 13, 10, 200]))).toBe("+ 1.5 kg\r\n");
  });
});

describe("StabilityTracker", () => {
  const p = (kg: number, flag: "stable" | "moving" | null = null) => ({ weightKg: kg, unit: "kg" as const, decimals: 3, flag });
  it("is steady only after the same value is held: 4 readings over 600 ms", () => {
    const t = new StabilityTracker();
    expect(t.push(p(10), 0)).toBe(false);
    expect(t.push(p(10), 100)).toBe(false);
    expect(t.push(p(10), 200)).toBe(false);
    expect(t.push(p(10), 300)).toBe(false); // 4 readings but only 300 ms
    expect(t.push(p(10), 650)).toBe(true);
  });
  it("starts again the moment the value changes", () => {
    const t = new StabilityTracker();
    [0, 200, 400, 700].forEach((ms) => t.push(p(10), ms));
    expect(t.push(p(10.005), 800)).toBe(false);
    expect(t.push(p(10.005), 1000)).toBe(false);
  });
  it("believes the scale's own flag when there is one", () => {
    const t = new StabilityTracker();
    expect(t.push(p(10, "stable"), 0)).toBe(true);
    [100, 200, 300, 900].forEach((ms) => expect(t.push(p(10, "moving"), ms)).toBe(false));
  });
});

describe("SettleDetector", () => {
  it("records one weight per load", () => {
    const s = new SettleDetector();
    expect(s.push(0, true)).toBeNull();
    expect(s.push(92.3, false)).toBeNull(); // still moving
    expect(s.push(185.4, true)).toBe(185.4);
    expect(s.push(185.4, true)).toBeNull(); // same barrel, still on the platform
    expect(s.push(185.42, true)).toBeNull(); // one step of flicker is not a new weighing
  });
  it("records again after the platform was emptied, even for the same weight", () => {
    const s = new SettleDetector();
    expect(s.push(185.4, true)).toBe(185.4);
    expect(s.push(0, true)).toBeNull();
    expect(s.push(185.4, true)).toBe(185.4);
  });
  it("records again when the steady weight really changed (oil added)", () => {
    const s = new SettleDetector();
    expect(s.push(5, true)).toBe(5);
    expect(s.push(7.5, false)).toBeNull();
    expect(s.push(10, true)).toBe(10);
  });
  it("ignores loads under 0.5 kg and a passing dip to zero that never came to rest", () => {
    const s = new SettleDetector();
    expect(s.push(0.3, true)).toBeNull();
    expect(s.push(20, true)).toBe(20);
    expect(s.push(0.1, false)).toBeNull(); // bumped, not emptied
    expect(s.push(20, true)).toBeNull();
  });
});

describe("names and saved weights", () => {
  it("makes a source name the weight table accepts", () => {
    expect(btSourceName("iScale i-20")).toBe("BT-ISCALE-I-20");
    expect(btSourceName("  ")).toBe("BT-SCALE");
    expect(btSourceName("ತೂಕ scale #1 with a very long bluetooth name")).toMatch(/^[A-Z0-9-]{2,64}$/);
  });
  it("checks a weight sent for saving", () => {
    const ok = { source: "BT-ISCALE-I-20", nonce: "3b241101-e2bb-4255-8caf-4136c566a962", weightKg: 185.4321 };
    expect(checkTickInput(ok)).toEqual({ ok: true, source: ok.source, nonce: ok.nonce, weightKg: 185.432, ageSec: 0 });
    expect(checkTickInput({ ...ok, ageSec: 90 })).toMatchObject({ ageSec: 90 });
    expect(checkTickInput({ ...ok, ageSec: 999999 })).toMatchObject({ ageSec: 12 * 3600 });
    expect(checkTickInput({ ...ok, ageSec: -5 })).toMatchObject({ ageSec: 0 });
    for (const bad of [{ ...ok, weightKg: 0.2 }, { ...ok, weightKg: 1001 }, { ...ok, weightKg: "185" }, { ...ok, weightKg: NaN }, { ...ok, source: "bad name" }, { ...ok, nonce: "short" }, null, "x"]) {
      expect(checkTickInput(bad).ok, JSON.stringify(bad)).toBe(false);
    }
  });
  it("turns a business date into the India day", () => {
    const r = istDayRange("2026-11-12")!;
    expect(r.start.toISOString()).toBe("2026-11-11T18:30:00.000Z");
    expect(r.end.toISOString()).toBe("2026-11-12T18:30:00.000Z");
    expect(istDayRange("12-11-2026")).toBeNull();
    expect(istDayRange("2026-13-40")).toBeNull();
  });
});
