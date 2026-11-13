import { describe, expect, it } from "vitest";
import { approvalOf, decide, needsApproval, staffLimit, STAFF_LIMIT_DEFAULT_INR } from "@/lib/approval";
import { lockedOut, LOGIN_MAX_FAILS, LOGIN_WINDOW_MS } from "@/lib/loginGuard";
import { batchLabel, checkTransfer, transferSummary, type BatchLite, type TransferRow } from "@/lib/millTransfer";

describe("needsApproval", () => {
  it("lets staff pay up to the limit and asks above it", () => {
    expect(needsApproval("EXPENSE", 2000, false, 2000)).toBe(false);
    expect(needsApproval("EXPENSE", 2000.01, false, 2000)).toBe(true);
    expect(needsApproval("PAYMENT", 1999, false, 2000)).toBe(false);
    expect(needsApproval("PAYMENT", 50000, false, 2000)).toBe(true);
  });
  it("always asks for an owner draw entered by staff, however small", () => {
    expect(needsApproval("OWNER_DRAW", 10, false, 2000)).toBe(true);
  });
  it("never asks for the owner's own entries", () => {
    for (const k of ["EXPENSE", "PAYMENT", "OWNER_DRAW"]) expect(needsApproval(k, 999999, true, 2000)).toBe(false);
  });
  it("leaves money in, purchases and pigmee alone", () => {
    for (const k of ["SALE", "FRESH_CRUSH", "UDHAAR_IN", "PURCHASE", "PIGMEE"]) expect(needsApproval(k, 999999, false, 2000)).toBe(false);
  });
  it("a limit of zero means every expense and payment asks", () => {
    expect(needsApproval("EXPENSE", 1, false, 0)).toBe(true);
  });
});

describe("staffLimit", () => {
  it("is Rs 2,000 unless a sensible limit is saved", () => {
    expect(STAFF_LIMIT_DEFAULT_INR).toBe(2000);
    for (const bad of [null, undefined, {}, { staffExpenseLimitInr: "abc" }, { staffExpenseLimitInr: -1 }, { staffExpenseLimitInr: 1e9 }, "x"]) expect(staffLimit(bad)).toBe(2000);
    expect(staffLimit({ staffExpenseLimitInr: 5000 })).toBe(5000);
    expect(staffLimit({ staffExpenseLimitInr: "3000" })).toBe(3000);
    expect(staffLimit({ staffExpenseLimitInr: 0 })).toBe(0);
  });
});

describe("approvalOf and decide", () => {
  it("reads the state and ignores anything else", () => {
    expect(approvalOf({ approval: "pending" })).toBe("pending");
    expect(approvalOf({ approval: "yes" })).toBeNull();
    expect(approvalOf(null)).toBeNull();
    expect(approvalOf("pending")).toBeNull();
  });
  it("keeps the rest of the details when the owner decides", () => {
    const d = decide({ approval: "pending", clientId: "c123abc", channel: "X" }, "approve", "Sahil", "2026-11-13T02:00:00.000Z");
    expect(d).toEqual({ approval: "approved", clientId: "c123abc", channel: "X", approvalBy: "Sahil", approvalAt: "2026-11-13T02:00:00.000Z" });
  });
  it("records the reason only for a refusal", () => {
    expect(decide({ approval: "pending" }, "reject", "Sahil", "t", "not agreed")).toMatchObject({ approval: "rejected", approvalNote: "not agreed" });
    expect(decide({ approval: "pending" }, "approve", "Sahil", "t", "x")).not.toHaveProperty("approvalNote");
    expect(decide(null, "reject", "Sahil", "t")).toEqual({ approval: "rejected", approvalBy: "Sahil", approvalAt: "t" });
  });
});

describe("lockedOut", () => {
  const now = 1_000_000_000;
  it("locks at five wrong tries inside fifteen minutes", () => {
    const four = [1, 2, 3, 4].map((m) => now - m * 60000);
    expect(lockedOut(four, now)).toBe(false);
    expect(lockedOut([...four, now - 5 * 60000], now)).toBe(true);
    expect(LOGIN_MAX_FAILS).toBe(5);
  });
  it("opens again when the oldest try is fifteen minutes old", () => {
    const tries = [0, 1, 2, 3].map((m) => now - m * 60000).concat(now - LOGIN_WINDOW_MS);
    expect(lockedOut(tries, now)).toBe(false);
    expect(lockedOut([...tries.slice(0, 4), now - LOGIN_WINDOW_MS + 1], now)).toBe(true);
  });
  it("ignores tries dated in the future", () => {
    expect(lockedOut([1, 2, 3, 4, 5].map((s) => now + s * 1000), now)).toBe(false);
  });
});

describe("mill transfers", () => {
  const ok = { mill: "Mill 1", batchId: "b1", batchLabel: "2026-11-01 · Mill 1 · Barrel 2", toTank: "k2", oilKg: 152.456, note: " morning " };
  it("accepts a complete transfer and rounds the kg", () => {
    expect(checkTransfer(ok)).toEqual({ ok: true, data: { ...ok, oilKg: 152.46, note: "morning" } });
    expect(checkTransfer({ ...ok, oilKg: "80", batchId: "", batchLabel: null })).toMatchObject({ ok: true, data: { oilKg: 80, batchId: null, batchLabel: null } });
  });
  it("refuses a missing or wrong mill, tank or weight", () => {
    for (const bad of [{ ...ok, mill: "Mill 3" }, { ...ok, mill: "" }, { ...ok, toTank: "sunflower" }, { ...ok, oilKg: 0 }, { ...ok, oilKg: -5 }, { ...ok, oilKg: 1001 }, { ...ok, oilKg: "abc" }, { ...ok, oilKg: "" }, { ...ok, oilKg: null }, null, "x"]) {
      expect(checkTransfer(bad).ok, JSON.stringify(bad)).toBe(false);
    }
  });
  const batch = (id: string, step3Kg: number | null, step3Date: string | null, date = "2026-11-01"): BatchLite => ({ id, date, mill: "Mill 1", barrel: "2", step3Kg, step3Date });
  const move = (id: string, batchId: string | null, oilKg: number): TransferRow => ({ id, date: "2026-11-05", by: "nilkant", data: { mill: "Mill 1", batchId, batchLabel: null, toTank: "k2", oilKg, note: null } });
  it("labels a batch", () => {
    expect(batchLabel(batch("b", 1, null))).toBe("2026-11-01 · Mill 1 · Barrel 2");
  });
  it("flags a decanted batch with oil not logged after two days", () => {
    const s = transferSummary([batch("b1", 180, "2026-11-04")], [move("t1", "b1", 100)], "2026-11-07");
    expect(s.batches[0]).toMatchObject({ decantKg: 180, movedKg: 100, leftKg: 80, daysSinceDecant: 3, waiting: true });
  });
  it("does not flag inside two days, when fully moved, or within a kilo", () => {
    expect(transferSummary([batch("b1", 180, "2026-11-05")], [], "2026-11-07").batches[0].waiting).toBe(false);
    expect(transferSummary([batch("b1", 180, "2026-11-01")], [move("t1", "b1", 120), move("t2", "b1", 60)], "2026-11-10").batches[0]).toMatchObject({ movedKg: 180, leftKg: 0, waiting: false });
    expect(transferSummary([batch("b1", 180, "2026-11-01")], [move("t1", "b1", 179.2)], "2026-11-10").batches[0].waiting).toBe(false);
  });
  it("ignores batches not yet decanted and never shows negative oil left", () => {
    const s = transferSummary([batch("b0", null, null), batch("b1", 100, "2026-11-01")], [move("t1", "b1", 130)], "2026-11-10");
    expect(s.batches.map((b) => b.batchId)).toEqual(["b1"]);
    expect(s.batches[0].leftKg).toBe(0);
  });
  it("totals unlinked transfers separately and lists waiting batches first", () => {
    const s = transferSummary([batch("ok", 50, "2026-11-09"), batch("late", 50, "2026-11-01")], [move("t1", null, 40), move("t2", "ok", 50)], "2026-11-10");
    expect(s).toMatchObject({ unlinkedKg: 40, totalKg: 90 });
    expect(s.batches.map((b) => b.batchId)).toEqual(["late", "ok"]);
  });
  it("uses the batch date when the decant date is missing", () => {
    expect(transferSummary([batch("b1", 50, null, "2026-11-01")], [], "2026-11-10").batches[0].daysSinceDecant).toBe(9);
  });
});
