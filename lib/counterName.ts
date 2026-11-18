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
