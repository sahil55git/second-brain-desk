import { describe, expect, it } from "vitest";
import { money, parseCommand } from "@/lib/bot/parse";

describe("money", () => {
  it("reads rupee amounts", () => {
    expect(["500", "₹1,500", "1.5k", "500/-", "rs500", "2l"].map(money)).toEqual([500, 1500, 1500, 500, 500, 200000]);
    expect(["abc", "0", "-5", "15kg"].map(money)).toEqual([null, null, null, null]);
  });
});

describe("questions", () => {
  it("summaries", () => {
    expect(parseCommand("today")).toEqual({ t: "summary", span: "today" });
    expect(parseCommand("/week@MahadevBot")).toEqual({ t: "summary", span: "week" });
    expect(parseCommand("sales month")).toEqual({ t: "summary", span: "month" });
    expect(parseCommand("sale yesterday")).toEqual({ t: "summary", span: "yesterday" });
  });
  it("udhaar", () => {
    expect(parseCommand("udhaar")).toEqual({ t: "udhaar", name: null });
    expect(parseCommand("Udhaar Ramesh Patil?")).toEqual({ t: "udhaar", name: "Ramesh Patil" });
    expect(parseCommand("udhaar 500 ramesh").t).toBe("bad");
  });
  it("others", () => {
    expect(parseCommand("cash").t).toBe("cash");
    expect(parseCommand("stock").t).toBe("stock");
    expect(parseCommand("barrels").t).toBe("barrels");
    expect(parseCommand("job work").t).toBe("jobwork");
    expect(parseCommand("alerts").t).toBe("alerts");
    expect(parseCommand("help").t).toBe("help");
    expect(parseCommand("/start").t).toBe("start");
    expect(parseCommand("how is business").t).toBe("unknown");
  });
});

describe("files", () => {
  it("pdf / excel", () => {
    expect(parseCommand("report today pdf")).toEqual({ t: "report", what: "day", span: "today", format: "pdf" });
    expect(parseCommand("sales week excel")).toEqual({ t: "report", what: "sales", span: "week", format: "excel" });
    expect(parseCommand("udhaar pdf")).toEqual({ t: "report", what: "udhaar", span: "today", format: "pdf" });
    expect(parseCommand("expenses month pdf")).toEqual({ t: "report", what: "expenses", span: "month", format: "pdf" });
  });
});

describe("entries", () => {
  it("simple sale", () => {
    expect(parseCommand("sale 500 upi suresh")).toMatchObject({ t: "entry", kind: "SALE", amount: 500, mode: "UPI", party: "Suresh", item: null });
  });
  it("sale with qty, item and rate", () => {
    expect(parseCommand("sale 15kg groundnut @180 cash")).toMatchObject({ kind: "SALE", amount: 2700, qty: 15, unit: "kg", rate: 180, item: "groundnut", mode: "CASH", party: null });
    expect(parseCommand("sold 2 tins sunflower @ 1900 gpay mahesh")).toMatchObject({ amount: 3800, qty: 2, unit: "pcs", item: "sunflower", mode: "UPI", party: "Mahesh" });
  });
  it("credit sale needs a name", () => {
    expect(parseCommand("sale 900 udhaar ramesh")).toMatchObject({ kind: "SALE", mode: "CREDIT", party: "Ramesh" });
    expect(parseCommand("sale 900 udhaar").t).toBe("bad");
  });
  it("udhaar received", () => {
    expect(parseCommand("got 1000 ramesh")).toMatchObject({ kind: "UDHAAR_IN", amount: 1000, party: "Ramesh", mode: "CASH" });
    expect(parseCommand("udhaar in 1,000 ramesh upi")).toMatchObject({ kind: "UDHAAR_IN", amount: 1000, mode: "UPI" });
    expect(parseCommand("got 1000").t).toBe("bad");
  });
  it("expense", () => {
    expect(parseCommand("expense 200 diesel")).toMatchObject({ kind: "EXPENSE", amount: 200, item: "diesel", party: null });
    expect(parseCommand("spent 150 auto rickshaw")).toMatchObject({ kind: "EXPENSE", item: "other", itemLabel: "Auto Rickshaw" });
    expect(parseCommand("expense 200 udhaar diesel")).toMatchObject({ mode: "CASH" });
  });
  it("purchase and payment", () => {
    expect(parseCommand("purchase 5000 seed bank")).toMatchObject({ kind: "PURCHASE", item: "seed", mode: "UPI" });
    expect(parseCommand("purchase 5000 bottles ganesh traders")).toMatchObject({ item: "other", itemLabel: "Bottles", party: "Ganesh Traders" });
    expect(parseCommand("paid 3000 salary raju")).toMatchObject({ kind: "PAYMENT", item: "salary", party: "Raju", amount: 3000 });
  });
  it("missing amount", () => {
    expect(parseCommand("sale 15kg groundnut")).toEqual({ t: "bad", why: expect.stringMatching(/How much/) });
  });
  it("link codes", () => {
    expect(parseCommand("/link 123456")).toEqual({ t: "link", code: "123456" });
    expect(parseCommand("link 12").t).toBe("bad");
  });
});
