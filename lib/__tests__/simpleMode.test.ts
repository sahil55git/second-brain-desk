import { describe, expect, it } from "vitest";
import { assignPerson, assignedMode, deleteMode, normalizeSimpleAssign, normalizeSimpleModes } from "../simpleMode";
import { normalizeConfig } from "../register";

const modes = normalizeSimpleModes([
  { id: "manager", name: " Manager simple ", tiles: ["SALE", "count", "nonsense"], size: "L", lang: "kn" },
  { id: "counter", name: "Counter", tiles: [], size: "XL", lang: "x" },
  { id: "manager", name: "dup" },
  { id: "bad id!", name: "x" },
]);

describe("simple mode settings", () => {
  it("cleans settings", () => {
    expect(modes).toHaveLength(2);
    expect(modes[0]).toMatchObject({ name: "Manager simple", tiles: ["SALE", "count"], lang: "kn" });
    expect(modes[1].tiles.length).toBeGreaterThan(0);
    expect(modes[1]).toMatchObject({ size: "L", lang: "both" });
  });
  it("one person, one setting; unknown settings are dropped", () => {
    const a = normalizeSimpleAssign({ Raju: "manager", ravi: "ghost" }, modes);
    expect(a).toEqual({ raju: "manager" });
    expect(assignedMode("RAJU", modes, a)?.id).toBe("manager");
    expect(assignedMode("ravi", modes, a)).toBeNull();
    const b = assignPerson(a, "raju", "counter");
    expect(b).toEqual({ raju: "counter" });
    expect(assignPerson(b, "raju", null)).toEqual({});
  });
  it("deleting a setting un-assigns its people", () => {
    const r = deleteMode(modes, { raju: "manager", ravi: "counter" }, "manager");
    expect(r.modes.map((m) => m.id)).toEqual(["counter"]);
    expect(r.assign).toEqual({ ravi: "counter" });
  });
  it("lives inside the register config", () => {
    const c = normalizeConfig({ simpleModes: modes, simpleAssign: { raju: "manager" } });
    expect(c.simpleModes).toHaveLength(2);
    expect(c.simpleAssign).toEqual({ raju: "manager" });
    expect(normalizeConfig({}).simpleModes).toEqual([]);
  });
});
