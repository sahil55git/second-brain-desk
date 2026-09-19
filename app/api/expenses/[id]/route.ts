import { NextRequest, NextResponse } from "next/server";
import { prisma, safeDbCall } from "@/lib/db";

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const result = await safeDbCall(() =>
    prisma.expense.delete({ where: { id: params.id } })
  );
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 503 });
  }
  return NextResponse.json({ data: result.data });
}
