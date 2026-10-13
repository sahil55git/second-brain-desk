import { describe, expect, it } from "vitest";
import { appSheet, buildSheet, normalizeSheetLine } from "../cashSheet";
import { buildChecklist } from "../cashReport";
import { computeSystemCash } from "../calculations";
import { toClosingBuckets, type RegisterEntryLike, type CashEvent } from "../register";

const at = "2026-10-13T06:00:00.000Z";
const e = (kind: string, amountInr: number, paymentMode = "CASH", item: string | null = null) => ({ kind, amountInr, paymentMode, item, createdAt: at, details: null }) as unknown as RegisterEntryLike;

describe("appSheet", () => {
  it("adds up to exactly the app's expected cash", () => {
    const entries = [e("SALE", 860), e("SALE", 4200, "UPI"), e("EXPENSE", 100), e("PURCHASE", 300), e("PAYMENT", 500, "CASH", "salary"), e("PAYMENT", 50), e("UDHAAR_IN", 700), e("OWNER_DRAW", 10900), e("PIGMEE", 200), e("SALE", 90, "CREDIT")];
    const jw: CashEvent[] = [{ at: +new Date(at), amount: 400, bucket: "jwIn" }, { at: +new Date(at), amount: -250, bucket: "jwOut" }];
    const app = appSheet(1000, entries, jw);
    const s = buildSheet(app, {}, {}, { gpay: 4200, phonepe: 0 });
    expect(s.expected).toBe(computeSystemCash(toClosingBuckets(1000, entries, jw)));
    expect(s.appExpected).toBe(s.expected);
    expect(app.SALE).toEqual({ cash: 860, amount: 5150, upi: 4200 });
    expect(app.OWNER_DRAW.cash).toBe(11100);
    expect(app.OTHER_IN.cash).toBe(400);
    expect(app.JOBWORK.cash).toBe(250);
    expect(s.anyTyped).toBe(false);
  });
});

describe("buildSheet with the memo sheet (the 13 Oct numbers)", () => {
  const entries = [e("OWNER_DRAW", 10900)];
  const app = appSheet(0, entries, []);
  const typed = { OPENING: { amountInr: 7036 }, SALE: { amountInr: 29201 }, EXPENSE: { amountInr: 560 }, JOBWORK: { amountInr: 3438 }, SALARY: { amountInr: 200 } };
  const s = buildSheet(app, typed, { gpay: 6438 }, { gpay: 0, phonepe: 0 });
  const row = (l: string) => s.rows.find((r) => r.line === l)!;
  it("Sales shows as Sales: memo total less UPI", () => {
    expect(row("SALE").memo).toBe(29201);
    expect(row("SALE").used).toBe(29201);
    expect(s.upiOut).toBe(6438);
  });
  it("each line sits on its own side and totals add up", () => {
    expect(s.totalIn).toBe(7036 + 29201);
    expect(s.totalOut).toBe(560 + 3438 + 200 + 10900 + 6438);
    expect(s.expected).toBe(14701);
    expect(row("OWNER_DRAW").used).toBe(10900);
  });
  it("a typed owner withdraw REPLACES the app figure (no double count)", () => {
    const s2 = buildSheet(app, { ...typed, OWNER_DRAW: { amountInr: 10900 } }, { gpay: 6438 }, { gpay: 0, phonepe: 0 });
    expect(s2.expected).toBe(14701);
  });
  it("shows what is missing from the app", () => {
    expect(row("SALE").missing).toBe(29201);
    expect(row("OPENING").missing).toBeNull();
    expect(row("PURCHASE").memo).toBeNull();
  });
  it("without typed UPI, the app's UPI sales come off the memo sales", () => {
    const a2 = appSheet(0, [e("SALE", 1000, "UPI")], []);
    const s3 = buildSheet(a2, { SALE: { amountInr: 5000 } }, {}, { gpay: 1000, phonepe: 0 });
    expect(s3.expected).toBe(4000);
    expect(s3.upi.total).toBe(1000);
  });
  it("checklist uses the same sheet", () => {
    const c = buildChecklist({ sheet: s, appUpi: { gpay: 0, phonepe: 0 }, counted: 15020, scaleKept: false, handoverSaved: false });
    const by = Object.fromEntries(c.map((x) => [x.key, x]));
    expect(by.SALE.status).toBe("ok");
    expect(by.OPENING.status).toBe("ok");
    expect(by.OWNER_DRAW.status).toBe("ok");
    expect(by.PURCHASE.status).toBe("none");
    expect(by.UPI.status).toBe("ok");
    expect(by.COUNT.status).toBe("ok");
    expect(by.HANDOVER.status).toBe("miss");
  });
});

describe("normalizeSheetLine", () => {
  it("accepts sheet lines only", () => {
    expect(normalizeSheetLine({ line: "OWNER_DRAW", amountInr: "500" })).toEqual({ line: "OWNER_DRAW", amountInr: 500 });
    expect(normalizeSheetLine({ line: "UPI_GPAY", amountInr: 5 })).toBeNull();
    expect(normalizeSheetLine({ line: "SALE", amountInr: -1 })).toBeNull();
  });
});
