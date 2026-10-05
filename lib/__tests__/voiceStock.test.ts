import { describe, expect, it } from "vitest";
import { normalizeSpeech, parseVoice } from "../voice";
import { buildTally, csvToTable, parseTallyRows } from "../stockTally";

describe("voice commands", () => {
  it("English sale with qty, unit, rate → amount", () => {
    expect(parseVoice("sale karadi 10 kg at 250 cash")).toMatchObject({ type: "entry", kind: "SALE", item: "karadi", qty: 10, unit: "kg", rate: 250, amount: 2500, mode: "CASH" });
  });
  it("expense with rupees and UPI", () => {
    expect(parseVoice("Expense diesel 500 rupees phone pe")).toMatchObject({ kind: "EXPENSE", item: "diesel", amount: 500, mode: "UPI" });
  });
  it("Kannada words and digits", () => {
    expect(normalizeSpeech("೫೦೦")).toBe("500");
    expect(parseVoice("ಖರ್ಚು ಡೀಸೆಲ್ ೫೦೦")).toMatchObject({ kind: "EXPENSE", item: "diesel", amount: 500 });
    expect(parseVoice("ಮಾರಾಟ ಶೇಂಗಾ 5 ಲೀಟರ್ ದರ 200")).toMatchObject({ kind: "SALE", item: "groundnut", qty: 5, unit: "ltr", rate: 200, amount: 1000 });
  });
  it("number words, udhaar, party and pigmee", () => {
    expect(parseVoice("pigmee one thousand")).toMatchObject({ kind: "PIGMEE", amount: 1000 });
    expect(parseVoice("udhaar received from Suresh 1500")).toMatchObject({ kind: "UDHAAR_IN", amount: 1500, party: "Suresh" });
    expect(parseVoice("sale sunflower 2 litre udhaar to ramesh rs 360")).toMatchObject({ mode: "CREDIT", party: "Ramesh", amount: 360 });
  });
  it("open screens and unknown text", () => {
    expect(parseVoice("count cash")).toEqual({ type: "open", target: "count" });
    expect(parseVoice("open stock tally")).toEqual({ type: "open", target: "stock" });
    expect(parseVoice("hello there").type).toBe("unknown");
  });
});

describe("quick stock tally reuses the Daily Closing maths", () => {
  const prior = [{ createdAt: "2026-10-04T15:30:00Z", stock: { sf: { today: 120 }, k2: { today: 40 } } }];
  it("sale = yesterday − today, gap = sale − report sale, flag at ≥ 0.5 kg", () => {
    const t = buildTally(prior, { sf: { today: 100, reportSale: 19 }, k2: { today: 39.8 } }, "2026-10-05T15:00:00Z");
    const sf = t.rows.find((r) => r.key === "sf")!;
    expect(sf.computed).toMatchObject({ yesterday: 120, sale: 20, gap: 1 });
    expect(sf.flagged).toBe(true);
    const k2 = t.rows.find((r) => r.key === "k2")!;
    expect(k2.computed.diff).toBeCloseTo(-0.2);
    expect(k2.flagged).toBe(false);
    expect(t.counted).toBe(2);
    expect(t.flagged).toBe(1);
  });
  it("imports counts from a CSV / Excel table by key, name or Kannada name", () => {
    const table = csvToTable("Product,Today,Report sale\nSunflower,100,19\nkaradi1,55\nಸಾಸಿವೆ ಎಣ್ಣೆ,12.5,3\nPalm oil,4");
    const r = parseTallyRows(table);
    expect(r.matched).toBe(3);
    expect(r.input.sf).toEqual({ today: 100, reportSale: 19 });
    expect(r.input.mustard).toEqual({ today: 12.5, reportSale: 3 });
    expect(r.skipped).toEqual(["Palm oil"]);
  });
});
