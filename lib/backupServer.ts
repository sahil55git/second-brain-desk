// 💾 Full backup: every business table as CSV + one JSON, in a zip. Secrets are never included
// (passwords, device tokens, bot tokens and codes, print-agent keys are left out).
import { prisma } from "@/lib/db";
import { makeZip, toCsv } from "@/lib/zip";

// table → prisma delegate name; tables with secrets are not listed
const TABLES = [
  "party", "item", "businessSettings", "salesInvoice", "salesLineItem", "salesReturn", "purchaseBill", "purchaseLineItem", "expense", "jobWorkIntake", "dailyClosing",
  "mfgBatch", "tankReading", "tankMovement", "registerEntry", "registerConfig", "oilReceipt", "barrel", "barrelEvent", "fleetBarrel", "fleetEvent", "heldBill", "stockAdjustment",
  "cashMemoTotal", "cashHandover", "cashTallyLog", "labelTemplate", "employee", "employeeEntry", "employeeEvent", "udhaarNote", "attendance", "task", "purchaseOrder",
  "machineLog", "customerOrder", "opsRecord", "appSetting",
] as const;
const DROP: Record<string, string[]> = { attendance: ["photo"], appSetting: [] };

export async function backupZip(): Promise<{ bytes: Uint8Array; counts: Record<string, number> }> {
  const files: { name: string; data: string }[] = [];
  const all: Record<string, unknown[]> = {};
  const counts: Record<string, number> = {};
  for (const t of TABLES) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows: Record<string, unknown>[] = await ((prisma as any)[t]?.findMany?.() ?? Promise.resolve([])).catch(() => []);
    const clean = rows.map((r) => { const o = { ...r }; for (const k of DROP[t] || []) delete o[k]; return o; });
    all[t] = clean;
    counts[t] = clean.length;
    files.push({ name: `csv/${t}.csv`, data: toCsv(clean) });
  }
  files.unshift({ name: "backup.json", data: JSON.stringify({ exportedAt: new Date().toISOString(), counts, tables: all }) });
  files.push({ name: "README.txt", data: "Second Brain Desk backup. backup.json has every table; csv/ has one file per table (open in Excel / Google Sheets). Passwords, device and bot tokens are not included." });
  return { bytes: makeZip(files), counts };
}
