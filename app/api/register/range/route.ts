// Quick Register — entries for a date range (month report / accountant CSV).
import { NextRequest, NextResponse } from "next/server";
import { prisma, safeDbCall } from "@/lib/db";
import { isValidDate } from "@/lib/registerServer";

export async function GET(req: NextRequest) {
  const from = req.nextUrl.searchParams.get("from");
  const to = req.nextUrl.searchParams.get("to");
  if (!isValidDate(from) || !isValidDate(to) || from > to) {
    return NextResponse.json({ error: "from/to=YYYY-MM-DD are required" }, { status: 400 });
  }
  const result = await safeDbCall(() =>
    prisma.registerEntry.findMany({
      where: { date: { gte: from, lte: to } },
      orderBy: [{ date: "asc" }, { createdAt: "asc" }],
    })
  );
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 503 });
  return NextResponse.json({ data: result.data });
}
