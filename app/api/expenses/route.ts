import { NextRequest, NextResponse } from "next/server";
import { prisma, safeDbCall } from "@/lib/db";

export async function GET() {
  const result = await safeDbCall(() =>
    prisma.expense.findMany({
      orderBy: { createdAt: "desc" },
      include: { party: { select: { id: true, name: true } } },
    })
  );
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 503 });
  }
  return NextResponse.json({ data: result.data });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { date, category, amountInr, partyId, paymentMode, notes } = body;

  if (!date || typeof date !== "string") {
    return NextResponse.json({ error: "date is required" }, { status: 400 });
  }
  if (!category || typeof category !== "string" || !category.trim()) {
    return NextResponse.json({ error: "category is required" }, { status: 400 });
  }
  if (typeof amountInr !== "number" && typeof amountInr !== "string") {
    return NextResponse.json({ error: "amountInr is required" }, { status: 400 });
  }
  const amount = Number(amountInr);
  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: "amountInr must be a positive number" }, { status: 400 });
  }

  const result = await safeDbCall(() =>
    prisma.expense.create({
      data: {
        date,
        category: category.trim(),
        amountInr: amount,
        partyId: partyId || null,
        paymentMode: normalizeMode(paymentMode, "CASH"),
        notes: notes || null,
      },
      include: { party: { select: { id: true, name: true } } },
    })
  );

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 503 });
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
