import { NextRequest, NextResponse } from "next/server";
import { prisma, safeDbCall } from "@/lib/db";
import { getUser } from "@/lib/registerServer";
import { businessDate } from "@/lib/register";
import { canDelete } from "@/lib/editRules";
import { rupees, writeAudit } from "@/lib/auditServer";

// Staff may delete only today's expense (fixing a typo at the counter); the
// owner may delete any. Every delete is logged with the full row.
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const today = businessDate(Date.now());
  const result = await safeDbCall(() =>
    prisma.$transaction(async (tx) => {
      const before = await tx.expense.findUnique({ where: { id: params.id } });
      if (!before) return { kind: "missing" as const };
      if (!canDelete(user, before.date, today)) return { kind: "locked" as const };
      await tx.expense.delete({ where: { id: params.id } });
      await writeAudit(
        tx,
        user,
        "DELETE",
        "Expense",
        before.id,
        `${before.category} ${rupees(before.amountInr)} ${before.date}`,
        before
      );
      return { kind: "done" as const, row: before };
    })
  );
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 503 });
  }
  if (result.data.kind === "missing") {
    return NextResponse.json({ error: "Expense not found" }, { status: 404 });
  }
  if (result.data.kind === "locked") {
    return NextResponse.json(
      { error: "Only the owner can delete expenses from earlier days." },
      { status: 403 }
    );
  }
  return NextResponse.json({ data: result.data.row });
}
