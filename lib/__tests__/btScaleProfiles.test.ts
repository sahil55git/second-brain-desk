import { describe, expect, it } from "vitest";
import { btProfileProblem, isActiveProfile, parseBtScales, profileToConfig, removeBtScale, upsertBtScale, type BtScaleProfile } from "../btScaleProfiles";

const p = (o: Partial<BtScaleProfile> = {}): BtScaleProfile => ({ id: "a", name: "Counter scale", use: "counter", deviceId: "AA:BB", deviceName: "iScale-I-20", kind: "native", baud: 9600, ...o });

describe("saved Bluetooth scales", () => {
  it("bad saved data gives an empty list", () => {
    expect(parseBtScales(null)).toEqual([]);
    expect(parseBtScales({ scales: "x" })).toEqual([]);
    expect(parseBtScales({ scales: [null, 5, {}] })).toEqual([]);
  });
  it("keeps good profiles, fixes odd fields and drops duplicates", () => {
    const got = parseBtScales({ scales: [p(), p({ id: "b", name: "counter SCALE" }), p({ id: "c", name: "Barrels", use: "x" as never, baud: 777 })] });
    expect(got.map((s) => s.name)).toEqual(["Counter scale", "Barrels"]);
    expect(got[1]).toMatchObject({ use: "any", baud: 9600 });
  });
  it("checks a profile before saving", () => {
    expect(btProfileProblem(p({ name: " " }), [])).toMatch(/name/);
    expect(btProfileProblem(p({ deviceId: "" }), [])).toMatch(/paired/);
    expect(btProfileProblem(p({ deviceId: "", kind: "serial" }), [])).toBeNull();
    expect(btProfileProblem(p({ id: "z" }), [p()])).toMatch(/already/);
    expect(btProfileProblem(p(), [p()])).toBeNull();
    expect(btProfileProblem(p({ baud: 123 }), [])).toMatch(/speed/);
  });
  it("adds, replaces and removes, sorted by name", () => {
    let l = upsertBtScale([], p({ id: "1", name: "Zeta" }));
    l = upsertBtScale(l, p({ id: "2", name: "Alpha" }));
    expect(l.map((s) => s.name)).toEqual(["Alpha", "Zeta"]);
    l = upsertBtScale(l, p({ id: "1", name: "Barrel" }));
    expect(l.map((s) => s.name)).toEqual(["Alpha", "Barrel"]);
    expect(removeBtScale(l, "1").map((s) => s.id)).toEqual(["2"]);
  });
  it("turns a profile into the device setting and recognises it again", () => {
    const cfg = profileToConfig(p({ baud: 4800 }));
    expect(cfg).toEqual({ kind: "native", id: "AA:BB", name: "iScale-I-20", baud: 4800 });
    expect(isActiveProfile(p(), cfg)).toBe(true);
    expect(isActiveProfile(p({ deviceId: "CC:DD" }), cfg)).toBe(false);
    expect(isActiveProfile(p(), null)).toBe(false);
  });
});
