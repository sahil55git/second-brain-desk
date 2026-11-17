// Sharing a counter bill as text (WhatsApp) and the counter's day summary slip (pure, tested).
import { rupees, type ReceiptDoc } from "./receipt";

/** An Indian mobile number found in free text ("Ravi 98450 12345", "+91 9845012345") → 10 digits, or null. */
export function mobileOf(text: string): string | null {
  const digits = (text || "").replace(/[^\d]/g, "");
  const m = /(?:^|91|0)([6-9]\d{9})$/.exec(digits) || /([6-9]\d{9})/.exec(digits);
  return m ? m[1] : null;
}

/** The bill as plain text for a chat message. */
export function billText(doc: ReceiptDoc, shopName: string): string {
  const out: string[] = [`*${shopName}*`, `${doc.title}${doc.no ? ` #${doc.no}` : ""}${doc.when ? ` · ${doc.when}` : ""}`];
  if (doc.party) out.push(doc.party);
  out.push("");
  for (const r of doc.rows) out.push(`${r.name}${r.detail ? ` (${r.detail})` : ""}${r.amount ? ` — ${r.amount}` : ""}`);
  out.push("");
  for (const t of doc.totals || []) out.push(`${t.strong ? "*" : ""}${t.label}: ${t.value}${t.strong ? "*" : ""}`);
  out.push("", "Thank you! 🙏");
  return out.join("\n");
}

/** wa.me link (opens WhatsApp with the text ready; with a mobile it goes straight to that chat). */
export function whatsappLink(text: string, mobile?: string | null): string {
  return `https://wa.me/${mobile ? `91${mobile}` : ""}?text=${encodeURIComponent(text)}`;
}

export function daySummaryDoc(a: { when: string; from: string; to: string; count: number; total: number; kg: number; modes: Record<string, number>; returned: number }): ReceiptDoc {
  const label = a.from === a.to ? a.from : `${a.from} → ${a.to}`;
  return {
    title: "COUNTER SUMMARY",
    when: a.when,
    rows: [
      { name: "Period", amount: label },
      { name: "Bills", amount: String(a.count) },
      { name: "Weighed", amount: `${a.kg.toFixed(3)} kg` },
    ],
    totals: [
      ...Object.entries(a.modes).map(([m, v]) => ({ label: m, value: rupees(v) })),
      { label: "Sales", value: rupees(a.total) },
      ...(a.returned > 0 ? [{ label: "Returned", value: `−${rupees(a.returned)}` }, { label: "NET", value: rupees(Math.round((a.total - a.returned) * 100) / 100), strong: true }] : []),
    ],
  };
}
