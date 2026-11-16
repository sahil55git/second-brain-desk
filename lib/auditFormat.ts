// Pure helpers for the Activity log screen and its CSV (no database, no Prisma).
import { toCsvRows } from "./bizReports";

export const AUDIT_ENTITIES = [
  "SalesInvoice",
  "PurchaseBill",
  "Expense",
  "Party",
  "Item",
  "JobWorkIntake",
  "JobWorkDayOutput",
  "DailyClosing",
  "RegisterEntry",
] as const;

export interface AuditRow {
  id: string;
  at: string | Date;
  by: string;
  isOwner: boolean;
  action: string;
  entity: string;
  entityId: string;
  summary: string;
}

const istTime = (t: string | Date) =>
  new Date(t).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

/**
 * CSV of the log: when, who, what, which record, one-line summary. The full
 * before / after rows are deliberately left out (they are big, nested JSON);
 * the screen shows them in an expandable row.
 */
export function auditToCsv(rows: AuditRow[]): string {
  return toCsvRows(
    rows.map((r) => ({
      at: istTime(r.at),
      by: r.by,
      action: r.action,
      entity: r.entity,
      entityId: r.entityId,
      summary: r.summary,
    }))
  );
}
