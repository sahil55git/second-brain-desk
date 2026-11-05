import { describe, expect, it } from "vitest";
import type { BizData, RegisterRow } from "../bizReports";
import { poProgress, type PurchaseOrderLite } from "../ops";
import { cleanPoInput, itemsFrom, lastRateFor, poAlerts, poMessage, poMoney, poSummary, poTotals, supplierPhones, waLink, waNumber, type PoDoc } from "../po";

const reg = (o: Partial<RegisterRow>): RegisterRow => ({ id: Math.random().toString(36).slice(2), date: "2026-11-01", kind: "PURCHASE", item: null, itemLabel: null, qty: null, unit: null, rateInr: null, amountInr: 0, paymentMode: "CASH", partyName: null, notes: null, createdAt: "2026-11-01T06:00:00.000Z", ...o });
const data = (register: RegisterRow[]): BizData => ({ sales: [], purchases: [], expenses: [], register, jobWork: [], mfg: [], closings: [], items: [] });
const order = (o: Partial<PurchaseOrderLite> = {}): PurchaseOrderLite => ({ id: "1", no: "PO-1", date: "2026-11-01", supplier: "Ravi Traders", dueDate: "2026-11-05", status: "open", lines: [{ item: "Groundnut seed", qty: 1000, unit: "kg", rate: 60 }], ...o });

describe("cleanPoInput", () => {
  const ok = { supplier: " Ravi Traders ", phone: "98765 43210", date: "2026-11-01", dueDate: "2026-11-05", lines: [{ item: "Groundnut seed", qty: "1000", unit: "kg", rate: "60", gst: "5" }, { item: "", qty: 5 }, { item: "Sack", qty: 0 }] };
  it("keeps good lines, trims, and drops empty ones", () => {
    const r = cleanPoInput(ok);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.supplier).toBe("Ravi Traders");
    expect(r.data.lines).toEqual([{ item: "Groundnut seed", qty: 1000, unit: "kg", rate: 60, gst: 5 }]);
    expect(r.data.status).toBe("open");
    expect(r.data.terms).toBeNull();
  });
  it("keeps draft status and the paperwork fields", () => {
    const r = cleanPoInput({ ...ok, status: "draft", terms: " 7 days ", deliverTo: "Godown 2", transport: "their truck" });
    expect(r.ok && r.data).toMatchObject({ status: "draft", terms: "7 days", deliverTo: "Godown 2", transport: "their truck" });
  });
  it("clamps GST and rate", () => {
    const r = cleanPoInput({ ...ok, lines: [{ item: "x", qty: 1, rate: -5, gst: 99 }] });
    expect(r.ok && r.data.lines[0]).toMatchObject({ rate: 0, gst: 28 });
  });
  it("explains what is missing", () => {
    expect(cleanPoInput({ ...ok, supplier: "" })).toEqual({ ok: false, error: "Who is the supplier?" });
    expect(cleanPoInput({ ...ok, lines: [] })).toMatchObject({ ok: false });
    expect(cleanPoInput({ ...ok, date: "01-11-2026" })).toMatchObject({ ok: false });
    expect(cleanPoInput({ ...ok, dueDate: "2026-10-01" })).toMatchObject({ ok: false });
  });
});

describe("totals and message", () => {
  const lines = [{ item: "Groundnut seed", qty: 1000, unit: "kg", rate: 60, gst: 5 }, { item: "Sack", qty: 100, unit: "pcs", rate: 20, gst: 0 }];
  it("groups GST by rate", () => {
    const t = poTotals(lines);
    expect(t.subtotal).toBe(62000);
    expect(t.taxRows).toEqual([{ rate: 5, taxable: 60000, tax: 3000 }]);
    expect(t.total).toBe(65000);
    expect(t.words).toContain("Sixty Five Thousand");
  });
  const doc: PoDoc = { no: "PO-7", rev: 2, date: "2026-11-01", dueDate: "2026-11-05", supplier: "Ravi Traders", phone: null, lines, notes: null, terms: "Pay in 7 days", deliverTo: null, transport: null, status: "open" };
  it("writes the WhatsApp text with the total, terms and link", () => {
    const m = poMessage(doc, { name: "Mahadev Traders", address: "Bidar" }, "https://x.test/po/abc");
    expect(m).toContain("*Purchase order PO-7* (revised, rev 2)");
    expect(m).toContain("• Groundnut seed: 1000 kg @ ₹60 = ₹60,000 (+5% GST)");
    expect(m).toContain("*Total ₹65,000* (incl. GST ₹3,000)");
    expect(m).toContain("Terms: Pay in 7 days");
    expect(m).toContain("https://x.test/po/abc");
    expect(m).toContain("Date: 01-11-2026 · Deliver by 05-11-2026");
  });
  it("builds wa.me links from Indian numbers", () => {
    expect(waNumber("98765 43210")).toBe("919876543210");
    expect(waNumber("+91 98765-43210")).toBe("919876543210");
    expect(waNumber("0476")).toBe("");
    expect(waLink("9876543210", "hi there")).toBe("https://wa.me/919876543210?text=hi%20there");
    expect(waLink(null, "x")).toBe("https://wa.me/?text=x");
  });
});

describe("progress with draft and closed orders", () => {
  const d = data([reg({ partyName: "Ravi Traders", item: "c_groundnut_seed", qty: 400, rateInr: 62, amountInr: 24800, date: "2026-11-03" })]);
  it("a draft collects nothing and is never late", () => {
    const p = poProgress([order({ status: "draft" })], d, "2026-11-20")[0];
    expect(p.status).toBe("draft");
    expect(p.pct).toBe(0);
    expect(p.lateDays).toBe(0);
  });
  it("closed short is closed, not late", () => {
    const p = poProgress([order({ status: "closed" })], d, "2026-11-20")[0];
    expect(p.status).toBe("closed");
    expect(p.pct).toBe(40);
    expect(p.lateDays).toBe(0);
  });
  it("open past its date is late", () => {
    expect(poProgress([order()], d, "2026-11-08")[0]).toMatchObject({ status: "late", lateDays: 3 });
  });
  it("money: ordered, received at billed rate, pending, extra paid", () => {
    const m = poMoney(poProgress([order()], d, "2026-11-04")[0]);
    expect(m).toEqual({ ordered: 60000, received: 24800, pending: 36000, extraPaid: 800 });
  });
});

describe("hints from past purchases", () => {
  const d = data([
    reg({ partyName: "Ravi Traders", item: "c_groundnut_seed", qty: 500, rateInr: 58, amountInr: 29000, date: "2026-10-01" }),
    reg({ partyName: "Ravi Traders", item: "c_groundnut_seed", qty: 500, rateInr: 61, amountInr: 30500, date: "2026-10-20" }),
    reg({ partyName: "Other Co", item: "c_groundnut_seed", qty: 500, rateInr: 50, amountInr: 25000, date: "2026-10-25" }),
  ]);
  it("finds the last rate paid to that supplier only", () => {
    expect(lastRateFor(d, "ravi traders", "Groundnut seed")).toEqual({ rate: 61, date: "2026-10-20" });
    expect(lastRateFor(d, "Ravi Traders", "mustard")).toBeNull();
    expect(lastRateFor(d, "", "Groundnut seed")).toBeNull();
  });
  it("lists what a supplier has sold before", () => {
    expect(itemsFrom(d, "Ravi Traders")).toHaveLength(1);
  });
  it("remembers the latest phone per supplier", () => {
    expect(supplierPhones([{ supplier: "Ravi Traders", phone: "111", date: "2026-10-01" }, { supplier: "ravi  traders", phone: "222", date: "2026-10-09" }, { supplier: "X", phone: null, date: "2026-10-09" }])).toEqual({ "ravi traders": "222" });
  });
});

describe("summary and alerts", () => {
  const d = data([reg({ partyName: "Ravi Traders", item: "c_groundnut_seed", qty: 400, rateInr: 60, amountInr: 24000, date: "2026-11-03" })]);
  const orders = [
    order({ id: "a", no: "PO-1" }), // due 5th, 40% in → late on the 8th
    order({ id: "b", no: "PO-2", supplier: "Kumar", dueDate: "2026-11-09", lines: [{ item: "Mustard seed", qty: 500, unit: "kg", rate: 55 }] }),
    order({ id: "c", no: "PO-3", supplier: "Shah", date: "2026-11-02", status: "draft" }),
  ];
  const prog = poProgress(orders, d, "2026-11-08");
  it("counts open, late, due this week and drafts", () => {
    expect(poSummary(prog, "2026-11-08")).toEqual({ open: 2, late: 1, dueThisWeek: 1, drafts: 1, pendingValue: 36000 + 27500 });
  });
  it("lists late first, then due soon, then stale drafts", () => {
    const a = poAlerts(prog, "2026-11-08", 1);
    expect(a[0]).toContain("PO-1 · Ravi Traders: 3 days late");
    expect(a[0]).toContain("600 kg Groundnut seed");
    expect(a[1]).toContain("PO-2 · Kumar: due 09-11-2026");
    expect(a[2]).toContain("PO-3 · Shah: still a draft");
    expect(poAlerts(prog, "2026-11-08", 0)).toHaveLength(2);
  });
});
