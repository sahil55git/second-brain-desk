// Record a refund (credit note) against a sale. The check against what is
// still returnable is repeated inside the transaction with a conditional
// update, so two refunds of the same line at the same moment cannot both
// pass.
import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma, safeDbCall } from "@/lib/db";
import { planRefund, type RefundSourceLine } from "@/lib/refunds";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid refund request." }, { status: 400 });
  }
  const reason = typeof body.reason === "string" ? body.reason : "";
  const note = typeof body.note === "string" ? body.note.slice(0, 300).trim() || null : null;
  const reqLines = Array.isArray(body.lines) ? body.lines : [];

  const result = await safeDbCall(() =>
    prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const invoice = await tx.salesInvoice.findUnique({ where: { id: params.id }, include: { lineItems: true } });
      if (!invoice) throw new Error("Bill not found");

      const sourceLines: RefundSourceLine[] = invoice.lineItems.map((l) => ({
        id: l.id,
        name: l.name,
        unit: l.unit,
        qty: l.qty,
        returnedQty: l.returnedQty,
        lineTotalInr: l.lineTotalInr,
      }));
      const planned = planRefund({ reason, note: note ?? undefined, lines: reqLines }, sourceLines);
      if (!planned.ok) throw new Error(planned.error);

      // Conditional update: only succeeds if returnedQty is still what we read.
      for (const p of planned.plan) {
        const before = sourceLines.find((s) => s.id === p.lineId)!;
        const upd = await tx.salesLineItem.updateMany({
          where: { id: p.lineId, returnedQty: before.returnedQty },
          data: { returnedQty: before.returnedQty + p.qty },
        });
        if (upd.count !== 1) throw new Error("This bill changed while you were refunding. Please reopen it and try again.");
      }

      const created = await tx.salesReturn.create({
        data: {
          invoiceId: invoice.id,
          reason,
          note,
          refundInr: planned.totalInr,
          lines: planned.plan as unknown as object,
        },
      });
      const lineItems = await tx.salesLineItem.findMany({ where: { invoiceId: invoice.id } });
      return { id: created.id, refundInr: planned.totalInr, paymentMode: invoice.paymentMode, lineItems };
    })
  );
  if (!result.ok) {
    const msg = result.error;
    const status = /not found|changed while|only|not on this bill|Choose|Select/i.test(msg) ? 400 : 503;
    return NextResponse.json({ error: msg }, { status });
  }
  return NextResponse.json({ data: result.data }, { status: 201 });
}
