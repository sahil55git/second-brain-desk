import { NextRequest, NextResponse } from "next/server";
import { prisma, safeDbCall } from "@/lib/db";
import { getUser } from "@/lib/registerServer";
import { rupees, writeAudit } from "@/lib/auditServer";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const result = await safeDbCall(() =>
    prisma.salesInvoice.findUnique({
      where: { id: params.id },
      include: { lineItems: true, party: { select: { id: true, name: true } } },
    })
  );
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 503 });
  }
  if (!result.data) {
    return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  }
  return NextResponse.json({ data: result.data });
}

// Owner only. The whole invoice (with its lines and any returns) is written to
// the audit log in the same transaction, so a deleted invoice can be read back.
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (!user.isOwner) {
    return NextResponse.json({ error: "Only the owner can delete an invoice." }, { status: 403 });
  }

  // Hard delete is allowed here (lines cascade). Invoice numbers are NOT
  // reused — the counter only ever moves forward — so deleting an invoice
  // leaves a gap in the sequence, which is the correct, auditable behaviour
  // (a cancelled GST invoice number is never re-issued).
  const result = await safeDbCall(() =>
    prisma.$transaction(async (tx) => {
      const before = await tx.salesInvoice.findUnique({
        where: { id: params.id },
        include: { lineItems: true, returns: true, party: { select: { id: true, name: true } } },
      });
      if (!before) return null;
      await tx.salesInvoice.delete({ where: { id: params.id } });
      await writeAudit(
        tx,
        user,
        "DELETE",
        "SalesInvoice",
        before.id,
        `${before.invoiceNo} ${rupees(before.totalInr)} ${before.party?.name ?? ""}`.trim(),
        before
      );
      return before;
    })
  );
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 503 });
  }
  if (!result.data) {
    return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  }
  return NextResponse.json({ data: result.data });
}
