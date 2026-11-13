// Register entries waiting for the owner's OK, and those he refused (last 60 days).
// The owner sees all of them; staff see them too, so they know what is still open.
import { NextRequest, NextResponse } from "next/server";
import { prisma, safeDbCall } from "@/lib/db";
import { getUser } from "@/lib/registerServer";
import { businessDate } from "@/lib/register";
import { staffLimit } from "@/lib/approval";

export const dynamic = "force-dynamic";

interface Row { id: string; date: string; kind: string; item: string | null; itemLabel: string | null; amountInr: number; paymentMode: string; partyName: string | null; notes: string | null; createdByName: string | null; details: unknown }

export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const from = businessDate(Date.now() - 60 * 86400000);
  const select = { id: true, date: true, kind: true, item: true, itemLabel: true, amountInr: true, paymentMode: true, partyName: true, notes: true, createdByName: true, details: true } as const;
  const pending = await safeDbCall<Row[]>(() =>
    prisma.registerEntry.findMany({ where: { date: { gte: from }, details: { path: ["approval"], equals: "pending" } }, orderBy: [{ date: "desc" }, { createdAt: "desc" }], take: 200, select })
  );
  if (!pending.ok) return NextResponse.json({ error: pending.error }, { status: 503 });
  const rejected = await safeDbCall<Row[]>(() =>
    prisma.registerEntry.findMany({ where: { date: { gte: from }, details: { path: ["approval"], equals: "rejected" } }, orderBy: [{ date: "desc" }, { createdAt: "desc" }], take: 50, select })
  );
  if (!rejected.ok) return NextResponse.json({ error: rejected.error }, { status: 503 });
  const lim = await safeDbCall(() => prisma.appSetting.findUnique({ where: { key: "approvals" } }));
  return NextResponse.json({ pending: pending.data, rejected: rejected.data, limitInr: staffLimit(lim.ok ? lim.data?.data : null), isOwner: user.isOwner });
}
