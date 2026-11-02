import { describe, expect, it } from "vitest";
import type { BizData, RegisterRow } from "../bizReports";
import { businessDigest, cfoPack } from "../askContext";

const reg = (o: Partial<RegisterRow>): RegisterRow => ({ id: Math.random().toString(36).slice(2), date: "2026-11-01", kind: "SALE", item: "groundnut", itemLabel: null, qty: 5, unit: "kg", rateInr: 190, amountInr: 950, paymentMode: "CASH", partyName: "Raju", notes: null, createdAt: "2026-11-01T06:00:00.000Z", ...o });
const d: BizData = { sales: [], purchases: [], expenses: [], register: [reg({}), reg({ date: "2026-10-05", amountInr: 1900, qty: 10 }), reg({ kind: "SALE", paymentMode: "CREDIT", partyName: "Hotel Sai", amountInr: 5000, date: "2026-10-10" })], jobWork: [], mfg: [], closings: [], items: [] };

describe("business digest", () => {
  it("has monthly rows, products, customers and udhaar", () => {
    const t = businessDigest(d, "2026-11-01");
    expect(t).toContain("2026-10 | 6,900");
    expect(t).toMatch(/Groundnut[^:]*: .*26-10 15\/6,900/);
    expect(t).toContain("Hotel Sai");
    expect(t).toContain("UDHAAR OUTSTANDING ₹5,000");
  });
  it("cfo pack compares months", () => {
    const t = cfoPack(d, "2026-11-01");
    expect(t).toContain("THIS MONTH (2026-11-01→2026-11-01): sales 950");
    expect(t).toContain("LAST MONTH (2026-10-01→2026-10-31): sales 6,900");
  });
});
