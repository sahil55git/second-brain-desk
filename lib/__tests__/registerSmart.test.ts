import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG, itemsFor } from "@/lib/register";
import { mapRegisterFill, matchCatalogItem, normMode, normUnit, registerContext, udhaarBalances, type RegisterRow } from "@/lib/registerSmart";

const cfg = DEFAULT_CONFIG;

describe("matchCatalogItem", () => {
  const items = itemsFor("SALE", cfg);
  it("matches English, Kannada, longer phrases and typos to the register's own buttons", () => {
    expect(matchCatalogItem("Sunflower", items)?.key).toBe("sunflower");
    expect(matchCatalogItem("sunflower oil 15 kg tin", items)?.key).toBe("sunflower");
    expect(matchCatalogItem("ಸೂರ್ಯಕಾಂತಿ", items)?.key).toBe("sunflower");
    expect(matchCatalogItem("ground nut", items)?.key).toBe("groundnut");
    expect(matchCatalogItem("khali", items)?.key ?? "cake").toBe("cake"); // not in the label → falls through (allowed to miss)
    expect(matchCatalogItem("Oil cake", items)?.key).toBe("cake");
  });
  it("returns null for something unknown or empty, and never the 'Other' button", () => {
    expect(matchCatalogItem("Totally unrelated stuff", items)).toBeNull();
    expect(matchCatalogItem("other", items)).toBeNull();
    expect(matchCatalogItem("", items)).toBeNull();
  });
  it("finds learned custom items", () => {
    const c = { ...cfg, customItems: { SALE: [{ key: "til", label: "Til oil" }] } };
    expect(matchCatalogItem("til oil", itemsFor("SALE", c))?.key).toBe("til");
  });
});

describe("units and modes", () => {
  it("maps what people say to the register's units", () => {
    expect(normUnit("Litres")).toBe("ltr");
    expect(normUnit("tin")).toBe("pcs");
    expect(normUnit("kgs")).toBe("kg");
    expect(normUnit("quintal")).toBeUndefined();
  });
  it("only sales and purchases may be on udhaar; bank counts as UPI", () => {
    expect(normMode("CREDIT", "SALE")).toBe("CREDIT");
    expect(normMode("CREDIT", "EXPENSE")).toBeUndefined();
    expect(normMode("BANK", "EXPENSE")).toBe("UPI");
    expect(normMode("OTHER", "SALE")).toBeUndefined();
  });
});

describe("mapRegisterFill", () => {
  it("turns an AI-read sale into a pre-filled form (never a saved entry)", () => {
    const d = mapRegisterFill({ kind: "sale", item: "sunflower oil", qty: "10", unit: "kg", rateInr: 140, paymentMode: "CASH", partyName: "Ramesh" }, cfg);
    expect(d.kind).toBe("SALE");
    expect(d.init).toEqual({ item: "sunflower", qty: 10, unit: "kg", rate: 140, amount: 1400, mode: "CASH", party: "Ramesh" });
    expect(d.empty).toBe(false);
    expect(d.unmatchedItem).toBeNull();
  });
  it("keeps an amount the person said, instead of qty × rate", () => {
    expect(mapRegisterFill({ kind: "SALE", item: "karadi", qty: 10, unit: "kg", rateInr: 250, amountInr: 2400 }, cfg).init.amount).toBe(2400);
  });
  it("an item with no button becomes 'Other' with the heard name", () => {
    const d = mapRegisterFill({ kind: "EXPENSE", item: "Gunny bag stitching", amountInr: 500, paymentMode: "CASH" }, cfg);
    expect(d.init).toMatchObject({ item: "other", otherName: "Gunny bag stitching", amount: 500, mode: "CASH" });
    expect(d.unmatchedItem).toBe("Gunny bag stitching");
    // "Auto repair labour" still lands on the Repair button
    expect(mapRegisterFill({ kind: "EXPENSE", item: "Auto repair labour", amountInr: 500 }, cfg).init.item).toBe("repair");
  });
  it("drops what does not belong: udhaar on an expense, qty/rate on an expense, party on pigmee", () => {
    const e = mapRegisterFill({ kind: "EXPENSE", item: "diesel", qty: 5, rateInr: 90, amountInr: 450, paymentMode: "CREDIT" }, cfg);
    expect(e.init.mode).toBeUndefined();
    expect(e.init.qty).toBeUndefined();
    expect(e.init.rate).toBeUndefined();
    const p = mapRegisterFill({ kind: "PIGMEE", amountInr: 1000, partyName: "Bank", paymentMode: "CASH" }, cfg);
    expect(p.init.party).toBeUndefined();
    expect(p.init.mode).toBeUndefined();
  });
  it("udhaar received has no item button; unknown or missing kind stays null for the person to pick", () => {
    expect(mapRegisterFill({ kind: "UDHAAR_IN", partyName: "Ramesh", amountInr: 500, item: "whatever" }, cfg).init.item).toBeUndefined();
    const k = mapRegisterFill({ amountInr: 500, partyName: "Ramesh" }, cfg);
    expect(k.kind).toBeNull();
    expect(k.init.amount).toBe(500);
    // the person picks the kind → the same fields fill that form
    expect(mapRegisterFill({ amountInr: 500, partyName: "Ramesh" }, cfg, "UDHAAR_IN").kind).toBe("UDHAAR_IN");
  });
  it("reports 'nothing found' and ignores junk numbers", () => {
    expect(mapRegisterFill({ kind: "SALE", amountInr: "abc", qty: -3 }, cfg).empty).toBe(true);
    expect(mapRegisterFill({}, cfg).empty).toBe(true);
  });
  it("fresh crush is recognised so the right sheet can open", () => {
    expect(mapRegisterFill({ kind: "FRESH_CRUSH", item: "groundnut", amountInr: 800 }, cfg).kind).toBe("FRESH_CRUSH");
  });
});

const row = (o: Partial<RegisterRow>): RegisterRow => ({
  date: "2026-10-11", createdAt: "2026-10-11T05:00:00.000Z", kind: "SALE", amountInr: 100, paymentMode: "CASH", ...o,
});

describe("udhaarBalances", () => {
  it("who owes us = credit sales − udhaar received; who we owe = credit purchases − payments", () => {
    const b = udhaarBalances([
      row({ date: "2026-10-01", createdAt: "2026-10-01T05:00:00.000Z", kind: "SALE", paymentMode: "CREDIT", amountInr: 3000, partyName: "Ramesh Patil" }),
      row({ date: "2026-10-05", createdAt: "2026-10-05T05:00:00.000Z", kind: "UDHAAR_IN", amountInr: 1000, partyName: "ramesh patil" }),
      row({ kind: "FRESH_CRUSH", paymentMode: "CREDIT", amountInr: 400, partyName: "Sita" }),
      row({ kind: "PURCHASE", paymentMode: "CREDIT", amountInr: 9000, partyName: "Balaji Mills" }),
      row({ kind: "PAYMENT", amountInr: 2000, partyName: "Balaji Mills" }),
      row({ kind: "SALE", paymentMode: "CASH", amountInr: 777, partyName: "Cash Customer" }),
    ]);
    expect(b.owedToMe).toEqual([
      { party: "Ramesh Patil", amount: 2000, since: "2026-10-01" },
      { party: "Sita", amount: 400, since: "2026-10-11" },
    ]);
    expect(b.iOwe).toEqual([{ party: "Balaji Mills", amount: 7000, since: "2026-10-11" }]);
  });
  it("a fully settled party disappears; a salary payment to someone we never bought from is ignored", () => {
    const b = udhaarBalances([
      row({ kind: "SALE", paymentMode: "CREDIT", amountInr: 500, partyName: "A" }),
      row({ kind: "UDHAAR_IN", amountInr: 500, partyName: "A", createdAt: "2026-10-11T06:00:00.000Z" }),
      row({ kind: "PAYMENT", amountInr: 12000, partyName: "Worker" }),
    ]);
    expect(b.owedToMe).toEqual([]);
    expect(b.iOwe).toEqual([]);
  });
});

describe("registerContext", () => {
  it("gives the AI today's entries, totals, cash, udhaar and pending job-work — and nothing invented", () => {
    const today = [
      row({ kind: "SALE", item: "sunflower", qty: 10, unit: "kg", rateInr: 140, amountInr: 1400, partyName: "Ramesh" }),
      row({ kind: "EXPENSE", item: "diesel", amountInr: 500, createdAt: "2026-10-11T06:00:00.000Z" }),
    ];
    const text = registerContext({
      date: "2026-10-11",
      today,
      recent: [...today, row({ date: "2026-10-10", kind: "SALE", paymentMode: "CREDIT", amountInr: 800, partyName: "Sita" })],
      openingInr: 5000,
      systemCashNowInr: 5900,
      tallies: [{ session: "AFTERNOON", counted: 5800, system: 5900, diff: -100 }],
      jobWork: [{ customer: "Gopal", seedKg: 120, createdAt: "2026-10-05T05:00:00.000Z", advanceCustomerInr: 200, advanceAutoInr: 100 }],
      nowMs: Date.parse("2026-10-11T10:00:00+05:30"),
    });
    expect(text).toContain("TODAY'S ENTRIES (2)");
    expect(text).toContain("SALE sunflower 10 kg @140 = ₹1400 CASH — Ramesh");
    expect(text).toContain("cash in ₹1400, cash out ₹500");
    expect(text).toContain("should be in the counter now ₹5900");
    expect(text).toContain("short ₹100");
    expect(text).toContain("Sita ₹800 (since 2026-10-10)");
    expect(text).toContain("Gopal: seed 120 kg, 5 day(s) pending, advances ₹300");
    expect(text).toContain("2026-10-10: sales ₹800");
  });
  it("says 'none yet' on an empty day", () => {
    const text = registerContext({ date: "2026-10-11", today: [], recent: [], openingInr: null, systemCashNowInr: null, tallies: [], jobWork: [], nowMs: 0 });
    expect(text).toContain("(none yet)");
    expect(text).toContain("CUSTOMERS WHO OWE US (udhaar, last 30 days): none");
  });
});
