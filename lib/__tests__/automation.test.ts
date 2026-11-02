import { describe, expect, it } from "vitest";
import type { BizData, RegisterRow } from "../bizReports";
import { crc32, makeZip, toCsv } from "../zip";
import { tallyVouchers, tallyXml, unbalanced } from "../tally";
import { describeWhen, evaluateRules, freshOnly, RULE_TEMPLATES, type Rule } from "../rules";

const reg = (o: Partial<RegisterRow>): RegisterRow => ({ id: Math.random().toString(36).slice(2), date: "2026-11-01", kind: "SALE", item: null, itemLabel: null, qty: null, unit: null, rateInr: null, amountInr: 0, paymentMode: "CASH", partyName: null, notes: null, createdAt: "2026-11-01T06:00:00.000Z", ...o });
const data = (register: RegisterRow[], extra: Partial<BizData> = {}): BizData => ({ sales: [], purchases: [], expenses: [], register, jobWork: [], mfg: [], closings: [], items: [], ...extra });

describe("zip + csv", () => {
  it("crc32 matches the known value", () => {
    expect(crc32(new TextEncoder().encode("hello")).toString(16)).toBe("3610a686");
  });
  it("writes a valid zip structure", () => {
    const z = makeZip([{ name: "a.txt", data: "hi" }, { name: "b/c.csv", data: "x,y" }]);
    const dv = new DataView(z.buffer);
    expect(dv.getUint32(0, true)).toBe(0x04034b50);
    expect(dv.getUint32(z.length - 22, true)).toBe(0x06054b50);
    expect(dv.getUint16(z.length - 22 + 10, true)).toBe(2);
  });
  it("csv quotes and joins columns", () => {
    expect(toCsv([{ a: 1, b: 'x,"y"' }, { a: 2, c: true }])).toBe('﻿a,b,c\r\n1,"x,""y""",\r\n2,,true');
  });
});

describe("tally", () => {
  const d = data([
    reg({ kind: "SALE", amountInr: 1000, paymentMode: "CASH", item: "groundnut" }),
    reg({ kind: "SALE", amountInr: 500, paymentMode: "CREDIT", partyName: "Raju" }),
    reg({ kind: "UDHAAR_IN", amountInr: 300, paymentMode: "UPI", partyName: "Raju" }),
    reg({ kind: "EXPENSE", amountInr: 200, item: "diesel" }),
  ], {
    sales: [{ id: "s1", invoiceNo: "INV-1", date: "2026-11-01", partyId: "p", partyStateSnapshot: null, businessStateSnapshot: null, interState: false, subtotalInr: 1000, cgstInr: 25, sgstInr: 25, igstInr: 0, totalInr: 1050, paymentMode: "UPI", notes: null, lineItems: [], party: { id: "p", name: "Hotel Sai" }, createdAt: "", updatedAt: "" }],
  });
  it("every voucher balances", () => {
    const v = tallyVouchers(d, { from: "2026-11-01", to: "2026-11-01" });
    expect(v).toHaveLength(5);
    expect(unbalanced(v)).toEqual([]);
    const x = tallyXml(v, "Mahadev Traders");
    expect(x).toContain("<VOUCHERTYPENAME>Sales</VOUCHERTYPENAME>");
    expect(x).toContain("<LEDGERNAME>Raju</LEDGERNAME>");
    expect(x).toContain("<SVCURRENTCOMPANY>Mahadev Traders</SVCURRENTCOMPANY>");
    expect(x).toContain("<DATE>20261101</DATE>");
  });
});

describe("rules", () => {
  it("fires on udhaar, low rate and no entry", () => {
    const d = data([
      reg({ kind: "SALE", paymentMode: "CREDIT", partyName: "Raju", amountInr: 25000, date: "2026-09-01" }),
      reg({ kind: "SALE", item: "groundnut", itemLabel: "Groundnut oil", rateInr: 170, qty: 2, amountInr: 340, date: "2026-11-01", createdAt: "2026-11-01T03:00:00.000Z" }),
    ]);
    const rules: Rule[] = [
      { id: "r1", name: "Big udhaar", on: true, when: RULE_TEMPLATES[0].when, then: { alert: true, task: false } },
      { id: "r2", name: "Low rate", on: true, when: { t: "saleBelow", item: "groundnut", rate: 180 }, then: { alert: true, task: false } },
      { id: "r3", name: "Quiet", on: true, when: { t: "noEntry", hours: 3 }, then: { alert: true, task: true } },
      { id: "r4", name: "Off", on: false, when: { t: "noEntry", hours: 1 }, then: { alert: true, task: false } },
    ];
    const f = evaluateRules(rules, d, "2026-11-01", { nowMs: Date.parse("2026-11-01T08:00:00.000Z"), hourIst: 13 });
    expect(f.map((x) => x.ruleId)).toEqual(["r1", "r2", "r3"]);
    expect(f[0].text).toContain("Raju owes ₹25,000");
    expect(freshOnly(f, [f[0].key])).toHaveLength(2);
    expect(describeWhen(RULE_TEMPLATES[1].when)).toBe("any oil runs out within 3 days");
  });
});
