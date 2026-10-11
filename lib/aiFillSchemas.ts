// Field schemas for the per-desk AI Terminal (plan doc, Version 17): a
// natural-language / speech / photo-scan box that fills a form's fields,
// instead of typing them by hand. Ported to this Next.js rebuild as a
// generic "describe the fields, ask the model for strict JSON" contract
// shared by every desk's terminal.

import { STOCK_PRODUCTS } from "@/lib/calculations";

export type AiFillDesk = "jobwork" | "closing" | "mfg-start" | "purchase" | "sales" | "expense" | "stock";

export interface AiFillFieldSpec {
  key: string;
  label: string;
  /** "lines" = a list of item rows: name, hsnCode, qty, unit, rateInr, gstRatePct */
  type: "string" | "number" | "enum" | "date" | "lines";
  enumValues?: string[];
}

export const AI_FILL_SCHEMAS: Record<AiFillDesk, AiFillFieldSpec[]> = {
  jobwork: [
    { key: "customer", label: "Customer", type: "string" },
    { key: "vehicleNo", label: "Auto / vehicle no.", type: "string" },
    { key: "seedKg", label: "Seed (kg)", type: "number" },
    { key: "cakeOwnership", label: "Who keeps the cake", type: "enum", enumValues: ["SHOP", "CUSTOMER"] },
    { key: "advanceCustomerInr", label: "Advance to customer (₹)", type: "number" },
    { key: "advanceAutoInr", label: "Advance to auto (₹)", type: "number" },
    { key: "can15", label: "Oil cans taken — 15 kg can (count)", type: "number" },
    { key: "can5new", label: "Oil cans taken — 5 kg new can (count)", type: "number" },
    { key: "can5old", label: "Oil cans taken — 5 kg old can (count)", type: "number" },
    { key: "notes", label: "Notes", type: "string" },
  ],
  closing: [
    { key: "date", label: "Date (YYYY-MM-DD)", type: "date" },
    { key: "session", label: "Session", type: "enum", enumValues: ["AFTERNOON", "NIGHT"] },
    { key: "cashInOpening", label: "Cash in — opening", type: "number" },
    { key: "cashInSales", label: "Cash in — sales", type: "number" },
    { key: "cashInOther", label: "Cash in — other", type: "number" },
    { key: "cashOutGrn", label: "Cash out — job-work (Grn)", type: "number" },
    { key: "cashOutExpenses", label: "Cash out — expenses", type: "number" },
    { key: "cashOutSalary", label: "Cash out — salary", type: "number" },
    { key: "cashOutUpi", label: "Cash out — UPI", type: "number" },
    { key: "cashOutDraw", label: "Cash out — draw", type: "number" },
    { key: "cashOutOther", label: "Cash out — other", type: "number" },
    { key: "counterCashInr", label: "Counter cash (physical count)", type: "number" },
  ],
  "mfg-start": [
    { key: "mill", label: "Mill", type: "string" },
    { key: "barrel", label: "Barrel / batch", type: "string" },
    { key: "productItem", label: "Production item", type: "string" },
    { key: "date", label: "Date (YYYY-MM-DD)", type: "date" },
    { key: "refOilPct", label: "Reference oil yield %", type: "number" },
    { key: "supplier1Name", label: "Supplier 1 name", type: "string" },
    { key: "supplier1SeedKg", label: "Supplier 1 seed (kg)", type: "number" },
    { key: "supplier2Name", label: "Supplier 2 name", type: "string" },
    { key: "supplier2SeedKg", label: "Supplier 2 seed (kg)", type: "number" },
    { key: "step1Kg", label: "Step 1 — crude oil in (kg)", type: "number" },
    { key: "seedQuality", label: "Seed quality", type: "enum", enumValues: ["Low", "Standard", "Best"] },
    { key: "notes", label: "Notes", type: "string" },
  ],
  purchase: [
    { key: "partyName", label: "Supplier (as printed)", type: "string" },
    { key: "gstin", label: "Supplier GSTIN", type: "string" },
    { key: "billNo", label: "Bill / invoice no.", type: "string" },
    { key: "date", label: "Bill date (YYYY-MM-DD)", type: "date" },
    { key: "paymentMode", label: "Payment", type: "enum", enumValues: ["CASH", "UPI", "BANK", "CREDIT", "OTHER"] },
    { key: "lines", label: "Items", type: "lines" },
    { key: "taxableInr", label: "Taxable value on the bill (₹)", type: "number" },
    { key: "gstInr", label: "Total GST on the bill (₹)", type: "number" },
    { key: "billTotalInr", label: "Bill total (₹)", type: "number" },
    { key: "vehicleNo", label: "Vehicle no.", type: "string" },
    { key: "notes", label: "Notes", type: "string" },
  ],
  sales: [
    { key: "partyName", label: "Customer", type: "string" },
    { key: "date", label: "Date (YYYY-MM-DD)", type: "date" },
    { key: "paymentMode", label: "Payment", type: "enum", enumValues: ["CASH", "UPI", "BANK", "CREDIT", "OTHER"] },
    { key: "lines", label: "Items", type: "lines" },
    { key: "notes", label: "Notes", type: "string" },
  ],
  expense: [
    { key: "date", label: "Date (YYYY-MM-DD)", type: "date" },
    {
      key: "category",
      label: "Category",
      type: "enum",
      enumValues: ["Electricity", "Transport / freight", "Salary / wages", "Packing material", "Rent", "Repairs / maintenance", "Fuel", "Misc"],
    },
    { key: "amountInr", label: "Amount (₹)", type: "number" },
    { key: "partyName", label: "Paid to", type: "string" },
    { key: "billNo", label: "Receipt / bill no.", type: "string" },
    { key: "paymentMode", label: "Payment", type: "enum", enumValues: ["CASH", "UPI", "BANK", "CREDIT", "OTHER"] },
    { key: "notes", label: "Notes", type: "string" },
  ],
  stock: STOCK_PRODUCTS.map((p) => ({ key: `stock_${p.key}`, label: `Counted stock — ${p.label} (kg)`, type: "number" as const })),
};

/** Extra guidance per desk, appended to the prompt. */
const DESK_NOTES: Partial<Record<AiFillDesk, string>> = {
  purchase: `This is a SUPPLIER'S PURCHASE BILL (tax invoice) for an edible-oil shop. Put one object in "lines" per item row printed on the bill. "rateInr" is the rate per unit BEFORE GST; if only an amount is printed, rateInr = amount ÷ qty. "qty" in the printed unit (kg, ltr, pcs, tin, bag); convert quintals to kg (1 qtl = 100 kg) and tonnes to kg. Copy the GSTIN exactly as printed — 15 characters. "billTotalInr" is the final amount payable.`,
  sales: `This is a SALE being spoken or typed at the counter. One object in "lines" per product. If the person says "N tins/cans of X kg" and gives a price per kg, use qty = N × X and unit "kg"; if they give a price per tin, use qty = N and unit "tin". Do not invent a rate if none is said.`,
  expense: `This is a shop EXPENSE (receipt, petrol slip, electricity bill, wages note). Pick the closest category. amountInr is the total paid.`,
  stock: `This is a PHYSICAL STOCK COUNT spoken or written product by product (kg). Map each product to its key: sunflower → stock_sf, karadi / safflower tank 1 → stock_karadi1, K2 → stock_k2, groundnut / shenga → stock_groundnut, gold drop → stock_golddrop, soyabean → stock_soyabean, coconut → stock_coconut, tea powder → stock_teapowder, til / sesame / ellu → stock_til, mustard → stock_mustard.`,
};

export function buildFillPrompt(desk: AiFillDesk): string {
  const spec = AI_FILL_SCHEMAS[desk];
  const fieldLines = spec
    .map((f) => {
      const type =
        f.type === "enum"
          ? `one of: ${f.enumValues?.join(" | ")}`
          : f.type === "lines"
            ? `array of objects, each {"name": string, "hsnCode": string, "qty": number, "unit": string, "rateInr": number, "gstRatePct": number} — omit a key you cannot read`
            : f.type;
      return `- "${f.key}" (${type}): ${f.label}`;
    })
    .join("\n");
  const canNote =
    desk === "jobwork"
      ? `\n\nA note on cans: "can15" / "can5new" / "can5old" are HOW MANY cans of that size the customer took away, not a weight. "one 15 kg can" or "15 kg can" means can15 = 1 (a single 15-kilogram-sized can), not seedKg = 15. Only put an actual seed weight into "seedKg".`
      : "";
  const deskNote = DESK_NOTES[desk] ? `\n\n${DESK_NOTES[desk]}` : "";
  return `You are filling a business data-entry form for an edible-oil business in India (purchases, sales, expenses, job-work crushing, manufacturing, daily cash-and-stock closing). From the user's text and/or an attached photo (a bill, receipt, weighing slip, memo, register page, or handwritten note), extract ONLY the following fields:
${fieldLines}
${canNote}${deskNote}

The words may be English, Kannada or Hindi, or a mix, typed or spoken. Numbers may be spoken as words (for example "ಎರಡು ಸಾವಿರ" = 2000, "do sau pachas" = 250, "one fifty six" = 156) — write them as digits. Write names in English letters.

Rules:
- Return STRICT JSON only — a single object with a subset of the keys above ("lines", when present, is the only nested value). No markdown, no code fences, no explanation, no extra keys.
- Only include a key if you are reasonably confident of its value from the input. Omit keys you cannot determine — never guess or invent a value.
- Numbers must be plain numbers (no currency symbols, no commas, no units).
- Dates must be YYYY-MM-DD. If no date is mentioned, omit the date key (do not assume today).`;
}
