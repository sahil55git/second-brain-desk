import { NextRequest, NextResponse } from "next/server";
import { prisma, safeDbCall } from "@/lib/db";
import { getUser } from "@/lib/registerServer";
import { rupees, writeAudit } from "@/lib/auditServer";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const result = await safeDbCall(() =>
    prisma.purchaseBill.findUnique({
      where: { id: params.id },
      include: { lineItems: true, party: { select: { id: true, name: true } } },
    })
  );
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 503 });
  }
  if (!result.data) {
    return NextResponse.json({ error: "Bill not found" }, { status: 404 });
  }
  return NextResponse.json({ data: result.data });
}

// Owner only. The whole bill (with its lines) goes to the audit log in the
// same transaction.
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (!user.isOwner) {
    return NextResponse.json({ error: "Only the owner can delete a purchase bill." }, { status: 403 });
  }

  const result = await safeDbCall(() =>
    prisma.$transaction(async (tx) => {
      const before = await tx.purchaseBill.findUnique({
        where: { id: params.id },
        include: { lineItems: true, party: { select: { id: true, name: true } } },
      });
      if (!before) return null;
      await tx.purchaseBill.delete({ where: { id: params.id } });
      await writeAudit(
        tx,
        user,
        "DELETE",
        "PurchaseBill",
        before.id,
        `${before.billNo} ${rupees(before.totalInr)} ${before.party?.name ?? ""}`.trim(),
        before
      );
      return before;
    })
  );
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 503 });
  }
  if (!result.data) {
    return NextResponse.json({ error: "Bill not found" }, { status: 404 });
  }
  return NextResponse.json({ data: result.data });
}
