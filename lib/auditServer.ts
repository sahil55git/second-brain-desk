// Audit trail for the older desks (Spec A). writeAudit is always called with the
// transaction client of the SAME prisma.$transaction that makes the change, so a
// change and its log line either both happen or neither does.
import type { Prisma } from "@prisma/client";

export type AuditAction = "CREATE" | "DELETE" | "EDIT" | "SETTLE" | "RESETTLE" | "APPROVE" | "REJECT";
export type AuditEntity =
  | "SalesInvoice"
  | "PurchaseBill"
  | "Expense"
  | "Party"
  | "Item"
  | "JobWorkIntake"
  | "JobWorkDayOutput"
  | "DailyClosing"
  | "RegisterEntry";

export interface AuditUser {
  name: string;
  username?: string;
  isOwner: boolean;
}

/** "Rs 4,250" — for the one-line summary shown in the Activity log. */
export function rupees(n: number | null | undefined): string {
  return "Rs " + (Number(n) || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });
}

/** Dates and Prisma types become plain JSON so the row can be stored as Json. */
function asJson(v: unknown): Prisma.InputJsonValue | undefined {
  if (v === undefined || v === null) return undefined;
  return JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue;
}

export async function writeAudit(
  tx: Prisma.TransactionClient,
  user: AuditUser,
  action: AuditAction,
  entity: AuditEntity,
  entityId: string,
  summary: string,
  before?: unknown,
  after?: unknown
) {
  return tx.auditLog.create({
    data: {
      by: user.name || user.username || "unknown",
      isOwner: user.isOwner,
      action,
      entity,
      entityId,
      summary: summary.slice(0, 300),
      before: asJson(before),
      after: asJson(after),
    },
  });
}
