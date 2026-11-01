// What the Android widgets and alerts show. Signed with a phone's widget key (Authorization:
// Bearer mdt_...), not a login, so it is outside the sign-in check (middleware.ts). The key can
// only read this summary. A key made by the owner gets the money figures; a staff key gets the
// barrel counts only.
import { NextRequest, NextResponse } from "next/server";
import { prisma, safeDbCall } from "@/lib/db";
import { businessDate } from "@/lib/register";
import { loadHubData } from "@/lib/hubData";
import { homeSummary } from "@/lib/homeSummary";
import type { BizData } from "@/lib/bizReports";
import { barrelCounts, bearer, hashDeviceToken, widgetAlerts } from "@/lib/deviceToken";

export const dynamic = "force-dynamic";

const shift = (d: string, days: number) => new Date(new Date(`${d}T00:00:00Z`).getTime() + days * 86400000).toISOString().slice(0, 10);

export async function GET(req: NextRequest) {
  const token = bearer(req.headers.get("authorization"));
  if (!token) return NextResponse.json({ error: "No widget key." }, { status: 401 });
  const now = Date.now();
  const r = await safeDbCall(async () => {
    const dev = await prisma.deviceToken.findUnique({ where: { hash: hashDeviceToken(token) } });
    if (!dev || dev.revokedAt) return null;
    if (!dev.lastUsedAt || now - dev.lastUsedAt.getTime() > 10 * 60_000) await prisma.deviceToken.update({ where: { id: dev.id }, data: { lastUsedAt: new Date(now) } });
    const barrels = await prisma.barrel.findMany({ where: { receipt: { status: "OPEN" } }, select: { grossKg: true, emptyKg: true, grossAt: true } });
    const today = businessDate(now);
    const owner = dev.role === "OWNER";
    const data = owner ? await loadHubData(shift(today, -8), today) : null;
    return { dev, barrels, data, today, owner };
  });
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 503 });
  if (!r.data) return NextResponse.json({ error: "This widget key is switched off. Turn widgets on again in the app." }, { status: 401 });
  const { barrels, data, today, owner, dev } = r.data;
  const b = barrelCounts(barrels, now);
  const s = data ? homeSummary(data as unknown as BizData, now) : null;
  const hourIst = Number(new Date(now).toLocaleString("en-GB", { hour: "2-digit", hour12: false, timeZone: "Asia/Kolkata" }));
  const money = s ? { today, cashCounted: !!s.lastCount, lowStock: s.stock.filter((i) => i.low).map((i) => i.name), jobWorkOverdue: s.jobWork.overdue } : null;
  return NextResponse.json(
    {
      at: new Date(now).toISOString(),
      day: today,
      role: owner ? "OWNER" : "STAFF",
      who: dev.username,
      barrels: b,
      money: s
        ? { sold: s.soldToday, cashIn: s.cashInToday, upiIn: s.upiInToday, spent: s.spentToday, udhaar: s.udhaarOutstanding, udhaarCustomers: s.udhaarCustomers, jobWorkWaiting: s.jobWork.waiting, changePct: s.changePct }
        : null,
      alerts: widgetAlerts(b, money, hourIst, today),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
