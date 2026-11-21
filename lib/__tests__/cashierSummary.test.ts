import { describe, expect, it } from "vitest";
import { cashierSummary } from "@/lib/cashierSummary";

describe("cashierSummary", () => {
  it("is all zero with no bills", () => {
    expect(cashierSummary([])).toEqual({ toReceive: 0, billsToPay: 0, oilHeld: 0, kept: 0, oilReady: 0, oldestMin: 0 });
  });
});
