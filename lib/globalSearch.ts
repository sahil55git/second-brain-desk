// Global search across the data already loaded on the main desk — parties,
// sales invoices, items and job-work intakes. Pure and client-safe, so it can
// be unit-tested and needs no extra API call.

import type { ItemDTO, JobWorkIntakeDTO, PartyDTO, SalesInvoiceDTO } from "@/lib/types";

export type SearchDesk = "parties" | "sales" | "inventory" | "jobwork";

export interface SearchHit {
  key: string;
  desk: SearchDesk;
  kind: "Party" | "Bill" | "Item" | "Job-work";
  title: string;
  subtitle: string;
  details: string[];
}

export interface SearchData {
  parties: PartyDTO[];
  sales: SalesInvoiceDTO[];
  items: ItemDTO[];
  jobWork: JobWorkIntakeDTO[];
}

/** Every whitespace-separated token must appear in at least one field. */
export function matchesQuery(query: string, fields: (string | number | null | undefined)[]): boolean {
  const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return false;
  const haystack = fields
    .filter((f): f is string | number => f !== null && f !== undefined && f !== "")
    .map((f) => String(f).toLowerCase());
  return tokens.every((t) => haystack.some((h) => h.includes(t)));
}

export function formatInr(n: number): string {
  return "₹" + Math.round(n).toLocaleString("en-IN");
}

export function searchAll(query: string, data: SearchData, perKind = 5): SearchHit[] {
  const q = query.trim();
  if (!q) return [];
  const partyName = new Map(data.parties.map((p) => [p.id, p.name]));
  const hits: SearchHit[] = [];

  data.parties
    .filter((p) => p.active && matchesQuery(q, [p.name, p.phone, p.gstin, p.email]))
    .slice(0, perKind)
    .forEach((p) =>
      hits.push({
        key: `party-${p.id}`,
        desk: "parties",
        kind: "Party",
        title: p.name,
        subtitle: [p.phone, p.gstin ? `GSTIN ${p.gstin}` : null].filter(Boolean).join(" · ") || "No phone or GSTIN",
        details: [
          `Type: ${p.type.toLowerCase()}`,
          p.state ? `State: ${p.state}` : "",
          p.openingBalanceInr ? `Opening balance: ${formatInr(p.openingBalanceInr)}` : "",
        ].filter(Boolean),
      })
    );

  data.sales
    .filter((s) => matchesQuery(q, [s.invoiceNo, partyName.get(s.partyId), s.totalInr, s.date.slice(0, 10)]))
    .slice(0, perKind)
    .forEach((s) =>
      hits.push({
        key: `bill-${s.id}`,
        desk: "sales",
        kind: "Bill",
        title: `#${s.invoiceNo} · ${partyName.get(s.partyId) ?? "Walk-in"}`,
        subtitle: `${formatInr(s.totalInr)} · ${s.paymentMode.toLowerCase()}`,
        details: [
          `Date: ${s.date.slice(0, 10)}`,
          `Subtotal ${formatInr(s.subtotalInr)} · GST ${formatInr(s.cgstInr + s.sgstInr + s.igstInr)}`,
        ],
      })
    );

  data.items
    .filter((i) => i.active && matchesQuery(q, [i.name, i.sku, i.barcode, i.hsnCode]))
    .slice(0, perKind)
    .forEach((i) =>
      hits.push({
        key: `item-${i.id}`,
        desk: "inventory",
        kind: "Item",
        title: i.name,
        subtitle: [i.sku, i.barcode].filter(Boolean).join(" · ") || `Unit: ${i.unit}`,
        details: [
          `Unit: ${i.unit}`,
          i.gstRatePct !== null ? `GST ${i.gstRatePct}%` : "",
          i.reorderLevelQty !== null ? `Reorder at ${i.reorderLevelQty} ${i.unit}` : "",
        ].filter(Boolean),
      })
    );

  data.jobWork
    .filter((j) => matchesQuery(q, [j.customer, j.vehicleNo]))
    .slice(0, perKind)
    .forEach((j) =>
      hits.push({
        key: `jw-${j.id}`,
        desk: "jobwork",
        kind: "Job-work",
        title: j.customer,
        subtitle: `${j.seedKg} kg${j.vehicleNo ? ` · ${j.vehicleNo}` : ""}`,
        details: [j.settled ? "Settled" : "Open", j.notes ? `Note: ${j.notes}` : ""].filter(Boolean),
      })
    );

  return hits;
}
