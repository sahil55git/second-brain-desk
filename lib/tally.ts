// 🔄 Tally Prime export: vouchers as Tally XML (Import → Data) — sales, purchases, receipts,
// payments and expenses — and a Vyapar-style sheet. Pure; tested in lib/__tests__/tally.test.ts.
// Ledger names are set by the owner (Insights → Tally) to match the books; check with the CA.
import type { BizData } from "./bizReports";
import { registerItemName } from "./bizReports";

export interface TallyLedgers { sales: string; purchase: string; cash: string; bank: string; cgst: string; sgst: string; igst: string; expenses: string; salary: string; company?: string }
export const DEFAULT_LEDGERS: TallyLedgers = { sales: "Sales Account", purchase: "Purchase Account", cash: "Cash", bank: "Bank", cgst: "CGST", sgst: "SGST", igst: "IGST", expenses: "Shop Expenses", salary: "Salary" };

const esc = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const ymd = (d: string) => d.replace(/-/g, "");
const amt = (n: number) => (Math.round(n * 100) / 100).toFixed(2);

interface Leg { ledger: string; amount: number } // Tally sign: debit negative (deemed positive = No) … we write ISDEEMEDPOSITIVE explicitly
interface Voucher { type: "Sales" | "Purchase" | "Receipt" | "Payment"; date: string; no: string; narration: string; party: string | null; legs: { ledger: string; dr: boolean; amount: number }[] }

function voucherXml(v: Voucher): string {
  const lines = v.legs.filter((l) => Math.abs(l.amount) >= 0.005).map((l) => [
    "<ALLLEDGERENTRIES.LIST>",
    `<LEDGERNAME>${esc(l.ledger)}</LEDGERNAME>`,
    `<ISDEEMEDPOSITIVE>${l.dr ? "Yes" : "No"}</ISDEEMEDPOSITIVE>`,
    `<AMOUNT>${l.dr ? "-" : ""}${amt(l.amount)}</AMOUNT>`,
    "</ALLLEDGERENTRIES.LIST>",
  ].join(""));
  return [
    `<TALLYMESSAGE xmlns:UDF="TallyUDF"><VOUCHER VCHTYPE="${v.type}" ACTION="Create">`,
    `<DATE>${ymd(v.date)}</DATE><VOUCHERTYPENAME>${v.type}</VOUCHERTYPENAME><VOUCHERNUMBER>${esc(v.no)}</VOUCHERNUMBER>`,
    v.party ? `<PARTYLEDGERNAME>${esc(v.party)}</PARTYLEDGERNAME>` : "",
    `<NARRATION>${esc(v.narration)}</NARRATION>`,
    ...lines,
    "</VOUCHER></TALLYMESSAGE>",
  ].join("");
}
const modeLedger = (m: string, L: TallyLedgers, party: string | null) => (m === "CASH" ? L.cash : m === "CREDIT" ? party || "Sundry Debtors" : L.bank);

export function tallyVouchers(d: BizData, s: { from: string; to: string }, L: TallyLedgers = DEFAULT_LEDGERS): Voucher[] {
  const out: Voucher[] = [];
  const inSpan = (x: string) => x >= s.from && x <= s.to;
  for (const x of d.sales) {
    if (!inSpan(x.date)) continue;
    const party = x.party?.name || null;
    const tax = x.interState ? [{ ledger: L.igst, dr: false, amount: x.igstInr }] : [{ ledger: L.cgst, dr: false, amount: x.cgstInr }, { ledger: L.sgst, dr: false, amount: x.sgstInr }];
    out.push({ type: "Sales", date: x.date, no: x.invoiceNo, party, narration: (x.lineItems || []).map((l) => `${l.name} ${l.qty} ${l.unit}`).join(", "), legs: [{ ledger: x.paymentMode === "CREDIT" ? party || "Sundry Debtors" : modeLedger(x.paymentMode, L, party), dr: true, amount: x.totalInr }, { ledger: L.sales, dr: false, amount: x.subtotalInr }, ...tax] });
  }
  for (const x of d.purchases) {
    if (!inSpan(x.date)) continue;
    const party = x.party?.name || null;
    const tax = x.interState ? [{ ledger: L.igst, dr: true, amount: x.igstInr }] : [{ ledger: L.cgst, dr: true, amount: x.cgstInr }, { ledger: L.sgst, dr: true, amount: x.sgstInr }];
    out.push({ type: "Purchase", date: x.date, no: x.billNo, party, narration: (x.lineItems || []).map((l) => `${l.name} ${l.qty} ${l.unit}`).join(", "), legs: [{ ledger: L.purchase, dr: true, amount: x.subtotalInr }, ...tax, { ledger: x.paymentMode === "CREDIT" ? party || "Sundry Creditors" : modeLedger(x.paymentMode, L, party), dr: false, amount: x.totalInr }] });
  }
  let n = 0;
  for (const e of d.register) {
    if (!inSpan(e.date) || !(e.amountInr > 0)) continue;
    const party = e.partyName?.trim() || null;
    const what = registerItemName(e);
    const no = `QR-${e.date.replace(/-/g, "")}-${++n}`;
    const money = modeLedger(e.paymentMode, L, party);
    if (e.kind === "SALE" || e.kind === "FRESH_CRUSH") out.push({ type: "Sales", date: e.date, no, party, narration: `${what}${e.qty ? ` ${e.qty} ${e.unit || ""}` : ""} (counter)`, legs: [{ ledger: e.paymentMode === "CREDIT" ? party || "Sundry Debtors" : money, dr: true, amount: e.amountInr }, { ledger: L.sales, dr: false, amount: e.amountInr }] });
    else if (e.kind === "PURCHASE") out.push({ type: "Purchase", date: e.date, no, party, narration: `${what}${e.qty ? ` ${e.qty} ${e.unit || ""}` : ""} (counter)`, legs: [{ ledger: L.purchase, dr: true, amount: e.amountInr }, { ledger: e.paymentMode === "CREDIT" ? party || "Sundry Creditors" : money, dr: false, amount: e.amountInr }] });
    else if (e.kind === "UDHAAR_IN") out.push({ type: "Receipt", date: e.date, no, party, narration: "Udhaar received", legs: [{ ledger: e.paymentMode === "CREDIT" ? L.cash : money, dr: true, amount: e.amountInr }, { ledger: party || "Sundry Debtors", dr: false, amount: e.amountInr }] });
    else if (e.kind === "EXPENSE" || e.kind === "PAYMENT") {
      const toLedger = e.kind === "PAYMENT" && e.item === "salary" ? L.salary : e.kind === "PAYMENT" && e.item === "supplier" ? party || "Sundry Creditors" : L.expenses;
      out.push({ type: "Payment", date: e.date, no, party, narration: what, legs: [{ ledger: toLedger, dr: true, amount: e.amountInr }, { ledger: e.paymentMode === "CREDIT" ? L.cash : money, dr: false, amount: e.amountInr }] });
    }
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : 1));
}
export function tallyXml(vouchers: Voucher[], company?: string): string {
  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<ENVELOPE><HEADER><TALLYREQUEST>Import Data</TALLYREQUEST></HEADER><BODY><IMPORTDATA>`,
    `<REQUESTDESC><REPORTNAME>Vouchers</REPORTNAME>${company ? `<STATICVARIABLES><SVCURRENTCOMPANY>${esc(company)}</SVCURRENTCOMPANY></STATICVARIABLES>` : ""}</REQUESTDESC>`,
    `<REQUESTDATA>`, ...vouchers.map(voucherXml), `</REQUESTDATA></IMPORTDATA></BODY></ENVELOPE>`,
  ].join("\n");
}
/** Each voucher must balance (debits = credits). */
export function unbalanced(vouchers: Voucher[]): string[] {
  return vouchers.filter((v) => Math.abs(v.legs.reduce((a, l) => a + (l.dr ? l.amount : -l.amount), 0)) > 0.05).map((v) => `${v.type} ${v.no}`);
}
export type { Voucher, Leg };
