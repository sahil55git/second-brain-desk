import { describe, expect, it } from "vitest";
import {
  checkGstin, cleanAiLines, expenseChecks, findItemByCode, gstinCheckChar, matchItem, matchParty, nextItemCode,
  purchaseChecks, rateHistory, salesChecks, similarity, type BillLike,
} from "@/lib/smartEntry";

const parties = [
  { id: "p1", name: "Pawan Refineries Pvt Ltd", gstin: "27AAPFU0939F1ZV" },
  { id: "p2", name: "Sri Balaji Oil Mills", gstin: null },
  { id: "p3", name: "Ramesh Patil", gstin: null },
];
const items = [
  { id: "i1", name: "Refined Sunflower Oil", sku: "RSF", barcode: "8901234567890", unit: "kg" },
  { id: "i2", name: "Karadi Oil 1L", sku: null, barcode: "MT000004", unit: "pcs" },
  { id: "i3", name: "Groundnut Oil", sku: "GN", barcode: null, unit: "kg" },
];

describe("names", () => {
  it("matches what a bill or a voice says to the master list", () => {
    expect(similarity("PAWAN REFINER", "Pawan Refineries Pvt Ltd")).toBeGreaterThan(0.8);
    expect(matchParty("PAWAN REFINER", null, parties)?.party.id).toBe("p1");
    expect(matchParty("balaji oil mill", null, parties)?.party.id).toBe("p2");
    expect(matchParty("Totally Different Traders", null, parties)).toBeNull();
  });
  it("prefers a GSTIN match over the name", () => {
    expect(matchParty("Someone else", "27aapfu0939f1zv", parties)).toMatchObject({ by: "gstin", party: { id: "p1" } });
  });
  it("matches spoken item names", () => {
    expect(matchItem("refined sunflower", items)?.item.id).toBe("i1");
    expect(matchItem("groundnut", items)?.item.id).toBe("i3");
  });
});

describe("codes", () => {
  it("finds an item by barcode, SKU or exact name", () => {
    expect(findItemByCode("8901234567890", items)?.id).toBe("i1");
    expect(findItemByCode(" mt000004 ", items)?.id).toBe("i2");
    expect(findItemByCode("gn", items)?.id).toBe("i3");
    expect(findItemByCode("nope", items)).toBeNull();
  });
  it("hands out the next shop code", () => {
    expect(nextItemCode(items)).toBe("MT000005");
    expect(nextItemCode([])).toBe("MT000001");
  });
});

describe("GSTIN", () => {
  it("accepts a valid GSTIN and names the state", () => {
    expect(checkGstin("27AAPFU0939F1ZV")).toEqual({ ok: true, state: "Maharashtra" });
    const g = "29ABCDE1234F1Z";
    expect(checkGstin(g + gstinCheckChar(g))).toEqual({ ok: true, state: "Karnataka" });
  });
  it("catches a misread GSTIN (like a 14-character one from a photo)", () => {
    expect(checkGstin("36AAICP5374K1Z")).toMatchObject({ ok: false });
    expect(checkGstin("27AAPFU0939F1ZW")).toMatchObject({ ok: false, why: expect.stringContaining("check digit") });
    expect(checkGstin("27AAPFUO939F1ZV")).toMatchObject({ ok: false });
  });
});

const bills: BillLike[] = [
  { id: "b1", billNo: "SIV-640", date: "2026-09-20", partyId: "p1", party: { name: "Pawan Refineries" }, lineItems: [{ itemId: "i1", name: "Refined Sunflower Oil", qty: 2000, rateInr: 150 }] },
  { id: "b2", billNo: "SIV-649", date: "2026-10-05", partyId: "p1", party: { name: "Pawan Refineries" }, lineItems: [{ itemId: "i1", name: "Refined Sunflower Oil", qty: 2190, rateInr: 156 }] },
];

describe("purchase checks", () => {
  const base = { partyId: "p1", partyGstin: "27AAPFU0939F1ZV", billNo: "SIV-700", date: "2026-10-10", lines: [{ itemId: "i1", name: "Refined Sunflower Oil", qty: 100, rateInr: 157 }], linesTotalInr: 16485 };
  it("passes a normal bill", () => {
    expect(purchaseChecks(base, { bills, today: "2026-10-11" })).toEqual([]);
  });
  it("stops a bill number entered twice", () => {
    const c = purchaseChecks({ ...base, billNo: "siv 649" }, { bills, today: "2026-10-11" });
    expect(c[0]).toMatchObject({ level: "alert" });
  });
  it("points out a rate far from the last purchase, a wrong GSTIN and totals that don't add up", () => {
    const c = purchaseChecks(
      { ...base, lines: [{ itemId: "i1", name: "Refined Sunflower Oil", qty: 100, rateInr: 190 }], scanned: { totalInr: 15000, gstin: "36AAICP5374K1Z" } },
      { bills, today: "2026-10-11" }
    );
    const msgs = c.map((x) => x.msg).join(" | ");
    expect(msgs).toContain("vs last purchase ₹156 on 2026-10-05");
    expect(msgs).toContain("looks wrong");
    expect(msgs).toContain("lines add up to");
  });
  it("flags a GSTIN that is valid but not this supplier's", () => {
    const other = "29ABCDE1234F1Z" + gstinCheckChar("29ABCDE1234F1Z");
    const c = purchaseChecks({ ...base, scanned: { gstin: other } }, { bills, today: "2026-10-11" });
    expect(c.some((x) => x.level === "alert" && x.msg.includes("not the supplier"))).toBe(true);
  });
});

describe("sales checks", () => {
  const invoices = [150, 175, 176, 178].map((r, i) => ({ date: `2026-10-0${i + 1}`, partyId: "p3", lineItems: [{ itemId: "i1", name: "Refined Sunflower Oil", qty: 15, rateInr: r }] }));
  it("alerts when selling below what it cost", () => {
    const c = salesChecks({ partyId: "p3", date: "2026-10-11", lines: [{ itemId: "i1", name: "Refined Sunflower Oil", qty: 15, rateInr: 150 }] }, { invoices, bills, today: "2026-10-11" });
    expect(c.find((x) => x.level === "alert")?.msg).toContain("below the last purchase rate ₹156");
  });
  it("is quiet at a normal rate", () => {
    expect(salesChecks({ partyId: "p3", date: "2026-10-11", lines: [{ itemId: "i1", name: "Refined Sunflower Oil", qty: 15, rateInr: 176 }] }, { invoices, bills, today: "2026-10-11" })).toEqual([]);
  });
  it("gives the rate history newest first", () => {
    expect(rateHistory(bills, { itemId: "i1" }).map((r) => r.rate)).toEqual([156, 150]);
    expect(rateHistory(bills, { name: "refined  sunflower oil" })[0].date).toBe("2026-10-05");
  });
});

describe("expense checks", () => {
  const expenses = [500, 520, 480, 510].map((a, i) => ({ date: `2026-10-0${i + 1}`, category: "Fuel", amountInr: a }));
  it("catches the same receipt twice and an unusually big amount", () => {
    expect(expenseChecks({ date: "2026-10-02", category: "fuel", amountInr: 520 }, { expenses, today: "2026-10-11" })[0].level).toBe("alert");
    expect(expenseChecks({ date: "2026-10-11", category: "Fuel", amountInr: 5000 }, { expenses, today: "2026-10-11" })[0].msg).toContain("× the usual");
    expect(expenseChecks({ date: "2026-10-11", category: "Fuel", amountInr: 530 }, { expenses, today: "2026-10-11" })).toEqual([]);
  });
});

describe("AI-drafted lines", () => {
  it("keeps sensible values and drops rubbish", () => {
    expect(cleanAiLines([{ name: "Refined sunflower", qty: "2,190", rateInr: "₹156", gstRatePct: 5, hsnCode: "1512.11" }, { qty: 3 }, "x", { name: "Bag", gstRatePct: 99 }])).toEqual([
      { name: "Refined sunflower", hsnCode: "151211", qty: 2190, unit: "kg", rateInr: 156, gstRatePct: 5 },
      { name: "Bag", hsnCode: "", qty: null, unit: "kg", rateInr: null, gstRatePct: null },
    ]);
    expect(cleanAiLines("not a list")).toEqual([]);
  });
});
