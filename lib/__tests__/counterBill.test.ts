import { describe, expect, it } from "vitest";
import { addLine, billKg, billTotal, changeDue, lineAmount, registerBody, updateLine, type CounterLine } from "../counterBill";

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
});
