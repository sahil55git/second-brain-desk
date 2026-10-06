// Bulk import / export of master lists (parties, register items, stock items)
// through one Excel workbook. Pure and tested: the same functions run in the
// browser (preview) and on the server (the authoritative import).
//
// The template, the export and the import all share one column format, so an
// exported workbook can be edited and imported straight back.
import { learnItem, rateKey, type RegisterConfigData, type RegisterKind } from "./register";
import type { ExportTable } from "./exporters";

export type ImportKind = "parties" | "registerItems" | "stockItems";
export type Table = unknown[][];
export interface ImportIssue {
  row: number; // 1-based sheet row (header is row 1)
  level: "error" | "warn";
  message: string;
}

export const SHEET_NAMES: Record<ImportKind, string> = {
  parties: "Parties",
  registerItems: "Register items",
  stockItems: "Stock items",
};

export const COLS = {
  parties: ["Name", "Type", "Phone", "Email", "GSTIN", "Address", "State", "Opening balance", "Notes"],
  registerItems: ["Where", "Item name", "Rate", "Unit"],
  stockItems: ["Name", "Unit", "SKU", "HSN code", "GST %", "Opening stock", "Reorder level", "Notes"],
} as const;

// ---------------------------------------------------------------------------
// Cell helpers
// ---------------------------------------------------------------------------
const norm = (h: unknown) => String(h ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
const str = (v: unknown) => (v === null || v === undefined ? "" : String(v)).replace(/\s+/g, " ").trim();
function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const n = Number(String(v).replace(/[₹,\s]/g, ""));
  return Number.isFinite(n) ? n : null;
}

const ALIASES: Record<string, string[]> = {
  name: ["name", "partyname", "party", "customername", "customer", "suppliername", "supplier", "itemname", "item", "product", "productname"],
  type: ["type", "partytype", "customersupplier", "category"],
  phone: ["phone", "mobile", "phoneno", "mobileno", "contact", "contactno", "phonenumber", "mobilenumber"],
  email: ["email", "emailid", "mail"],
  gstin: ["gstin", "gst", "gstno", "gstnumber"],
  address: ["address", "city", "location", "place"],
  state: ["state"],
  opening: ["openingbalance", "opening", "balance", "openingbalanceinr", "openingbal"],
  notes: ["notes", "note", "remarks", "remark"],
  where: ["where", "kind", "section", "usedin", "for", "list"],
  rate: ["rate", "rateinr", "price", "rateperunit"],
  unit: ["unit", "uom"],
  sku: ["sku", "code", "itemcode"],
  hsn: ["hsncode", "hsn", "hsnsac"],
  gstPct: ["gst", "gstpct", "gstrate", "gstrateinr", "gst"],
  openingStock: ["openingstock", "openingqty", "openingstockqty", "stock", "qty", "quantity"],
  reorder: ["reorderlevel", "reorder", "minstock", "reorderqty"],
};

/** Finds each wanted field's column in the header row (tolerant of spelling/spacing). */
function columns(header: unknown[], want: string[], exact: Record<string, string> = {}): Record<string, number> {
  const out: Record<string, number> = {};
  const h = header.map(norm);
  for (const w of want) {
    const names = [exact[w], ...(ALIASES[w] || [w])].filter(Boolean).map(norm);
    const i = h.findIndex((x) => x && names.includes(x));
    if (i >= 0) out[w] = i;
  }
  return out;
}

function bodyRows(table: Table): { header: unknown[]; rows: { n: number; cells: unknown[] }[] } | null {
  if (!Array.isArray(table) || table.length < 1) return null;
  const header = table[0] as unknown[];
  const rows = table
    .slice(1)
    .map((cells, i) => ({ n: i + 2, cells: cells as unknown[] }))
    .filter((r) => Array.isArray(r.cells) && r.cells.some((c) => str(c) !== ""));
  return { header, rows };
}

const MAX_ROWS = 2000;

// ---------------------------------------------------------------------------
// Parties (customers / suppliers)
// ---------------------------------------------------------------------------
export interface PartyRow {
  name: string;
  type: "CUSTOMER" | "SUPPLIER" | "BOTH";
  phone: string | null;
  email: string | null;
  gstin: string | null;
  address: string | null;
  state: string | null;
  openingBalanceInr: number;
  notes: string | null;
}
const GSTIN_RE = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

export function partyType(v: unknown): PartyRow["type"] {
  const t = str(v).toLowerCase();
  if (/both/.test(t) || (/cust|buyer/.test(t) && /supp|vend/.test(t))) return "BOTH";
  if (/supp|vend|seller|purchase|farmer|mill/.test(t)) return "SUPPLIER";
  return "CUSTOMER";
}

export function parseParties(table: Table): { rows: PartyRow[]; issues: ImportIssue[] } {
  const issues: ImportIssue[] = [];
  const b = bodyRows(table);
  if (!b) return { rows: [], issues: [{ row: 1, level: "error", message: "The sheet is empty." }] };
  const c = columns(b.header, ["name", "type", "phone", "email", "gstin", "address", "state", "opening", "notes"], { name: "Name" });
  if (c.name === undefined) return { rows: [], issues: [{ row: 1, level: "error", message: "No “Name” column found in the first row." }] };
  const rows: PartyRow[] = [];
  for (const r of b.rows.slice(0, MAX_ROWS)) {
    const get = (k: string) => (c[k] === undefined ? "" : str(r.cells[c[k]]));
    const name = get("name");
    if (!name) {
      issues.push({ row: r.n, level: "error", message: "Name is empty — row skipped." });
      continue;
    }
    let gstin: string | null = get("gstin").toUpperCase().replace(/\s/g, "") || null;
    if (gstin && !GSTIN_RE.test(gstin)) {
      issues.push({ row: r.n, level: "warn", message: `GSTIN “${gstin}” looks wrong — imported without it.` });
      gstin = null;
    }
    const phoneDigits = get("phone").replace(/[^\d+]/g, "");
    const opening = c.opening === undefined ? 0 : num(r.cells[c.opening]);
    if (c.opening !== undefined && str(r.cells[c.opening]) !== "" && opening === null) {
      issues.push({ row: r.n, level: "warn", message: "Opening balance is not a number — treated as 0." });
    }
    rows.push({
      name: name.slice(0, 120),
      type: partyType(get("type")),
      phone: phoneDigits ? phoneDigits.slice(0, 20) : null,
      email: get("email").slice(0, 120) || null,
      gstin,
      address: get("address").slice(0, 300) || null,
      state: get("state").slice(0, 60) || null,
      openingBalanceInr: opening ?? 0,
      notes: get("notes").slice(0, 500) || null,
    });
  }
  if (b.rows.length > MAX_ROWS) issues.push({ row: MAX_ROWS + 2, level: "warn", message: `Only the first ${MAX_ROWS} rows are imported — split the file.` });
  return { rows, issues };
}

const key = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

/** Which rows are new and which already exist (by name, ignoring case). */
export function planParties(rows: PartyRow[], existingNames: string[]) {
  const seen = new Set(existingNames.map(key));
  const add: PartyRow[] = [];
  const skipped: string[] = [];
  for (const r of rows) {
    const k = key(r.name);
    if (seen.has(k)) skipped.push(r.name);
    else {
      seen.add(k);
      add.push(r);
    }
  }
  return { add, skipped };
}

// ---------------------------------------------------------------------------
// Quick Register item library (+ saved rates)
// ---------------------------------------------------------------------------
export interface RegisterItemRow {
  kind: RegisterKind;
  label: string;
  rate: number | null;
  unit: string;
}
export function registerKind(v: unknown): RegisterKind | null {
  const t = str(v).toLowerCase();
  if (!t) return null;
  if (/fresh|crush|gana|ghani/.test(t)) return "FRESH_CRUSH";
  if (/sale|sell|sold/.test(t)) return "SALE";
  if (/purch|buy|khareed/.test(t)) return "PURCHASE";
  if (/exp|kharch/.test(t)) return "EXPENSE";
  if (/pay|salary|supplier/.test(t)) return "PAYMENT";
  return null;
}
export function normUnit(v: unknown): string {
  const t = str(v).toLowerCase();
  if (/^(l|ltr|lt|litre|liter|litres|liters)$/.test(t)) return "ltr";
  if (/^(bag|bags)$/.test(t)) return "bags";
  if (/^(pc|pcs|piece|pieces|nos)$/.test(t)) return "pcs";
  if (/^(box|boxes)$/.test(t)) return "box";
  return "kg";
}

export function parseRegisterItems(table: Table): { rows: RegisterItemRow[]; issues: ImportIssue[] } {
  const issues: ImportIssue[] = [];
  const b = bodyRows(table);
  if (!b) return { rows: [], issues: [{ row: 1, level: "error", message: "The sheet is empty." }] };
  const c = columns(b.header, ["where", "name", "rate", "unit"], { name: "Item name", where: "Where" });
  if (c.name === undefined || c.where === undefined) {
    return { rows: [], issues: [{ row: 1, level: "error", message: "Needs “Where” and “Item name” columns in the first row." }] };
  }
  const rows: RegisterItemRow[] = [];
  for (const r of b.rows.slice(0, MAX_ROWS)) {
    const label = str(r.cells[c.name]).slice(0, 80);
    const kind = registerKind(r.cells[c.where]);
    if (!label) {
      issues.push({ row: r.n, level: "error", message: "Item name is empty — row skipped." });
      continue;
    }
    if (!kind) {
      issues.push({ row: r.n, level: "error", message: `“Where” must be Sale, Fresh crush, Purchase, Expense or Payment (got “${str(r.cells[c.where])}”).` });
      continue;
    }
    const rate = c.rate === undefined ? null : num(r.cells[c.rate]);
    if (c.rate !== undefined && str(r.cells[c.rate]) !== "" && (rate === null || rate < 0)) {
      issues.push({ row: r.n, level: "warn", message: "Rate is not a number — imported without a rate." });
    }
    rows.push({ kind, label, rate: rate !== null && rate > 0 ? rate : null, unit: normUnit(c.unit === undefined ? "" : r.cells[c.unit]) });
  }
  return { rows, issues };
}

/** Adds the items to the register library and saves any rates. */
export function applyRegisterItems(cfg: RegisterConfigData, rows: RegisterItemRow[]) {
  let next = cfg;
  let added = 0;
  let rated = 0;
  let existing = 0;
  for (const r of rows) {
    const before = (next.customItems[r.kind] || []).length;
    const learned = learnItem(next, r.kind, r.label);
    next = learned.cfg;
    if ((next.customItems[r.kind] || []).length > before) added++;
    else existing++;
    if (r.rate) {
      const k = r.kind === "FRESH_CRUSH" ? rateKey(r.kind, `${learned.key}:${r.unit === "ltr" ? "ltr" : "kg"}`) : rateKey(r.kind, learned.key);
      next = { ...next, rates: { ...next.rates, [k]: r.rate } };
      rated++;
    }
  }
  return { cfg: next, added, rated, existing };
}

// ---------------------------------------------------------------------------
// Stock items (the Items master used by invoices and stock reports)
// ---------------------------------------------------------------------------
export interface StockItemRow {
  name: string;
  unit: string;
  sku: string | null;
  hsnCode: string | null;
  gstRatePct: number | null;
  openingStockQty: number;
  reorderLevelQty: number | null;
  notes: string | null;
}
export function parseStockItems(table: Table): { rows: StockItemRow[]; issues: ImportIssue[] } {
  const issues: ImportIssue[] = [];
  const b = bodyRows(table);
  if (!b) return { rows: [], issues: [{ row: 1, level: "error", message: "The sheet is empty." }] };
  const c = columns(b.header, ["name", "unit", "sku", "hsn", "gstPct", "openingStock", "reorder", "notes"], { name: "Name", gstPct: "GST %" });
  if (c.name === undefined) return { rows: [], issues: [{ row: 1, level: "error", message: "No “Name” column found in the first row." }] };
  const rows: StockItemRow[] = [];
  const skus = new Set<string>();
  for (const r of b.rows.slice(0, MAX_ROWS)) {
    const get = (k: string) => (c[k] === undefined ? "" : str(r.cells[c[k]]));
    const name = get("name").slice(0, 120);
    if (!name) {
      issues.push({ row: r.n, level: "error", message: "Name is empty — row skipped." });
      continue;
    }
    let sku: string | null = get("sku").slice(0, 40) || null;
    if (sku) {
      if (skus.has(sku.toLowerCase())) {
        issues.push({ row: r.n, level: "warn", message: `SKU “${sku}” repeats in the file — imported without it.` });
        sku = null;
      } else skus.add(sku.toLowerCase());
    }
    const gst = c.gstPct === undefined ? null : num(r.cells[c.gstPct]);
    const open = c.openingStock === undefined ? 0 : num(r.cells[c.openingStock]);
    const reorder = c.reorder === undefined ? null : num(r.cells[c.reorder]);
    rows.push({
      name,
      unit: get("unit") ? normUnit(get("unit")) : "kg",
      sku,
      hsnCode: get("hsn").slice(0, 20) || null,
      gstRatePct: gst !== null && gst >= 0 && gst <= 100 ? gst : null,
      openingStockQty: open !== null && open >= 0 ? open : 0,
      reorderLevelQty: reorder !== null && reorder >= 0 ? reorder : null,
      notes: get("notes").slice(0, 500) || null,
    });
  }
  return { rows, issues };
}

export function planStockItems(rows: StockItemRow[], existing: { name: string; sku?: string | null }[]) {
  const names = new Set(existing.map((e) => key(e.name)));
  const skus = new Set(existing.map((e) => (e.sku || "").toLowerCase()).filter(Boolean));
  const add: StockItemRow[] = [];
  const skipped: string[] = [];
  for (const r of rows) {
    const k = key(r.name);
    if (names.has(k)) {
      skipped.push(r.name);
      continue;
    }
    names.add(k);
    // A SKU already used elsewhere must stay unique in the database.
    const sku = r.sku && skus.has(r.sku.toLowerCase()) ? null : r.sku;
    if (sku) skus.add(sku.toLowerCase());
    add.push({ ...r, sku });
  }
  return { add, skipped };
}

// ---------------------------------------------------------------------------
// Workbook tables: template, instructions and live-data export share one format
// ---------------------------------------------------------------------------
const mk = (cols: readonly string[], rows: Record<string, unknown>[], title: string): ExportTable => ({
  title,
  cols: cols.map((label) => ({ key: label, label })),
  rows,
});

const INSTRUCTIONS = [
  "HOW TO USE THIS WORKBOOK (Mahadev Traders — Settings → Import / Export)",
  "1. Fill the sheets you need and leave the others as they are. Keep the first row (headings) unchanged.",
  "2. Parties: one row per customer or supplier. Type = Customer, Supplier or Both. Opening balance: + means they owe you.",
  "3. Register items: Where = Sale, Fresh crush, Purchase, Expense or Payment. Rate is optional and becomes the saved rate; Unit = kg or ltr (fresh crush is rated per unit).",
  "4. Stock items: the item master used for invoices and stock. Unit = kg, ltr, bags, pcs or box.",
  "5. Names that already exist are skipped (never overwritten, never duplicated). You see a preview before anything is saved.",
  "6. CSV also works for a single list: choose which list it is, then pick the file.",
];

export function templateTables(): ExportTable[] {
  return [
    mk(["Instructions"], INSTRUCTIONS.map((t) => ({ Instructions: t })), "Instructions"),
    mk(
      COLS.parties,
      [
        { Name: "Example Traders", Type: "Customer", Phone: "9876543210", Email: "", GSTIN: "", Address: "Latur", State: "Maharashtra", "Opening balance": 0, Notes: "delete this example row" },
        { Name: "Example Seeds Supplier", Type: "Supplier", Phone: "", Email: "", GSTIN: "", Address: "", State: "Karnataka", "Opening balance": 0, Notes: "" },
      ],
      SHEET_NAMES.parties
    ),
    mk(
      COLS.registerItems,
      [
        { Where: "Sale", "Item name": "Mustard oil", Rate: 180, Unit: "kg" },
        { Where: "Purchase", "Item name": "Safflower seed", Rate: 62, Unit: "kg" },
        { Where: "Expense", "Item name": "Packing tape", Rate: "", Unit: "" },
      ],
      SHEET_NAMES.registerItems
    ),
    mk(
      COLS.stockItems,
      [{ Name: "Mustard oil", Unit: "kg", SKU: "MUS-OIL", "HSN code": "1514", "GST %": 5, "Opening stock": 0, "Reorder level": 50, Notes: "" }],
      SHEET_NAMES.stockItems
    ),
  ];
}

export function exportTables(data: {
  parties: { name: string; type: string; phone?: string | null; email?: string | null; gstin?: string | null; address?: string | null; state?: string | null; openingBalanceInr?: number | null; notes?: string | null }[];
  items: { name: string; unit: string; sku?: string | null; hsnCode?: string | null; gstRatePct?: number | null; openingStockQty?: number | null; reorderLevelQty?: number | null; notes?: string | null }[];
  config: RegisterConfigData;
  builtinLabel: (kind: RegisterKind, key: string) => string;
}): ExportTable[] {
  const titleCase = (t: string) => t.charAt(0) + t.slice(1).toLowerCase();
  const kindLabel: Partial<Record<RegisterKind, string>> = { SALE: "Sale", FRESH_CRUSH: "Fresh crush", PURCHASE: "Purchase", EXPENSE: "Expense", PAYMENT: "Payment" };
  const regRows: Record<string, unknown>[] = [];
  const seen = new Set<string>();
  for (const [k, list] of Object.entries(data.config.customItems)) {
    for (const it of list || []) {
      const kind = k as RegisterKind;
      const id = `${kind}:${it.key}`;
      seen.add(id);
      const rateKeyFresh = kind === "FRESH_CRUSH" ? data.config.rates[`${kind}:${it.key}:kg`] ?? data.config.rates[`${kind}:${it.key}:ltr`] : data.config.rates[id];
      regRows.push({ Where: kindLabel[kind] || kind, "Item name": it.label, Rate: rateKeyFresh ?? "", Unit: kind === "FRESH_CRUSH" && data.config.rates[`${kind}:${it.key}:ltr`] && !data.config.rates[`${kind}:${it.key}:kg`] ? "ltr" : "kg" });
    }
  }
  // Built-in items that have a saved rate are listed too, so rates are exported.
  for (const [rk, rate] of Object.entries(data.config.rates)) {
    const [kind, item, unit] = rk.split(":");
    if (!kindLabel[kind as RegisterKind] || seen.has(`${kind}:${item}`)) continue;
    if ((data.config.customItems[kind as RegisterKind] || []).some((c) => c.key === item)) continue;
    const label = data.builtinLabel(kind as RegisterKind, item);
    if (!label) continue;
    regRows.push({ Where: kindLabel[kind as RegisterKind], "Item name": label, Rate: rate, Unit: unit || "kg" });
  }
  return [
    mk(
      COLS.parties,
      data.parties.map((p) => ({ Name: p.name, Type: titleCase(p.type), Phone: p.phone ?? "", Email: p.email ?? "", GSTIN: p.gstin ?? "", Address: p.address ?? "", State: p.state ?? "", "Opening balance": p.openingBalanceInr ?? 0, Notes: p.notes ?? "" })),
      SHEET_NAMES.parties
    ),
    mk(COLS.registerItems, regRows, SHEET_NAMES.registerItems),
    mk(
      COLS.stockItems,
      data.items.map((i) => ({ Name: i.name, Unit: i.unit, SKU: i.sku ?? "", "HSN code": i.hsnCode ?? "", "GST %": i.gstRatePct ?? "", "Opening stock": i.openingStockQty ?? 0, "Reorder level": i.reorderLevelQty ?? "", Notes: i.notes ?? "" })),
      SHEET_NAMES.stockItems
    ),
  ];
}

/** Works out which list a workbook sheet is, from its name or its headings. */
export function detectKind(sheetName: string, header: unknown[]): ImportKind | null {
  const n = norm(sheetName);
  if (/part|custom|supplier|name/.test(n) && !/item/.test(n)) return "parties";
  if (/registeritem|register/.test(n)) return "registerItems";
  if (/stock|item|product/.test(n)) return "stockItems";
  const h = header.map(norm);
  if (h.includes("where")) return "registerItems";
  if (h.includes("gstin") || h.includes("openingbalance") || h.includes("phone")) return "parties";
  if (h.includes("hsncode") || h.includes("sku")) return "stockItems";
  return null;
}
