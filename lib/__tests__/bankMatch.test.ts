import { describe, expect, it } from "vitest";
import { csvRows, matchStatement, parseDate, readStatement } from "@/lib/bankMatch";

describe("dates", () => {
  it("reads the usual bank formats", () => {
    expect(["01/11/2026", "1-11-26", "2026-11-01", "01 Nov 2026", "Nov 01, 2026", "1-Nov-26"].map(parseDate)).toEqual(Array(6).fill("2026-11-01"));
    expect(parseDate("Opening balance")).toBeNull();
  });
});

describe("statement", () => {
  it("debit / credit columns (bank CSV)", () => {
    const csv = `Account statement\nDate,Narration,Chq/Ref No,Withdrawal Amt,Deposit Amt,Balance\n01/11/2026,"UPI/SURESH/ybl",123,,"1,500.00",9000\n01/11/2026,UPI-DIGWAL TRADERS,124,2000.00,,7000\n02/11/2026,NEFT GANESH,125,,750,7750\n`;
    const { txns, problem } = readStatement(csvRows(csv));
    expect(problem).toBeNull();
    expect(txns.map((t) => t.amount)).toEqual([1500, -2000, 750]);
    expect(txns[0]).toMatchObject({ date: "2026-11-01", desc: "UPI/SURESH/ybl", ref: "123" });
  });
  it("amount + type columns (PhonePe style)", () => {
    const rows = [["Date", "Transaction Details", "Type", "Amount"], ["Nov 01, 2026", "Received from Ramesh", "Credit", "₹900"], ["Nov 01, 2026", "Paid to Shell", "Debit", "₹300"]];
    expect(readStatement(rows).txns.map((t) => t.amount)).toEqual([900, -300]);
  });
  it("says when it cannot read the file", () => {
    expect(readStatement([["hello"], ["world"]]).problem).toMatch(/column names/);
  });
});

describe("matching", () => {
  it("pairs same amounts within 2 days and lists the leftovers", () => {
    const txns = [
      { i: 1, date: "2026-11-01", amount: 1500, desc: "SURESH", ref: "" },
      { i: 2, date: "2026-11-01", amount: -2000, desc: "DIGWAL", ref: "" },
      { i: 3, date: "2026-11-02", amount: 750, desc: "GANESH", ref: "" },
    ];
    const entries = [
      { id: "a", date: "2026-11-01", kind: "SALE", amountInr: 1500, paymentMode: "UPI", partyName: "Suresh" },
      { id: "b", date: "2026-10-31", kind: "PURCHASE", amountInr: 2000, paymentMode: "BANK", partyName: "Digwal" },
      { id: "c", date: "2026-11-02", kind: "SALE", amountInr: 400, paymentMode: "UPI", partyName: "X" },
      { id: "d", date: "2026-11-02", kind: "SALE", amountInr: 750, paymentMode: "CASH", partyName: "Cash man" },
    ];
    const m = matchStatement(txns, entries);
    expect(m.matched.map((x) => x.entry.id).sort()).toEqual(["a", "b"]);
    expect(m.bankOnly.map((t) => t.desc)).toEqual(["GANESH"]);
    expect(m.registerOnly.map((e) => e.id)).toEqual(["c"]);
  });
});
