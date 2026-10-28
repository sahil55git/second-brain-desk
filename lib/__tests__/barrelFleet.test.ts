import { describe, expect, it } from "vitest";
import {
  FLEET_DEFAULTS,
  checkFleetWeigh,
  checkMove,
  csvCell,
  emptyOutcome,
  eventFlags,
  findFleetCode,
  fleetCode,
  fleetCsv,
  fleetFlags,
  fleetLink,
  fleetNet,
  fleetSummary,
  grossOutcome,
  ledgerCsv,
  nextFleetCodes,
  parseFleetCode,
  type FleetRowForCsv,
} from "../barrelFleet";

const NOW = Date.parse("2026-10-23T06:00:00Z");
const daysAgo = (d: number) => new Date(NOW - d * 86_400_000);

const barrel = (over: Partial<FleetRowForCsv> = {}): FleetRowForCsv => ({
  code: "BRL-07",
  mark: null,
  product: null,
  holder: null,
  status: "EMPTY",
  active: true,
  condition: "OK",
  capacityKg: 190,
  tareKg: 12.4,
  tareAt: daysAgo(60),
  grossKg: null,
  netKg: null,
  lastGrossDiffKg: null,
  lastEmptyKg: 12.4,
  lastEmptyAt: daysAgo(2),
  location: "SHOP",
  sinceAt: daysAgo(2),
  ...over,
});

describe("codes", () => {
  it("prints BRL-07 and grows past 99", () => {
    expect(fleetCode(7)).toBe("BRL-07");
    expect(fleetCode(100)).toBe("BRL-100");
  });
  it("reads typed or scanned codes loosely", () => {
    expect(parseFleetCode("brl 7")?.code).toBe("BRL-07");
    expect(parseFleetCode("BRL07")?.code).toBe("BRL-07");
    expect(parseFleetCode(" BRL-12 ")?.code).toBe("BRL-12");
  });
  it("rejects other labels", () => {
    expect(parseFleetCode("R261010-1-03")).toBeNull(); // a supplier-lot barrel, not ours
    expect(parseFleetCode("BRL-0")).toBeNull();
    expect(parseFleetCode("BRL-1234")).toBeNull();
    expect(parseFleetCode("")).toBeNull();
  });
  it("finds the code inside the QR link", () => {
    const link = fleetLink("https://shop.example/", "BRL-07");
    expect(link).toBe("https://shop.example/barrels/fleet/BRL-07");
    expect(findFleetCode(link)?.code).toBe("BRL-07");
  });
  it("numbers new barrels after the highest in use and skips used numbers", () => {
    expect(nextFleetCodes([], 3)).toEqual(["BRL-01", "BRL-02", "BRL-03"]);
    expect(nextFleetCodes(["BRL-01", "BRL-03"], 2)).toEqual(["BRL-04", "BRL-05"]);
    expect(nextFleetCodes(["BRL-02"], 3, 1)).toEqual(["BRL-01", "BRL-03", "BRL-04"]);
  });
});

describe("weights", () => {
  it("net oil = gross − tare (the shop's example: 192.4 − 12.4 = 180)", () => {
    expect(fleetNet(192.4, 12.4)).toBe(180);
    expect(fleetNet(null, 12.4)).toBeNull();
    expect(fleetNet(192.4, null)).toBeNull();
  });
  it("refuses a full weight when the barrel has no tare", () => {
    expect(checkFleetWeigh("GROSS", 190, barrel({ tareKg: null, status: "NEW" }))).toMatch(/no tare yet/);
  });
  it("refuses a 'full' weight that is not above the tare", () => {
    expect(checkFleetWeigh("GROSS", 12.4, barrel())).toMatch(/more than the barrel's own weight/);
    expect(checkFleetWeigh("GROSS", 192.4, barrel())).toBeNull();
  });
  it("refuses an empty weight as heavy as the last full weight", () => {
    const full = barrel({ status: "FULL", grossKg: 192.4, netKg: 180 });
    expect(checkFleetWeigh("EMPTY", 192.4, full)).toMatch(/cannot weigh as much/);
    expect(checkFleetWeigh("EMPTY", 12.9, full)).toBeNull();
  });
  it("refuses bad numbers and retired barrels", () => {
    expect(checkFleetWeigh("GROSS", 0, barrel())).toMatch(/more than 0/);
    expect(checkFleetWeigh("GROSS", 5000, barrel())).toMatch(/at most/);
    expect(checkFleetWeigh("GROSS", 192, barrel({ condition: "RETIRED", active: false }))).toMatch(/retired/);
  });
  it("the first empty weight sets the tare; later ones are compared with it", () => {
    expect(emptyOutcome({ status: "NEW", tareKg: null, grossKg: null }, 12.4)).toEqual({ setsTare: true, driftKg: null, pouredKg: null });
    expect(emptyOutcome({ status: "EMPTY", tareKg: 12.4, grossKg: null }, 13.9)).toMatchObject({ setsTare: false, driftKg: 1.5 });
    expect(emptyOutcome({ status: "EMPTY", tareKg: 12.4, grossKg: null }, 13.9, true).setsTare).toBe(true); // owner re-tare
  });
  it("measures the oil that was poured out (full − empty)", () => {
    const o = emptyOutcome({ status: "FULL", tareKg: 12.4, grossKg: 192.4 }, 12.7);
    expect(o.pouredKg).toBe(179.7);
    expect(o.driftKg).toBe(0.3);
  });
  it("full weighing: net, change since the last full weight, allowed difference, capacity", () => {
    const first = grossOutcome(barrel(), 192.4);
    expect(first).toMatchObject({ netKg: 180, prevGrossKg: null, diffKg: null, overCapacity: false });
    const again = grossOutcome(barrel({ status: "FULL", grossKg: 192.4, netKg: 180 }), 190.9);
    expect(again.diffKg).toBe(-1.5);
    expect(again.allowedKg).toBe(0.9); // 0.5 % of 180 kg
    expect(grossOutcome(barrel(), 205).overCapacity).toBe(true); // 192.6 kg oil > 190
  });
});

describe("moves", () => {
  it("needs a known place and, away from the shop, a name", () => {
    expect(checkMove(barrel(), "MOON", "x")).toMatch(/Choose where/);
    expect(checkMove(barrel(), "CUSTOMER", "")).toMatch(/who is taking it/);
    expect(checkMove(barrel(), "CUSTOMER", "Ravi Stores")).toBeNull();
    expect(checkMove(barrel({ location: "CUSTOMER" }), "SHOP", null)).toBeNull();
    expect(checkMove(barrel(), "SHOP", null)).toMatch(/already in the shop/);
  });
});

describe("flags", () => {
  it("a healthy barrel has none", () => {
    expect(fleetFlags(barrel(), NOW)).toEqual([]);
  });
  it("no tare", () => {
    expect(fleetFlags(barrel({ tareKg: null, status: "NEW", lastEmptyKg: null }), NOW).map((f) => f.code)).toEqual(["NO_TARE"]);
  });
  it("tare drift beyond the default 1 kg, not inside it", () => {
    expect(FLEET_DEFAULTS.tareDriftKg).toBe(1);
    expect(fleetFlags(barrel({ lastEmptyKg: 13.9 }), NOW).map((f) => f.code)).toContain("TARE_DRIFT");
    expect(fleetFlags(barrel({ lastEmptyKg: 13.3 }), NOW)).toEqual([]);
  });
  it("ignores an empty weight older than the current tare", () => {
    expect(fleetFlags(barrel({ lastEmptyKg: 14, lastEmptyAt: daysAgo(90), tareAt: daysAgo(60) }), NOW)).toEqual([]);
  });
  it("oil lost is an alert, gained is a warning; small changes are normal", () => {
    const full = { status: "FULL", grossKg: 192.4, netKg: 180, product: "Sunflower oil" };
    const lost = fleetFlags(barrel({ ...full, lastGrossDiffKg: -3 }), NOW);
    expect(lost.find((f) => f.code === "OIL_LOST")?.level).toBe("alert");
    expect(fleetFlags(barrel({ ...full, lastGrossDiffKg: 2 }), NOW).find((f) => f.code === "OIL_GAINED")?.level).toBe("warn");
    expect(fleetFlags(barrel({ ...full, lastGrossDiffKg: -0.4 }), NOW)).toEqual([]);
  });
  it("over capacity", () => {
    expect(fleetFlags(barrel({ status: "FULL", netKg: 195, grossKg: 207.4 }), NOW).map((f) => f.code)).toContain("OVER_CAPACITY");
  });
  it("away too long (default 30 days)", () => {
    expect(fleetFlags(barrel({ location: "CUSTOMER", holder: "Ravi", sinceAt: daysAgo(31) }), NOW).map((f) => f.code)).toEqual(["AWAY_TOO_LONG"]);
    expect(fleetFlags(barrel({ location: "CUSTOMER", holder: "Ravi", sinceAt: daysAgo(10) }), NOW)).toEqual([]);
  });
  it("leaking is an alert, dented a warning, retired barrels are silent", () => {
    expect(fleetFlags(barrel({ condition: "LEAKING" }), NOW)[0]).toMatchObject({ code: "LEAKING", level: "alert" });
    expect(fleetFlags(barrel({ condition: "DENTED" }), NOW)[0]).toMatchObject({ code: "DENTED", level: "warn" });
    expect(fleetFlags(barrel({ condition: "RETIRED", active: false, tareKg: null }), NOW)).toEqual([]);
  });
  it("ledger rows: typed weight, drift, lost oil", () => {
    expect(eventFlags({ action: "GROSS", source: "MANUAL", kg: 190, detail: null }).map((f) => f.code)).toEqual(["MANUAL"]);
    expect(eventFlags({ action: "EMPTY", source: "SCALE", kg: 14, detail: { driftKg: 1.6 } }).map((f) => f.code)).toEqual(["TARE_DRIFT"]);
    expect(eventFlags({ action: "GROSS", source: "SCALE", kg: 190, detail: { diffKg: -2.5, allowedKg: 0.9 } })[0]).toMatchObject({ code: "OIL_LOST", level: "alert" });
    expect(eventFlags({ action: "GROSS", source: "SCALE", kg: 190, detail: { diffKg: -0.5, allowedKg: 0.9 } })).toEqual([]);
  });
});

describe("summary and exports", () => {
  const fleet: FleetRowForCsv[] = [
    barrel({ code: "BRL-01", status: "FULL", product: "Sunflower oil", grossKg: 192.4, netKg: 180 }),
    barrel({ code: "BRL-02", status: "FULL", product: "Rice bran oil", grossKg: 190, netKg: 177.6, location: "CUSTOMER", holder: "Ravi Stores", sinceAt: daysAgo(3) }),
    barrel({ code: "BRL-03" }),
    barrel({ code: "BRL-04", tareKg: null, status: "NEW", lastEmptyKg: null }),
    barrel({ code: "BRL-05", condition: "RETIRED", active: false }),
  ];
  it("counts only live barrels and adds up the oil", () => {
    const s = fleetSummary(fleet, NOW);
    expect(s).toMatchObject({ barrels: 4, inShop: 3, away: 1, full: 2, empty: 1, noTare: 1, oilKg: 357.6, oilAwayKg: 177.6 });
    expect(s.byLocation).toEqual({ SHOP: 3, CUSTOMER: 1 });
  });
  it("CSV cells are quoted and cannot start a spreadsheet formula", () => {
    expect(csvCell('say "hi", ok')).toBe('"say ""hi"", ok"');
    expect(csvCell("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
    expect(csvCell(-3.5)).toBe("-3.5");
    expect(csvCell(null)).toBe("");
  });
  it("fleet and ledger CSV have a header and one line per row", () => {
    const csv = fleetCsv(fleet, NOW).replace("﻿", "").split("\r\n");
    expect(csv).toHaveLength(6);
    expect(csv[0]).toContain("Tare kg");
    expect(csv[2]).toContain("Ravi Stores");
    const led = ledgerCsv([{ at: new Date(NOW), barrelCode: "BRL-02", action: "MOVE", kg: 190, tareKg: 12.4, netKg: 177.6, product: "Rice bran oil", fromLoc: "SHOP", toLoc: "CUSTOMER", party: "Ravi Stores", vehicleNo: null, purpose: "SALE", ref: "INV-114", source: null, by: "Nilkant", note: null }]).split("\r\n");
    expect(led).toHaveLength(2);
    expect(led[1]).toContain("INV-114");
  });
});
