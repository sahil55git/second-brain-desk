import { describe, expect, it } from "vitest";
import { mandiSignals, mergeHistory, parseMandi, type MandiRow } from "../mandi";

const row = (date: string, modal: number, market = "Bidar", commodity = "Groundnut"): MandiRow => ({ date, commodity, market, district: "Bidar", state: "Karnataka", variety: "Other", minQtl: modal - 100, maxQtl: modal + 100, modalQtl: modal });

describe("mandi", () => {
  it("parses the data.gov.in feed", () => {
    const rows = parseMandi({ records: [
      { state: "Karnataka", district: "Bidar", market: "Bidar", commodity: "Groundnut", variety: "Other", arrival_date: "01/11/2026", min_price: "6000", max_price: "6800", modal_price: "6500" },
      { commodity: "Mustard", arrival_date: "bad", modal_price: "5000" },
    ] });
    expect(rows).toEqual([{ date: "2026-11-01", commodity: "Groundnut", market: "Bidar", district: "Bidar", state: "Karnataka", variety: "Other", minQtl: 6000, maxQtl: 6800, modalQtl: 6500 }]);
    expect(parseMandi(null)).toEqual([]);
  });
  it("says buy when below the 30-day average", () => {
    const hist = [row("2026-10-10", 7000), row("2026-10-15", 7000), row("2026-10-20", 7000), row("2026-10-25", 7000), row("2026-11-01", 6500), row("2026-11-01", 6300, "Gulbarga")];
    const [s] = mandiSignals(hist);
    expect(s.latest).toBe(6400);
    expect(s.markets).toBe(2);
    expect(s.signal).toBe("buy");
    expect(s.change7Pct).toBeCloseTo(-8.6, 1);
    expect(s.say).toContain("good time to buy");
  });
  it("says wait after a jump", () => {
    const [s] = mandiSignals([row("2026-10-20", 6000), row("2026-10-25", 6000), row("2026-10-26", 6000), row("2026-11-01", 6300)]);
    expect(s.signal).toBe("wait");
  });
  it("keeps history unique and recent", () => {
    const h = mergeHistory([row("2026-06-01", 1), row("2026-10-30", 5000)], [row("2026-10-30", 5100), row("2026-11-01", 5200)], "2026-11-01");
    expect(h.map((r) => r.modalQtl)).toEqual([5100, 5200]);
  });
});
