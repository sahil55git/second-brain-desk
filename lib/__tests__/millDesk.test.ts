import { describe, expect, it } from "vitest";
import { cleanItem, intakeCans, intakeData, jobClosed, jobError, jobMoney, millMark, slipNo, tokNo, tokOf, validId } from "@/lib/mill/millDesk";

const job = (o: Record<string, unknown> = {}) => ({ id: "Jabc123", tok: "JW-0413", customer: "Gundappa", place: "Janawada", mobile: "9876543210", seedKg: 590.2, nb: 12, cake: "SHOP" as const, advC: 500, advA: 200, cans: { can15: 2 }, ...o });

describe("Mill Desk money (same as the preview's settlement)", () => {
  it("shop keeps khali: ₹6/kg, split 50/50, advances and cans off", () => {
    const m = jobMoney(job());
    const gross = 590.2 * 6;
    expect(m.rate).toBe(6);
    expect(m.due).toBeCloseTo(gross - 700 - 100, 6);
    expect(m.customer).toBeCloseTo(gross / 2 - 500 - 100, 6);
    expect(m.auto).toBeCloseTo(gross / 2 - 200, 6);
  });
  it.each([
    [{ mode: "amount", value: 0 }, 580, 0],
    [{ mode: "amount", value: 125 }, 455, 125],
    [{ mode: "rate", value: 4 }, 180, 400],
  ] as const)("allocates the agreed tempo share and keeps can charges on the customer", (tempoSplit, customer, auto) => {
    const j = job({ seedKg: 100, advC: 0, advA: 0, cans: { can5old: 1 }, tempoSplit, settled: true });
    expect(jobError(j)).toBeNull();
    expect(jobMoney(j)).toMatchObject({ due: 580, customer, auto });
    expect(intakeData(j, null, null)).toMatchObject({ settlementCustomerInr: customer, settlementAutoInr: auto });
  });
  it("rejects a tempo share above the payout or the per-kg rate", () => {
    expect(jobError(job({ seedKg: 1, tempoSplit: { mode: "amount", value: 7 } }))).toMatch(/Tempo share/);
    expect(jobError(job({ tempoSplit: { mode: "rate", value: 7 } }))).toMatch(/Tempo share/);
  });
  it("customer takes khali: ₹10/kg, cans and the advance we gave added, no tempo split", () => {
    const m = jobMoney(job({ seedKg: 120, cake: "CUSTOMER", advC: 300, advA: 0, cans: { can5new: 1 } }));
    expect(m.rate).toBe(10);
    expect(m.due).toBe(1200 + 40 + 300);
    expect(m.customer).toBe(1540);
    expect(m.auto).toBe(0);
  });
  it("cans carry today's rate and ignore unknown kinds", () => {
    expect(intakeCans({ can15: 2, can5old: 0, junk: 3 })).toEqual({ can15: { qty: 2, rate: 50 } });
  });
});

describe("intake copy", () => {
  it("unpaid job: no settlement amounts, mark and details in notes", () => {
    const d = intakeData(job(), "Sahil", 3);
    expect(d.customer).toBe("Gundappa (Janawada)");
    expect(d.settled).toBe(false);
    expect(d.settlementAmountInr).toBeNull();
    expect(d.notes).toContain("Inv #0413");
    expect(d.notes).toContain("Token 3");
    expect(d.notes).toContain("Mobile 9876543210");
    expect(d.notes).toContain(millMark("Jabc123"));
    expect(d.cans).toEqual({ can15: { qty: 2, rate: 50 } });
  });
  it("paid job carries the split and the payment way", () => {
    const d = intakeData(job({ settled: true, method: "upi" }), "Sahil", 1);
    expect(d.settlementRatePerKg).toBe(6);
    expect(d.settlementCustomerInr).toBeCloseTo(590.2 * 3 - 600, 6);
    expect(d.notes).toContain("Paid by UPI");
  });
  it("village-only customer", () => {
    const d = intakeData(job({ customer: "Bhalki", place: "Bhalki" }), null, null);
    expect(d.customer).toBe("Bhalki");
    expect(d.notes).toContain("Village only");
  });
});

describe("checks", () => {
  it("job shape", () => {
    expect(jobError(job())).toBeNull();
    expect(jobError(job({ tok: "x" }))).toMatch(/Invoice/);
    expect(jobError(job({ customer: " " }))).toMatch(/Customer/);
    expect(jobError(job({ seedKg: 0 }))).toMatch(/Seed/);
    expect(jobError(job({ cake: "X" }))).toMatch(/khali/);
    expect(jobError(job({ advC: -1 }))).toMatch(/negative/);
  });
  it("ids, sizes, numbers", () => {
    expect(validId("Qk3x9a")).toBe(true);
    expect(validId("gundappa|janawada")).toBe(true);
    expect(validId("")).toBe(false);
    expect(validId("a".repeat(81))).toBe(false);
    expect(cleanItem({ id: "R1", big: "x".repeat(30000) })).toBeNull();
    expect(cleanItem([1])).toBeNull();
    expect(cleanItem({ id: "R1", state: "oil" })).toEqual({ id: "R1", state: "oil" });
    expect(tokNo("JW-0416")).toBe(416);
    expect(tokOf(7)).toBe("JW-0007");
    expect(slipNo("WS-0031")).toBe(31);
    expect(jobClosed({ settled: true, given: true })).toBe(true);
    expect(jobClosed({ settled: true, given: false })).toBe(false);
  });
});

describe("advance returned (update 2)", () => {
  it("takes the returned advance off the customer advance", async () => {
    const { jobMoney, jobError } = await import("../mill/millDesk");
    const base = { seedKg: 100, cake: "SHOP" as const, advC: 200, advA: 0, cans: {} };
    expect(jobMoney(base).due).toBe(400);
    expect(jobMoney({ ...base, advR: 150 }).due).toBe(550);
    expect(jobMoney({ ...base, advR: 999 }).due).toBe(600);
    expect(jobMoney({ ...base, advA: 100, advRA: 40 }).due).toBe(340);
    expect(jobError({ tok: "JW-0001", customer: "A", seedKg: 10, cake: "SHOP", advR: -1 })).toBe("Advance cannot be negative.");
  });
});
