import { describe, expect, it } from "vitest";
import { addLine, billKg, billSum, cashReturn, lineDisc, billTotal, changeDue, lineAmount, registerBody, updateLine, type CounterLine } from "../counterBill";

const karadi = (qty: number, source: CounterLine["source"] = "steady"): CounterLine => ({ item: "karadi", label: "Karadi", qty, unit: "kg", rate: 260, source });

describe("counter bill", () => {
  it("prices a weighed line to the paisa", () => {
    expect(lineAmount({ qty: 0.26, rate: 260 })).toBe(67.6);
    expect(lineAmount({ qty: 1.8, rate: 260 })).toBe(468);
    expect(lineAmount({ qty: 0.333, rate: 150 })).toBe(49.95);
  });
  it("adds each weighing as its own line and ignores an empty scale", () => {
    let b = addLine([], karadi(1.8));
    b = addLine(b, karadi(0.95));
    b = addLine(b, karadi(0));
    expect(b).toHaveLength(2);
    expect(billTotal(b)).toBe(715);
    expect(billKg(b)).toBe(2.75);
  });
  it("marks a typed quantity as typed", () => {
    const b = updateLine([karadi(1.8)], 0, { qty: 2 });
    expect(b[0].qty).toBe(2);
    expect(b[0].source).toBe("typed");
    expect(updateLine([karadi(1.8)], 0, { rate: 250 })[0].source).toBe("steady");
  });
  it("works out change", () => {
    expect(changeDue(468, 500)).toBe(32);
    expect(changeDue(468, 400)).toBe(-68);
  });
  it("builds one SALE entry; a single line is the entry's own item", () => {
    const r = registerBody([karadi(1.8)], "CASH", { date: "2026-11-16" });
    expect("body" in r && r.body).toMatchObject({ kind: "SALE", amountInr: 468, item: "karadi", qty: 1.8, unit: "kg", rateInr: 260, paymentMode: "CASH", lines: undefined, notes: null });
  });
  it("sends several lines and notes which weights were not steady", () => {
    const r = registerBody([karadi(1.8), karadi(0.5, "moving"), karadi(1, "typed")], "UPI", { date: "2026-11-16" });
    if (!("body" in r)) throw new Error(r.err);
    expect(r.body.lines).toHaveLength(3);
    expect(r.body.amountInr).toBe(858);
    expect(r.body.paymentMode).toBe("UPI");
    expect(r.body.notes).toBe("Counter: #2 read while moving, #3 typed");
  });
  it("refuses udhaar without a name and an empty bill", () => {
    expect(registerBody([karadi(1)], "CREDIT", { date: "2026-11-16" })).toHaveProperty("err");
    expect(registerBody([], "CASH", { date: "2026-11-16" })).toHaveProperty("err");
    const ok = registerBody([karadi(1)], "CREDIT", { date: "2026-11-16", party: " Ramesh " });
    expect("body" in ok && ok.body.partyName).toBe("Ramesh");
  });
  it("takes a discount and rounds off, spreading the net over the lines exactly", () => {
    const b = [karadi(1.8), { ...karadi(0.95), item: "sunflower", label: "Sunflower", rate: 165 }];
    const s = billSum(b, { discount: 4.75 });
    expect(s).toMatchObject({ gross: 624.75, discount: 4.75, roundOff: 0, net: 620 });
    expect(Math.round(s.amounts.reduce((a, x) => a + x, 0) * 100) / 100).toBe(620);
    const r = billSum(b, { roundOff: true });
    expect(r).toMatchObject({ net: 625, roundOff: 0.25 });
    expect(Math.round(r.amounts.reduce((a, x) => a + x, 0) * 100) / 100).toBe(625);
    expect(billSum(b, { discount: 10, pct: true }).net).toBe(562.27);
  });
  it("writes discount and round-off into the saved entry", () => {
    const r = registerBody([karadi(1.8), karadi(1)], "CASH", { date: "2026-11-16", adjust: { discount: 8, roundOff: true } });
    if (!("body" in r)) throw new Error(r.err);
    expect(r.body.amountInr).toBe(720);
    expect(r.body.notes).toBe("Discount ₹8");
    const total = (r.body.lines as { amount: number }[]).reduce((a, l) => a + l.amount, 0);
    expect(Math.round(total * 100) / 100).toBe(720);
  });
  it("takes an item-wise discount off that line only", () => {
    const l = { ...karadi(2), disc: 10, discPct: true };
    expect(lineDisc(l)).toBe(52);
    expect(lineAmount(l)).toBe(468);
    expect(lineAmount({ ...karadi(1), disc: 500 })).toBe(0);
    const b = updateLine([karadi(2)], 0, { disc: 20 });
    expect(billTotal(b)).toBe(500);
    expect(updateLine(b, 0, { disc: 0 })[0]).not.toHaveProperty("disc");
    const r = registerBody([karadi(2), { ...karadi(1), disc: 10 }], "CASH", { date: "2026-11-17" });
    if (!("body" in r)) throw new Error(r.err);
    expect(r.body.amountInr).toBe(770);
    expect(r.body.notes).toBe("Item discount ₹10");
  });
  it("splits a bill between cash, UPI and udhaar", () => {
    const lines = [karadi(2)];
    const ok = registerBody(lines, "SPLIT", { date: "2026-11-17", party: "Ramesh", split: { CASH: 200, UPI: 220, CREDIT: 100 } });
    if (!("body" in ok)) throw new Error(ok.err);
    expect(ok.body).toMatchObject({ paymentMode: "CASH", splits: [{ channel: "CASH", amount: 200 }, { channel: "UPI", amount: 220 }, { channel: "CREDIT", amount: 100 }], counterBill: true });
    expect(registerBody(lines, "SPLIT", { date: "2026-11-17", split: { CASH: 200, UPI: 200 } })).toHaveProperty("err");
    expect(registerBody(lines, "SPLIT", { date: "2026-11-17", split: { CASH: 420, CREDIT: 100 } })).toHaveProperty("err");
    const one = registerBody(lines, "SPLIT", { date: "2026-11-17", split: { UPI: 520 } });
    expect("body" in one && one.body).toMatchObject({ paymentMode: "UPI", payChannel: "UPI" });
  });
  it("works out cash to return", () => {
    expect(cashReturn(468, 500)).toBe(32);
    expect(cashReturn(468, 400)).toBe(0);
  });
});
