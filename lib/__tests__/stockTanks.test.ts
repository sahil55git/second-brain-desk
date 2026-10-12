import { describe, expect, it } from "vitest";
import { BAG, BARREL, TANKS, bagRange, barrelStatus, fillPct, freeKg, normalizeCaps, parseCap, tankStatus } from "../stockTanks";

describe("stock tanks", () => {
  it("has the shop's tank sizes", () => {
    const by = Object.fromEntries(TANKS.map((t) => [t.key, t.capKg]));
    expect(by).toEqual({ sf: 2700, soyabean: 2700, karadi1: 580, groundnut: 580 });
    expect(BARREL).toEqual({ standardKg: 180, maxKg: 190 });
  });

  it("works out fill and free space", () => {
    expect(fillPct(1350, 2700)).toBe(50);
    expect(fillPct(3000, 2700)).toBe(100);
    expect(fillPct(null, 2700)).toBe(0);
    expect(freeKg(2500, 2700)).toBe(200);
    expect(freeKg(2800, 2700)).toBe(0);
    expect(freeKg(null, 2700)).toBeNull();
  });

  it("flags low, full, over and not counted", () => {
    expect(tankStatus(null, 580)).toBe("uncounted");
    expect(tankStatus(100, 580)).toBe("low");
    expect(tankStatus(300, 580)).toBe("ok");
    expect(tankStatus(575, 580)).toBe("full");
    expect(tankStatus(620, 580)).toBe("over");
  });

  it("checks barrels against 180 standard and 190 limit", () => {
    expect(barrelStatus(180)).toBe("standard");
    expect(barrelStatus(176)).toBe("standard");
    expect(barrelStatus(150)).toBe("short");
    expect(barrelStatus(186)).toBe("top");
    expect(barrelStatus(190)).toBe("top");
    expect(barrelStatus(195)).toBe("over");
  });

  it("keeps only sensible saved sizes", () => {
    expect(normalizeCaps({ sf: 3000, karadi1: -5, groundnut: "abc" })).toEqual({ sf: 3000, soyabean: 2700, karadi1: 580, groundnut: 580 });
    expect(normalizeCaps(null).sf).toBe(2700);
    expect(parseCap("2,800")).toBe(2800);
    expect(parseCap("0")).toBeNull();
    expect(parseCap("x")).toBeNull();
  });

  it("turns kg into a bag range of 40 to 50 kg bags", () => {
    expect(BAG).toEqual({ minKg: 40, maxKg: 50 });
    expect(bagRange(2000)).toEqual({ min: 40, max: 50 });
    expect(bagRange(95)).toEqual({ min: 2, max: 3 });
    expect(bagRange(0)).toBeNull();
    expect(bagRange(null)).toBeNull();
  });
});
