// What a counter bill is called when no customer name was typed: by how it was paid (pure, tested).
const NAMES: Record<string, [string, string]> = {
  CASH: ["Cash bill", "ನಗದು ಬಿಲ್"],
  UPI: ["UPI bill", "UPI ಬಿಲ್"],
  CREDIT: ["Udhaar bill", "ಉದ್ರಿ ಬಿಲ್"],
};
const ICONS: Record<string, string> = { CASH: "💵", UPI: "📲", CREDIT: "📒" };

/** "Cash bill", "UPI bill", "Cash + UPI bill"; the customer's own name wins when one was typed. */
export function billName(party: string | null | undefined, modes: Record<string, number>, kn = false): string {
  const p = (party || "").trim();
  if (p) return p;
  const ms = ["CASH", "UPI", "CREDIT"].filter((m) => (modes[m] || 0) > 0);
  if (!ms.length) return kn ? "ಬಿಲ್" : "Bill";
  if (ms.length === 1) return NAMES[ms[0]][kn ? 1 : 0];
  return ms.map((m) => (m === "UPI" ? "UPI" : NAMES[m][kn ? 1 : 0].replace(kn ? " ಬಿಲ್" : " bill", ""))).join(" + ") + (kn ? " ಬಿಲ್" : " bill");
}

/** A single icon for the bill: how the money comes. */
export function billIcon(modes: Record<string, number>): string {
  const ms = ["CASH", "UPI", "CREDIT"].filter((m) => (modes[m] || 0) > 0);
  return ms.length === 1 ? ICONS[ms[0]] : ms.length > 1 ? "💵📲" : "🧾";
}

/** 2 → "2", 1.000 → "1", 0.5 → "0.5", 2.345 → "2.345" */
export function fmtQty(q: number): string {
  return String(Math.round(q * 1000) / 1000);
}

/** The amount sold with its unit: "2 kg", "3 pcs"; blank when there is no quantity. */
export function qtyText(qty: number | null | undefined, unit: string | null | undefined): string {
  if (!qty || qty <= 0) return "";
  const u = (unit || "kg").trim();
  return `${fmtQty(qty)} ${u}`;
}

/** Total kg of oil on a bill, for the big "Oil 3 kg" button: "3 kg"; blank when nothing is sold by weight. */
export function oilKgText(lines: { qty?: number | null; unit?: string | null }[]): string {
  const kg = lines.reduce((s, l) => ((l.unit || "kg").trim() === "kg" && (l.qty || 0) > 0 ? s + (l.qty as number) : s), 0);
  return kg > 0 ? `${fmtQty(kg)} kg` : "";
}
