import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma, safeDbCall } from "@/lib/db";
import {
  cashGapFlag,
  computeProductTally,
  getYesterdayStock,
  STOCK_PRODUCTS,
  type StockProductEntry,
} from "@/lib/calculations";

// Edit — every cash field and every stock field can be corrected after the
// fact (plan doc, Version 14). getYesterdayStock() must look only at
// entries strictly before the one being edited, not just exclude its own
// id — otherwise editing an older count could pick up a newer count's
// value as "yesterday" (this exact bug is called out in the plan doc).
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const body = await req.json();

  const existingResult = await safeDbCall(() =>
    prisma.dailyClosing.findUniqueOrThrow({ where: { id: params.id } })
  );
  if (!existingResult.ok) {
    return NextResponse.json({ error: existingResult.error }, { status: 503 });
  }
  const existing = existingResult.data;

  const cashInputs = {
    cashInOpening: body.cashInOpening ?? existing.cashInOpening,
    cashInSales: body.cashInSales ?? existing.cashInSales,
    cashInOther: body.cashInOther ?? existing.cashInOther,
    cashOutGrn: body.cashOutGrn ?? existing.cashOutGrn,
    cashOutExpenses: body.cashOutExpenses ?? existing.cashOutExpenses,
    cashOutSalary: body.cashOutSalary ?? existing.cashOutSalary,
    cashOutUpi: body.cashOutUpi ?? existing.cashOutUpi,
    cashOutDraw: body.cashOutDraw ?? existing.cashOutDraw,
    cashOutOther: body.cashOutOther ?? existing.cashOutOther,
  };
  const counterCash = body.counterCashInr ?? existing.counterCashInr;
  const { systemCash, diff, flagged } = cashGapFlag(cashInputs, counterCash);

  const stockInput = body.stockInput as
    | Record<string, { today?: number; reportSale?: number; yesterdayOverride?: number }>
    | undefined;

  let stock = existing.stock as Record<string, unknown> | null;

  if (stockInput) {
    // Use this entry's own original createdAt as the "before" cutoff, so
    // the yesterday lookup is stable regardless of when the edit happens.
    const before = existing.createdAt;

    const priorResult = await safeDbCall(() =>
      prisma.dailyClosing.findMany({
        where: { createdAt: { lt: before } },
        orderBy: { createdAt: "desc" },
        take: 60,
      })
    );
    if (!priorResult.ok) {
      return NextResponse.json({ error: priorResult.error }, { status: 503 });
    }
    const priorEntries = priorResult.data.map((e: any) => ({
      createdAt: e.createdAt,
      stock: (e.stock as Record<string, StockProductEntry>) || {},
    }));

    const newStock: Record<string, unknown> = { ...(stock || {}) };
    for (const config of STOCK_PRODUCTS) {
      const input = stockInput[config.key];
      if (!input) continue;
      const today = typeof input.today === "number" ? input.today : undefined;
      const reportSale =
        typeof input.reportSale === "number" ? input.reportSale : undefined;
      const override =
        typeof input.yesterdayOverride === "number" ? input.yesterdayOverride : undefined;

      const { value: yesterday, source } = getYesterdayStock(
        priorEntries,
        config.key,
        before,
        override
      );

      newStock[config.key] = computeProductTally(config, today, reportSale, yesterday, source);
    }
    stock = newStock;
  }

  const result = await safeDbCall(() =>
    prisma.dailyClosing.update({
      where: { id: params.id },
      data: {
        ...cashInputs,
        counterCashInr: counterCash,
        systemCashInr: systemCash,
        cashDiffInr: diff,
        cashMismatch: flagged,
        stock:
          stock === null || stock === undefined
            ? Prisma.JsonNull
            : (stock as Prisma.InputJsonValue),
      },
    })
  );

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 503 });
  }
  return NextResponse.json({ data: result.data });
}
