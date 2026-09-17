import { NextRequest, NextResponse } from "next/server";
import { prisma, safeDbCall } from "@/lib/db";
import {
  cashGapFlag,
  computeProductTally,
  getYesterdayStock,
  STOCK_PRODUCTS,
  type StockProductEntry,
} from "@/lib/calculations";

export async function GET() {
  const result = await safeDbCall(() =>
    prisma.dailyClosing.findMany({ orderBy: { createdAt: "desc" } })
  );
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 503 });
  }
  return NextResponse.json({ data: result.data });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const {
    date,
    session,
    cashInOpening,
    cashInSales,
    cashInOther,
    cashOutGrn,
    cashOutExpenses,
    cashOutSalary,
    cashOutUpi,
    cashOutDraw,
    cashOutOther,
    counterCashInr,
    stockInput, // { [productKey]: { today, reportSale, yesterdayOverride? } }
  } = body;

  if (!date || (session !== "AFTERNOON" && session !== "NIGHT")) {
    return NextResponse.json(
      { error: "date and session (AFTERNOON|NIGHT) are required" },
      { status: 400 }
    );
  }

  const cashInputs = {
    cashInOpening: Number(cashInOpening) || 0,
    cashInSales: Number(cashInSales) || 0,
    cashInOther: Number(cashInOther) || 0,
    cashOutGrn: Number(cashOutGrn) || 0,
    cashOutExpenses: Number(cashOutExpenses) || 0,
    cashOutSalary: Number(cashOutSalary) || 0,
    cashOutUpi: Number(cashOutUpi) || 0,
    cashOutDraw: Number(cashOutDraw) || 0,
    cashOutOther: Number(cashOutOther) || 0,
  };
  const counterCash = Number(counterCashInr) || 0;
  const { systemCash, diff, flagged } = cashGapFlag(cashInputs, counterCash);

  const now = new Date();

  // Fetch prior entries for getYesterdayStock's "most recent prior entry" lookup.
  const priorResult = await safeDbCall(() =>
    prisma.dailyClosing.findMany({
      where: { createdAt: { lt: now } },
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

  const stock: Record<string, unknown> = {};
  for (const config of STOCK_PRODUCTS) {
    const input = stockInput?.[config.key] || {};
    const today =
      typeof input.today === "number" ? input.today : undefined;
    const reportSale =
      typeof input.reportSale === "number" ? input.reportSale : undefined;
    const override =
      typeof input.yesterdayOverride === "number" ? input.yesterdayOverride : undefined;

    if (today === undefined && reportSale === undefined && override === undefined) {
      // Not filled in for this count — leave the product out entirely.
      continue;
    }

    const { value: yesterday, source } = getYesterdayStock(
      priorEntries,
      config.key,
      now,
      override
    );

    stock[config.key] = computeProductTally(config, today, reportSale, yesterday, source);
  }

  const result = await safeDbCall(() =>
    prisma.dailyClosing.create({
      data: {
        date,
        session,
        ...cashInputs,
        counterCashInr: counterCash,
        systemCashInr: systemCash,
        cashDiffInr: diff,
        cashMismatch: flagged,
        stock,
        createdAt: now,
      },
    })
  );

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 503 });
  }
  return NextResponse.json({ data: result.data }, { status: 201 });
}
