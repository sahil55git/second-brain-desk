// Server-only helpers for the barrel receiving API routes.
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { barrelCode, barrelNet, barrelState, lotNoFor, receiptSummary, staffView, type ShapedReceipt } from "@/lib/barrels";

export type ReceiptWithBarrels = Prisma.OilReceiptGetPayload<{ include: { barrels: true } }>;

export const RECEIPT_INCLUDE = { barrels: { orderBy: { seq: "asc" as const } } };

/** The receipt with computed fields; hidden-from-staff fields removed for non-owners. */
export function shapeReceipt(r: ReceiptWithBarrels, isOwner: boolean, nowMs = Date.now()) {
  const shaped = {
    ...r,
    barrels: r.barrels.map((b) => ({ ...b, net: barrelNet(b), state: barrelState(b) })),
    summary: receiptSummary(r, r.barrels, nowMs),
  };
  return isOwner ? shaped : staffView(shaped as unknown as ShapedReceipt) as unknown as typeof shaped;
}

export async function logEvent(
  tx: Prisma.TransactionClient | typeof prisma,
  receiptId: string,
  action: string,
  by: string,
  detail?: Record<string, unknown> | null,
  barrelCodeValue?: string | null
) {
  await tx.barrelEvent.create({
    data: { receiptId, action, by, barrelCode: barrelCodeValue ?? null, detail: (detail ?? undefined) as Prisma.InputJsonValue | undefined },
  });
}

/** Create a lot with N barrels. Retries if two people create a lot at the same moment. */
export async function createReceipt(input: {
  date: string;
  by: string;
  supplierName: string;
  partyId?: string | null;
  product: string;
  vehicleNo?: string | null;
  challanNo?: string | null;
  rateInrPerKg?: number | null;
  declaredNetKg?: number | null;
  declaredBarrels?: number | null;
  tankTarget?: string | null;
  notes?: string | null;
  barrelCount: number;
}) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const dayCount = (await prisma.oilReceipt.count({ where: { date: input.date } })) + 1 + attempt;
    const lotNo = lotNoFor(input.date, dayCount);
    try {
      return await prisma.$transaction(async (tx) => {
        const r = await tx.oilReceipt.create({
          data: {
            lotNo,
            date: input.date,
            partyId: input.partyId || null,
            supplierName: input.supplierName,
            product: input.product,
            vehicleNo: input.vehicleNo || null,
            challanNo: input.challanNo || null,
            rateInrPerKg: input.rateInrPerKg ?? null,
            declaredNetKg: input.declaredNetKg ?? null,
            declaredBarrels: input.declaredBarrels ?? null,
            tankTarget: input.tankTarget || null,
            notes: input.notes || null,
            createdBy: input.by,
            barrels: {
              create: Array.from({ length: input.barrelCount }, (_, i) => ({ seq: i + 1, code: barrelCode(lotNo, i + 1) })),
            },
          },
          include: RECEIPT_INCLUDE,
        });
        await logEvent(tx, r.id, "CREATE", input.by, {
          supplier: input.supplierName,
          product: input.product,
          challanNo: input.challanNo ?? null,
          declaredNetKg: input.declaredNetKg ?? null,
          declaredBarrels: input.declaredBarrels ?? null,
          barrels: input.barrelCount,
        });
        return r;
      });
    } catch (e) {
      const code = (e as { code?: string }).code;
      if (code === "P2002" && attempt < 3) continue; // lot number taken by someone else a moment ago
      throw e;
    }
  }
  throw new Error("Could not allocate a lot number");
}

export const MAX_BARRELS_PER_LOT = 80;

export const str = (v: unknown, n: number): string | null => (typeof v === "string" && v.trim() ? v.trim().slice(0, n) : null);
export const posNum = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v) : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
};
