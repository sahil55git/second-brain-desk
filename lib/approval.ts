// Owner's OK for money going out (SOP daily closing → "Payment/draw authorization"):
// the manager may pay small daily expenses, up to Rs 2,000 each, on his own. Anything above
// that, and any owner draw, needs Sahil's OK. The cash has already left the drawer when the
// entry is made, so the entry always counts in the cash; it is only marked for the owner.
// Pure functions, tested in lib/__tests__/approval.test.ts.

export const STAFF_LIMIT_DEFAULT_INR = 2000;
export type ApprovalState = "pending" | "approved" | "rejected";

/** The saved limit, or Rs 2,000 when nothing sensible is saved. */
export function staffLimit(setting: unknown): number {
  const n = Number((setting as { staffExpenseLimitInr?: unknown } | null)?.staffExpenseLimitInr);
  return Number.isFinite(n) && n >= 0 && n <= 1_000_000 ? n : STAFF_LIMIT_DEFAULT_INR;
}

/** Does this new entry need the owner's OK? The owner's own entries never do. */
export function needsApproval(kind: string, amountInr: number, isOwner: boolean, limitInr: number): boolean {
  if (isOwner) return false;
  if (kind === "OWNER_DRAW") return true;
  return (kind === "EXPENSE" || kind === "PAYMENT") && amountInr > limitInr;
}

export function approvalOf(details: unknown): ApprovalState | null {
  const a = (details as { approval?: unknown } | null)?.approval;
  return a === "pending" || a === "approved" || a === "rejected" ? a : null;
}

/** Details after the owner decided. Everything else in details is kept. */
export function decide(details: unknown, decision: "approve" | "reject", by: string, atIso: string, reason?: string): Record<string, unknown> {
  const d = details && typeof details === "object" && !Array.isArray(details) ? (details as Record<string, unknown>) : {};
  return {
    ...d,
    approval: decision === "approve" ? "approved" : "rejected",
    approvalBy: by,
    approvalAt: atIso,
    ...(decision === "reject" && reason ? { approvalNote: reason.slice(0, 200) } : {}),
  };
}
