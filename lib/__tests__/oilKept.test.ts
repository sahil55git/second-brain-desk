import { describe, expect, it } from "vitest";
import { heldQueue, keptList, trackOf, type BillTrack } from "@/lib/counterTrack";

const bill = (no: string, track: BillTrack) => ({ no, createdAt: `2026-11-21T10:0${no}:00.000Z`, modes: { CASH: 100 } as Record<string, number>, track });

describe("oil kept in shop", () => {
  it("reads the keep mark from a saved bill", () => {
    const t = trackOf({ track: { handover: "HELD", keep: { at: "2026-11-21T10:00:00.000Z", by: "Anil" } } });
    expect(t.keep).toEqual({ at: "2026-11-21T10:00:00.000Z", by: "Anil" });
    expect(trackOf({ track: { handover: "HELD", keep: "yes" } }).keep).toBeUndefined();
  });
  it("kept bills leave the give-oil queue and show in the kept list", () => {
    const a = bill("1", { handover: "HELD" });
    const b = bill("2", { handover: "HELD", keep: { at: "2026-11-21T10:30:00.000Z", by: "x" } });
    const c = bill("3", { handover: "GIVEN" });
    expect(heldQueue([a, b, c]).map((x) => x.no)).toEqual(["1"]);
    expect(keptList([a, b, c]).map((x) => x.no)).toEqual(["2"]);
  });
  it("oldest kept first", () => {
    const x = bill("1", { handover: "HELD", keep: { at: "2026-11-21T12:00:00.000Z", by: "" } });
    const y = bill("2", { handover: "HELD", keep: { at: "2026-11-21T09:00:00.000Z", by: "" } });
    expect(keptList([x, y]).map((b) => b.no)).toEqual(["2", "1"]);
  });
});
