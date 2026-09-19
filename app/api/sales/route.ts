// Sales invoicing (erp-architecture-plan.md, Phase 2). GST is computed
// server-side (never trusted from the client) and the invoice number is
// allocated by atomically incrementing BusinessSettings.invoiceCounter
// inside a transaction, so two invoices created at the same moment can
// never collide on a number.
import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma, safeDbCall } from "@/lib/db";
import {
  computeLine,
  computeTotals,
  gstTreatment,
  formatInvoiceNo,
  type GstLineInput,
} from "@/lib/gst";

const SETTINGS_ID = "singleton";

interface IncomingLine {
  itemId?: string | null;
  name?: string;
  hsnCode?: string | null;
  qty?: number | string;
  unit?: string;
  rateInr?: number | string;
  gstRatePct?: number | string;
}

export async function GET() {
  const result = await safeDbCall(() =>
    prisma.salesInvoice.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        lineItems: true,
        party: { select: { id: true, name: true } },
      },
    })
  );
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 503 });
  }
  return NextResponse.json({ data: result.data });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { partyId, date, paymentMode, notes } = body;
  const rawLines: IncomingLine[] = Array.isArray(body.lineItems) ? body.lineItems : [];

  if (!partyId || typeof partyId !== "string") {
    return NextResponse.json({ error: "partyId is required" }, { status: 400 });
  }
  if (!date || typeof date !== "string") {
    return NextResponse.json({ error: "date is required" }, { status: 400 });
  }
  const cleanLines = rawLines.filter(
    (l) => (Number(l.qty) || 0) > 0 && (l.name || "").toString().trim()
  );
  if (cleanLines.length === 0) {
    return NextResponse.json(
      { error: "at least one line item with a name and quantity is required" },
      { status: 400 }
    );
  }

  const result = await safeDbCall(() =>
    prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // Load party (for state) and settings (for business state + numbering).
      const party = await tx.party.findUnique({ where: { id: partyId } });
      if (!party) throw new Error("Party not found");

      let settings = await tx.businessSettings.findUnique({ where: { id: SETTINGS_ID } });
      if (!settings) {
        settings = await tx.businessSettings.create({ data: { id: SETTINGS_ID } });
      }

      const treatment = gstTreatment(settings.state, party.state);
      const gstInputs: GstLineInput[] = cleanLines.map((l) => ({
        qty: Number(l.qty) || 0,
        rateInr: Number(l.rateInr) || 0,
        gstRatePct:
          l.gstRatePct === undefined || l.gstRatePct === null || l.gstRatePct === ""
            ? settings!.defaultGstRatePct
            : Number(l.gstRatePct) || 0,
      }));
      const totals = computeTotals(gstInputs, treatment);

      // Allocate the next invoice number atomically.
      const nextCounter = settings.invoiceCounter + 1;
      await tx.businessSettings.update({
        where: { id: SETTINGS_ID },
        data: { invoiceCounter: nextCounter },
      });
      const invoiceNo = formatInvoiceNo(settings.invoicePrefix, nextCounter);

      return tx.salesInvoice.create({
        data: {
          invoiceNo,
          date,
          partyId,
          partyStateSnapshot: party.state,
          businessStateSnapshot: settings.state,
          interState: treatment === "inter",
          subtotalInr: totals.subtotalInr,
          cgstInr: totals.cgstInr,
          sgstInr: totals.sgstInr,
          igstInr: totals.igstInr,
          totalInr: totals.totalInr,
          paymentMode: normalizeMode(paymentMode, "CASH"),
          notes: notes || null,
          lineItems: {
            create: cleanLines.map((l, i) => {
              const line = computeLine(gstInputs[i]);
              return {
                itemId: l.itemId || null,
                name: (l.name || "").toString().trim(),
                hsnCode: l.hsnCode || null,
                qty: gstInputs[i].qty,
                unit: l.unit || "kg",
                rateInr: gstInputs[i].rateInr,
                gstRatePct: gstInputs[i].gstRatePct,
                lineSubtotalInr: line.lineSubtotalInr,
                lineTaxInr: line.lineTaxInr,
                lineTotalInr: line.lineTotalInr,
              };
            }),
          },
        },
        include: {
          lineItems: true,
          party: { select: { id: true, name: true } },
        },
      });
    })
  );

  if (!result.ok) {
    // A bad partyId surfaces as "Party not found" from the transaction.
    const status = result.error.includes("Party not found") ? 400 : 503;
    return NextResponse.json({ error: result.error }, { status });
  }
  return NextResponse.json({ data: result.data }, { status: 201 });
}

const VALID_MODES = ["CASH", "UPI", "BANK", "CREDIT", "OTHER"];
function normalizeMode(v: unknown, fallback: string): "CASH" | "UPI" | "BANK" | "CREDIT" | "OTHER" {
  const s = typeof v === "string" ? v.toUpperCase() : "";
  return (VALID_MODES.includes(s) ? s : fallback) as
    | "CASH"
    | "UPI"
    | "BANK"
    | "CREDIT"
    | "OTHER";
}
