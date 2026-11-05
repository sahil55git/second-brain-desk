import * as React from "react";
import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import PoDocument from "../../components/po/PoDocument";
import type { PoDoc, ShopInfo } from "../po";

// vitest compiles the component with the classic JSX runtime (Next uses the automatic one)
Object.assign(globalThis, { React });

const doc: PoDoc = { no: "PO-7", rev: 2, date: "2026-11-01", dueDate: "2026-11-05", supplier: "Ravi Traders", phone: null, lines: [{ item: "Groundnut seed", qty: 1000, unit: "kg", rate: 60, gst: 5 }], notes: "Match the sample", terms: "Pay in 7 days", deliverTo: "Godown 2", transport: "Their truck", status: "open" };
const render = (po: PoDoc, shop: ShopInfo) => renderToStaticMarkup(createElement(PoDocument, { po, shop }));

describe("PoDocument", () => {
  it("prints the shop, supplier, lines, GST, total in words, terms and revision", () => {
    const h = render(doc, { name: "Mahadev Traders", gstin: "29ABCDE1234F1Z5", address: "Bidar" });
    expect(h).toContain("Mahadev Traders");
    expect(h).toContain("GSTIN: 29ABCDE1234F1Z5");
    expect(h).toContain("PO-7");
    expect(h).toContain("REV 2");
    expect(h).toContain("Deliver by: <b>05-11-2026</b>");
    expect(h).toContain("Groundnut seed");
    expect(h).toContain("GST 5% on ₹60,000.00");
    expect(h).toContain("₹63,000.00");
    expect(h).toContain("Sixty Three Thousand");
    expect(h).toContain("Pay in 7 days");
    expect(h).toContain("Godown 2");
    expect(h).not.toContain("po-stamp");
  });
  it("stamps cancelled and draft orders and hides the GST column when there is none", () => {
    const h = render({ ...doc, status: "cancelled", rev: 1, lines: [{ ...doc.lines[0], gst: 0 }] }, { name: "Mahadev Traders" });
    expect(h).toContain("CANCELLED");
    expect(h).not.toContain("REV");
    expect(h).not.toContain(">GST</th>");
    expect(render({ ...doc, status: "draft" }, { name: "X" })).toContain("DRAFT");
  });
});
