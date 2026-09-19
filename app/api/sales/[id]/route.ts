import { NextRequest, NextResponse } from "next/server";
import { prisma, safeDbCall } from "@/lib/db";

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

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  // Hard delete is allowed here (lines cascade). Invoice numbers are NOT
  // reused — the counter only ever moves forward — so deleting an invoice
  // leaves a gap in the sequence, which is the correct, auditable behaviour
  // (a cancelled GST invoice number is never re-issued).
  const result = await safeDbCall(() =>
    prisma.salesInvoice.delete({ where: { id: params.id } })
  );
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 503 });
  }
  return NextResponse.json({ data: result.data });
}
