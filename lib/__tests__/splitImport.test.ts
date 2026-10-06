import { describe, expect, it } from "vitest";
import {
  applyRegisterItems,
  detectKind,
  exportTables,
  parseParties,
  parseRegisterItems,
  parseStockItems,
  planParties,
  planStockItems,
  templateTables,
} from "../bulkImport";
import { DEFAULT_CONFIG, channelToMode, dayTotals, entryChannel, normalizeSplit, splitInfo } from "../register";
import { cashReport, type BizData } from "../bizReports";

describe("split payment", () => {
  it("accepts parts that add up and drops zero parts", () => {
    const r = normalizeSplit(1000, [
      { channel: "CASH", amount: 400 },
      { channel: "UPI", amount: 0 },
      { channel: "OWNER_PHONEPE", amount: 600 },
    ]);
    expect(r).toEqual({ ok: true, parts: [{ channel: "CASH", amount: 400 }, { channel: "OWNER_PHONEPE", amount: 600 }] });
  });
  it("rejects wrong total, repeated channel and unknown channel", () => {
    expect(normalizeSplit(1000, [{ channel: "CASH", amount: 400 }, { channel: "UPI", amount: 500 }]).ok).toBe(false);
    expect(normalizeSplit(1000, [{ channel: "CASH", amount: 500 }, { channel: "CASH", amount: 500 }]).ok).toBe(false);
    expect(normalizeSplit(1000, [{ channel: "BARTER", amount: 1000 }]).ok).toBe(false);
    expect(normalizeSplit(1000, "x").ok).toBe(false);
  });
  it("tolerates paise rounding", () => {
    expect(normalizeSplit(100.1, [{ channel: "CASH", amount: 33.37 }, { channel: "UPI", amount: 66.73 }]).ok).toBe(true);
  });
  it("owner PhonePe is its own bucket — not counter cash, not shop UPI", () => {
    expect(channelToMode("OWNER_PHONEPE")).toBe("OTHER");
    const now = new Date().toISOString();
    const entries = [
      { kind: "SALE" as const, amountInr: 400, paymentMode: "CASH" as const, createdAt: now, details: { split: { id: "a", i: 1, n: 3 } } },
      { kind: "SALE" as const, amountInr: 300, paymentMode: "UPI" as const, createdAt: now, details: { split: { id: "a", i: 2, n: 3 } } },
      { kind: "SALE" as const, amountInr: 200, paymentMode: "OTHER" as const, createdAt: now, details: { split: { id: "a", i: 3, n: 3 }, channel: "OWNER_PHONEPE" } },
    ];
    const t = dayTotals(entries);
    expect(t.cashIn).toBe(400);
    expect(t.upiIn).toBe(300);
    expect(t.ownerPhonePeIn).toBe(200);
    expect(entryChannel(entries[2])).toBe("OWNER_PHONEPE");
    expect(splitInfo(entries[2].details)).toEqual({ id: "a", i: 3, n: 3 });
    const d = { register: entries.map((e, i) => ({ ...e, id: String(i), date: "2026-10-06", item: null, itemLabel: null, qty: null, unit: null, rateInr: null, partyName: null, notes: null })), closings: [] } as unknown as BizData;
    const c = cashReport(d, { from: "2026-10-06", to: "2026-10-06" });
    expect(c.cashIn).toBe(400);
    expect(c.upiIn).toBe(300);
    expect(c.ownerPhonePe).toBe(200);
  });
});

describe("bulk import — parties", () => {
  const table = [
    ["Name", "Type", "Phone", "GSTIN", "Opening balance"],
    ["Ravi Stores", "customer", "98765 43210", "", "1,500"],
    ["Seeds Supplier", "Supplier", "", "29ABCDE1234F1Z5", ""],
    ["Bad Gst", "both", "", "123", ""],
    ["", "customer", "", "", ""],
    ["ravi stores", "customer", "", "", ""],
  ];
  it("parses, normalises and reports row problems", () => {
    const { rows, issues } = parseParties(table);
    expect(rows.map((r) => r.name)).toEqual(["Ravi Stores", "Seeds Supplier", "Bad Gst", "ravi stores"]);
    expect(rows[0]).toMatchObject({ type: "CUSTOMER", phone: "9876543210", openingBalanceInr: 1500 });
    expect(rows[1]).toMatchObject({ type: "SUPPLIER", gstin: "29ABCDE1234F1Z5" });
    expect(rows[2]).toMatchObject({ type: "BOTH", gstin: null });
    expect(issues.some((i) => i.row === 4 && i.level === "warn")).toBe(true);
    expect(issues.some((i) => i.row === 5 && i.level === "error")).toBe(true);
  });
  it("skips names that already exist, ignoring case, and repeats in the file", () => {
    const { rows } = parseParties(table);
    const plan = planParties(rows, ["Seeds supplier"]);
    expect(plan.add.map((r) => r.name)).toEqual(["Ravi Stores", "Bad Gst"]);
    expect(plan.skipped).toEqual(["Seeds Supplier", "ravi stores"]);
  });
  it("needs a Name column", () => {
    expect(parseParties([["Foo"], ["x"]]).issues[0].level).toBe("error");
    expect(parseParties([]).rows).toEqual([]);
  });
});

describe("bulk import — register items", () => {
  it("adds items to the library and saves rates per kind/unit", () => {
    const { rows, issues } = parseRegisterItems([
      ["Where", "Item name", "Rate", "Unit"],
      ["Sale", "Mustard oil", 180, "kg"],
      ["Fresh crush", "Sesame", "300", "litre"],
      ["Sale", "Sunflower", 150, "kg"], // already a built-in item
      ["Nowhere", "x", "", ""],
    ]);
    expect(rows).toHaveLength(3);
    expect(issues).toHaveLength(1);
    const r = applyRegisterItems(DEFAULT_CONFIG, rows);
    expect(r.added).toBe(2);
    expect(r.existing).toBe(1);
    expect(r.cfg.customItems.SALE?.map((c) => c.label)).toEqual(["Mustard oil"]);
    expect(r.cfg.rates["SALE:sunflower"]).toBe(150);
    expect(r.cfg.rates["FRESH_CRUSH:c_sesame:ltr"]).toBe(300);
    // importing the same sheet again changes nothing
    const again = applyRegisterItems(r.cfg, rows);
    expect(again.added).toBe(0);
    expect(again.cfg.customItems).toEqual(r.cfg.customItems);
  });
});

describe("bulk import — stock items & workbook format", () => {
  it("parses stock items and keeps SKUs unique", () => {
    const { rows } = parseStockItems([
      ["Name", "Unit", "SKU", "HSN code", "GST %", "Opening stock"],
      ["Mustard oil", "ltr", "MO1", "1514", 5, 10],
      ["Mustard oil 2", "", "mo1", "", 500, ""],
    ]);
    expect(rows[0]).toMatchObject({ unit: "ltr", sku: "MO1", gstRatePct: 5, openingStockQty: 10 });
    expect(rows[1]).toMatchObject({ sku: null, gstRatePct: null, unit: "kg" });
    const plan = planStockItems(rows, [{ name: "mustard OIL" }]);
    expect(plan.add.map((r) => r.name)).toEqual(["Mustard oil 2"]);
  });
  it("template and export use exactly the headings the importer reads", () => {
    for (const t of templateTables()) {
      if (t.title === "Instructions") continue;
      const header = t.cols.map((c) => c.label);
      const table = [header, ...t.rows.map((r) => header.map((h) => r[h] ?? ""))];
      const kind = detectKind(t.title, header)!;
      expect(kind).toBeTruthy();
      const parsed = kind === "parties" ? parseParties(table) : kind === "registerItems" ? parseRegisterItems(table) : parseStockItems(table);
      expect(parsed.rows.length).toBe(t.rows.length);
      expect(parsed.issues.filter((i) => i.level === "error")).toEqual([]);
    }
    const ex = exportTables({
      parties: [{ name: "A", type: "SUPPLIER", openingBalanceInr: 5 }],
      items: [{ name: "I", unit: "kg" }],
      config: { ...DEFAULT_CONFIG, customItems: { SALE: [{ key: "c_x", label: "X" }] }, rates: { "SALE:c_x": 9, "SALE:sunflower": 140 } },
      builtinLabel: (_k, key) => (key === "sunflower" ? "Sunflower" : ""),
    });
    const reg = ex.find((t) => t.title === "Register items")!;
    expect(reg.rows.map((r) => r["Item name"])).toEqual(["X", "Sunflower"]);
    expect(detectKind("Instructions", ["Instructions"])).toBeNull();
    expect(detectKind("Sheet1", ["Where", "Item name"])).toBe("registerItems");
  });
});
