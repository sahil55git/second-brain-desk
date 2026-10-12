// Look up a customer's udhaar balance by name for the Quick Register hint.
// Names are matched ignoring case and extra spaces, the same as the reports.

export interface UdhaarRow {
  name: string;
  balance: number;
}

const norm = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();

/** Balance owed by this party, or null when they owe nothing (or are unknown). */
export function udhaarFor(rows: UdhaarRow[], party: string): number | null {
  const key = norm(party);
  if (!key) return null;
  const row = rows.find((r) => norm(r.name) === key);
  if (!row || row.balance <= 0) return null;
  return Math.round(row.balance * 100) / 100;
}
