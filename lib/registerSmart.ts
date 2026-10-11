// Quick Register — smart-entry helpers (pure; no React, no Prisma).
//
//  * mapRegisterFill   — turns what the AI read from words / a photo into a pre-filled
//                        entry form. The form opens for the person to check; nothing is saved.
//  * matchCatalogItem  — "sunflower oil" / "ಸೂರ್ಯಕಾಂತಿ" → the register's own item buttons.
//  * udhaarBalances    — who owes the shop / whom the shop owes, from the register.
//  * registerContext   — the register as plain text for the Ask / check AI (answer-only).
import { normName, similarity, MATCH_MIN } from "./smartEntry";
import { KIND_SIDE, OTHER_ITEM, dayTotals, itemsFor, type CatalogItem, type Mode, type RegisterConfigData, type RegisterEntryLike, type RegisterKind } from "./register";

// ---------------------------------------------------------------------------
// Catalog + unit + mode matching
// ---------------------------------------------------------------------------
export function matchCatalogItem(name: string | null | undefined, items: CatalogItem[]): CatalogItem | null {
  const n = normName(name);
  if (!n) return null;
  const real = items.filter((i) => i.key !== OTHER_ITEM.key);
  const names = (i: CatalogItem) => [normName(i.key), normName(i.en), normName(i.kn)].filter(Boolean);
  const exact = real.find((i) => names(i).includes(n));
  if (exact) return exact;
  // "sunflower oil 15 kg tin" contains "sunflower"; "oil" is inside "sunflower oil" → prefer the longest name.
  const contains = real
    .map((i) => ({ i, len: Math.max(0, ...names(i).filter((x) => x.length >= 3 && (n.includes(x) || (n.length >= 3 && x.includes(n)))).map((x) => x.length)) }))
    .filter((c) => c.len > 0)
    .sort((a, b) => b.len - a.len)[0];
  if (contains) return contains.i;
  let best: { i: CatalogItem; s: number } | null = null;
  for (const i of real) {
    const s = Math.max(similarity(n, i.en), similarity(n, i.kn));
    if (!best || s > best.s) best = { i, s };
  }
  return best && best.s >= MATCH_MIN ? best.i : null;
}

const UNIT_ALIASES: Record<string, string> = {
  kg: "kg", kgs: "kg", kilo: "kg", kilos: "kg", kilogram: "kg", kilograms: "kg",
  ltr: "ltr", l: "ltr", lt: "ltr", litre: "ltr", litres: "ltr", liter: "ltr", liters: "ltr",
  bag: "bags", bags: "bags", sack: "bags", sacks: "bags",
  pcs: "pcs", pc: "pcs", piece: "pcs", pieces: "pcs", nos: "pcs", no: "pcs", tin: "pcs", tins: "pcs", can: "pcs", cans: "pcs", packet: "pcs", packets: "pcs", pouch: "pcs", pouches: "pcs",
  box: "box", boxes: "box", carton: "box", cartons: "box",
};
export function normUnit(u: unknown): string | undefined {
  return UNIT_ALIASES[String(u || "").trim().toLowerCase().replace(/\.$/, "")];
}

/** The register's pay buttons are Cash / UPI / Udhaar (credit); bank = UPI. */
export function normMode(m: unknown, kind: RegisterKind): Mode | undefined {
  const v = String(m || "").toUpperCase();
  const creditOk = kind === "SALE" || kind === "PURCHASE";
  if (v === "CASH") return "CASH";
  if (v === "UPI" || v === "BANK") return "UPI";
  if (v === "CREDIT" && creditOk) return "CREDIT";
  return undefined;
}

// ---------------------------------------------------------------------------
// AI fill → entry form
// ---------------------------------------------------------------------------
export const REGISTER_FILL_KINDS: RegisterKind[] = ["SALE", "PURCHASE", "EXPENSE", "PAYMENT", "UDHAAR_IN", "PIGMEE", "OWNER_DRAW", "FRESH_CRUSH"];

export interface RegisterInit {
  item?: string;
  /** Name typed for an item the register does not have a button for yet ("Other"). */
  otherName?: string;
  qty?: number;
  unit?: string;
  rate?: number;
  amount?: number;
  mode?: Mode;
  party?: string;
  note?: string;
}

export interface RegisterDraft {
  kind: RegisterKind | null;
  init: RegisterInit;
  /** The item words the AI heard, when they matched no button (shown as "Other"). */
  unmatchedItem: string | null;
  /** Nothing usable was found (no amount, quantity, item or name). */
  empty: boolean;
}

const num = (v: unknown): number | undefined => {
  const n = typeof v === "number" ? v : Number(String(v ?? "").replace(/[,₹\s]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : undefined;
};
const text = (v: unknown, max = 120) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : undefined);

export function mapRegisterFill(fields: Record<string, unknown>, cfg: RegisterConfigData, kindOverride?: RegisterKind | null): RegisterDraft {
  const rawKind = String(fields.kind || "").toUpperCase();
  const kind: RegisterKind | null = kindOverride || (REGISTER_FILL_KINDS.includes(rawKind as RegisterKind) ? (rawKind as RegisterKind) : null);
  const init: RegisterInit = {};
  let unmatchedItem: string | null = null;

  const side = kind ? KIND_SIDE[kind] : null;
  const hasQty = kind === "SALE" || kind === "PURCHASE";
  const itemName = text(fields.item, 80);
  if (kind && itemName) {
    const items = itemsFor(kind, cfg);
    if (items.length) {
      const hit = matchCatalogItem(itemName, items);
      if (hit) init.item = hit.key;
      else if (kind !== "UDHAAR_IN") {
        init.item = OTHER_ITEM.key;
        init.otherName = itemName;
        unmatchedItem = itemName;
      }
    }
  }
  if (hasQty) {
    const q = num(fields.qty);
    if (q) init.qty = q;
    const u = normUnit(fields.unit);
    if (u) init.unit = u;
    const r = num(fields.rateInr);
    if (r) init.rate = r;
  }
  const amount = num(fields.amountInr);
  if (amount) init.amount = amount;
  else if (init.qty && init.rate) init.amount = Math.round(init.qty * init.rate * 100) / 100;
  if (kind) {
    const mode = normMode(fields.paymentMode, kind);
    if (mode && side !== "oth") init.mode = mode;
  }
  const party = text(fields.partyName);
  if (party && side !== "oth") init.party = party;
  const note = text(fields.notes, 300);
  if (note) init.note = note;

  const empty = !(init.amount || init.qty || init.item || init.party);
  return { kind, init, unmatchedItem, empty };
}

// ---------------------------------------------------------------------------
// Udhaar balances
// ---------------------------------------------------------------------------
export interface RegisterRow {
  date: string;
  createdAt: string | number | Date;
  kind: RegisterKind;
  item?: string | null;
  itemLabel?: string | null;
  qty?: number | null;
  unit?: string | null;
  rateInr?: number | null;
  amountInr: number;
  paymentMode: Mode;
  partyName?: string | null;
  notes?: string | null;
  details?: unknown;
}

export interface Balance {
  party: string;
  amount: number;
  since: string;
}

export function udhaarBalances(rows: RegisterRow[]): { owedToMe: Balance[]; iOwe: Balance[] } {
  type Acc = { party: string; amount: number; since: string };
  const mine = new Map<string, Acc>();
  const theirs = new Map<string, Acc>();
  const bump = (m: Map<string, Acc>, name: string | null | undefined, delta: number, date: string, onlyIfKnown = false) => {
    const key = normName(name) || "(no name)";
    let a = m.get(key);
    if (!a) {
      if (onlyIfKnown) return;
      a = { party: (name || "").trim() || "(no name)", amount: 0, since: date };
      m.set(key, a);
    }
    a.amount += delta;
    if (delta > 0 && date < a.since) a.since = date;
  };
  const sorted = [...rows].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  for (const r of sorted) {
    if ((r.kind === "SALE" || r.kind === "FRESH_CRUSH") && r.paymentMode === "CREDIT") bump(mine, r.partyName, r.amountInr, r.date);
    else if (r.kind === "UDHAAR_IN") bump(mine, r.partyName, -r.amountInr, r.date, true);
    else if (r.kind === "PURCHASE" && r.paymentMode === "CREDIT") bump(theirs, r.partyName, r.amountInr, r.date);
    else if (r.kind === "PAYMENT") bump(theirs, r.partyName, -r.amountInr, r.date, true);
  }
  const clean = (m: Map<string, Acc>) =>
    Array.from(m.values())
      .map((a) => ({ party: a.party, amount: Math.round(a.amount * 100) / 100, since: a.since }))
      .filter((a) => a.amount >= 1)
      .sort((a, b) => b.amount - a.amount);
  return { owedToMe: clean(mine), iOwe: clean(theirs) };
}

// ---------------------------------------------------------------------------
// The register as text for the Ask / check AI
// ---------------------------------------------------------------------------
const rs = (n: number) => "₹" + Math.round(n * 100) / 100;
const ist = (ts: string | number | Date) => new Date(ts).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" });

export interface RegisterContextInput {
  date: string;
  today: RegisterRow[];
  /** About the last 30 days (may include today). */
  recent: RegisterRow[];
  openingInr: number | null;
  systemCashNowInr: number | null;
  tallies: { session: string; counted: number; system: number; diff: number }[];
  jobWork: { customer: string; seedKg: number; createdAt: string | number | Date; advanceCustomerInr: number; advanceAutoInr: number }[];
  nowMs: number;
}

function entryLine(r: RegisterRow): string {
  const what = [r.itemLabel || r.item, r.qty ? `${r.qty} ${r.unit || ""}`.trim() : "", r.rateInr ? `@${r.rateInr}` : ""].filter(Boolean).join(" ");
  return `${ist(r.createdAt)} ${r.kind}${what ? " " + what : ""} = ${rs(r.amountInr)} ${r.paymentMode}${r.partyName ? " — " + r.partyName : ""}${r.notes ? " (" + r.notes.slice(0, 60) + ")" : ""}`;
}

export function registerContext(i: RegisterContextInput): string {
  const lines: string[] = [];
  lines.push(`DAY: ${i.date} (IST). Quick Register of Mahadev Traders. Amounts in rupees.`);
  const t = dayTotals(i.today as unknown as RegisterEntryLike[]);
  lines.push(
    `TODAY TOTALS: cash in ${rs(t.cashIn)}, cash out ${rs(t.cashOut)}, UPI in ${rs(t.upiIn)}, udhaar given ${rs(t.creditGiven)}, udhaar purchases ${rs(t.creditTaken)}, pigmee ${rs(t.pigmee)}, owner took ${rs(t.ownerDraw)}.`
  );
  if (i.openingInr != null) lines.push(`CASH: opening ${rs(i.openingInr)}${i.systemCashNowInr != null ? `, should be in the counter now ${rs(i.systemCashNowInr)}` : ""}.`);
  for (const k of i.tallies) lines.push(`CASH COUNT (${k.session}): counted ${rs(k.counted)} vs system ${rs(k.system)} → ${k.diff === 0 ? "matched" : (k.diff > 0 ? "extra " : "short ") + rs(Math.abs(k.diff))}.`);
  lines.push(`TODAY'S ENTRIES (${i.today.length}):`);
  for (const r of [...i.today].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())) lines.push("  " + entryLine(r));
  if (!i.today.length) lines.push("  (none yet)");

  const byDay = new Map<string, RegisterRow[]>();
  for (const r of i.recent) byDay.set(r.date, [...(byDay.get(r.date) || []), r]);
  const days = Array.from(byDay.keys()).sort().reverse().slice(0, 14);
  if (days.length) {
    lines.push("LAST DAYS (sales / fresh crush / purchases / expenses+payments, cash in, cash out):");
    for (const d of days) {
      const x = dayTotals(byDay.get(d) as unknown as RegisterEntryLike[]);
      const k = x.byKind;
      lines.push(`  ${d}: sales ${rs((k.SALE || 0) + (k.FRESH_CRUSH || 0))}, purchases ${rs(k.PURCHASE || 0)}, expenses ${rs((k.EXPENSE || 0) + (k.PAYMENT || 0))}, cash in ${rs(x.cashIn)}, cash out ${rs(x.cashOut)}`);
    }
  }
  const b = udhaarBalances(i.recent);
  lines.push(`CUSTOMERS WHO OWE US (udhaar, last 30 days): ${b.owedToMe.length ? b.owedToMe.slice(0, 25).map((x) => `${x.party} ${rs(x.amount)} (since ${x.since})`).join("; ") : "none"}`);
  lines.push(`WE OWE SUPPLIERS (credit purchases, last 30 days): ${b.iOwe.length ? b.iOwe.slice(0, 25).map((x) => `${x.party} ${rs(x.amount)} (since ${x.since})`).join("; ") : "none"}`);
  if (i.jobWork.length) {
    lines.push("JOB-WORK NOT SETTLED:");
    for (const j of i.jobWork.slice(0, 25)) {
      const days = Math.max(0, Math.floor((i.nowMs - new Date(j.createdAt).getTime()) / 86_400_000));
      lines.push(`  ${j.customer}: seed ${j.seedKg} kg, ${days} day(s) pending, advances ${rs(j.advanceCustomerInr + j.advanceAutoInr)}`);
    }
  }
  return lines.join("\n");
}
