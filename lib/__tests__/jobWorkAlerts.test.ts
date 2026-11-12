import { describe, expect, it } from "vitest";
import { attentionList, type BizData } from "@/lib/bizReports";

const base = (over: Partial<BizData>): BizData => ({
  sales: [], purchases: [], expenses: [], register: [], jobWork: [], mfg: [], closings: [], items: [], ...over,
});
const job = (id: string, createdAt: string, extra: Record<string, unknown> = {}) =>
  ({ id, customer: "Ramesh", vehicleNo: null, seedKg: 1000, cakeOwnership: "SHOP", advanceCustomerInr: 0, advanceAutoInr: 0, cans: null, notes: null, settled: true, settlementCustomerInr: 0, settlementAutoInr: 0, settlementRatePerKg: 6, settlementAmountInr: 6000, settledAt: createdAt, oilCollectedAt: null, updatedAt: createdAt, createdAt, ...extra }) as never;
const out = (date: string, oilKg: number, cakeKg: number) => ({ id: date, date, oilKg, cakeKg, notes: null, by: null, createdAt: "", updatedAt: "" });
const NOW = new Date("2026-11-14T06:00:00Z").getTime();

describe("job-work alerts (Spec B)", () => {
  it("flags a day over 2% loss", () => {
    const a = attentionList(base({ jobWork: [job("a", "2026-11-13T05:00:00Z", { oilCollectedAt: "x" })], jobWorkOutputs: [out("2026-11-13", 200, 770)] }), "2026-11-14", NOW);
    expect(a.some((x) => x.id === "jwo-2026-11-13")).toBe(true);
  });
  it("does not flag a day within 2%", () => {
    const a = attentionList(base({ jobWork: [job("a", "2026-11-13T05:00:00Z", { oilCollectedAt: "x" })], jobWorkOutputs: [out("2026-11-13", 220, 760)] }), "2026-11-14", NOW);
    expect(a.some((x) => x.id.startsWith("jwo-"))).toBe(false);
  });
  it("flags a day with seed but no output", () => {
    const a = attentionList(base({ jobWork: [job("a", "2026-11-13T05:00:00Z", { oilCollectedAt: "x" })], jobWorkOutputs: [] }), "2026-11-14", NOW);
    expect(a.some((x) => x.id === "jwm-2026-11-13")).toBe(true);
  });
  it("skips the missing-output alert when outputs were not loaded", () => {
    const a = attentionList(base({ jobWork: [job("a", "2026-11-13T05:00:00Z", { oilCollectedAt: "x" })] }), "2026-11-14", NOW);
    expect(a.some((x) => x.id.startsWith("jwm-"))).toBe(false);
  });
  it("flags oil not collected from an earlier day, but not older history or today", () => {
    const a = attentionList(base({ jobWork: [job("old", "2026-10-01T05:00:00Z"), job("y", "2026-11-13T05:00:00Z"), job("t", "2026-11-14T05:00:00Z")] }), "2026-11-14", NOW);
    const ids = a.filter((x) => x.id.startsWith("jwc-")).map((x) => x.id);
    expect(ids).toEqual(["jwc-y"]);
  });
});
