// Field schemas for the per-desk AI Terminal (plan doc, Version 17): a
// natural-language / speech / photo-scan box that fills a form's fields,
// instead of typing them by hand. Ported to this Next.js rebuild as a
// generic "describe the fields, ask the model for strict JSON" contract
// shared by every desk's terminal.

export type AiFillDesk = "jobwork" | "closing" | "mfg-start";

export interface AiFillFieldSpec {
  key: string;
  label: string;
  type: "string" | "number" | "enum" | "date";
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
};

export function buildFillPrompt(desk: AiFillDesk): string {
  const spec = AI_FILL_SCHEMAS[desk];
  const fieldLines = spec
    .map((f) => {
      const type = f.type === "enum" ? `one of: ${f.enumValues?.join(" | ")}` : f.type;
      return `- "${f.key}" (${type}): ${f.label}`;
    })
    .join("\n");
  return `You are filling a business data-entry form for an edible-oil business in India (job-work crushing / manufacturing / daily cash-and-stock closing). From the user's text and/or an attached photo (a receipt, memo, register page, or handwritten note), extract ONLY the following fields:
${fieldLines}

Rules:
- Return STRICT JSON only — a single flat object with a subset of the keys above. No markdown, no code fences, no explanation, no extra keys.
- Only include a key if you are reasonably confident of its value from the input. Omit keys you cannot determine — never guess or invent a value.
- Numbers must be plain numbers (no currency symbols, no commas, no units).
- Dates must be YYYY-MM-DD. If no date is mentioned, omit the date key (do not assume today).`;
}
