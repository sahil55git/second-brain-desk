// What the Android widgets and alerts show. Signed with a phone's widget key (Authorization:
// Bearer mdt_...), not a login, so it is outside the sign-in check (middleware.ts). The key can
// only read this summary. A key made by the owner gets the money figures; a staff key gets the
// barrel counts only.
import { NextRequest, NextResponse } from "next/server";
import { prisma, safeDbCall } from "@/lib/db";
import { businessDate } from "@/lib/register";
import { loadHubData } from "@/lib/hubData";
import { homeSummary, rangeSummary } from "@/lib/homeSummary";
import { udhaarReport } from "@/lib/bizReports";
import type { BizData } from "@/lib/bizReports";
import { barrelCounts, bearer, hashDeviceToken, widgetAlerts } from "@/lib/deviceToken";
import { runOut } from "@/lib/insights";
import { tips } from "@/lib/tips";
import { dueText } from "@/lib/tasks";

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
    // from the 1st of the month (for the month figures) or 8 days back, whichever is earlier
    const monthStart = `${today.slice(0, 7)}-01`;
    const from = monthStart < shift(today, -8) ? monthStart : shift(today, -8);
    const data = owner ? await loadHubData(from, today) : null;
    // the phone owner's open tasks (from the chat)
    const tasks = await prisma.task.findMany({ where: { username: dev.username, doneAt: null }, orderBy: [{ due: "asc" }, { createdAt: "asc" }], take: 12 }).catch(() => []);
    return { dev, barrels, data, today, owner, tasks };
  });
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 503 });
  if (!r.data) return NextResponse.json({ error: "This widget key is switched off. Turn widgets on again in the app." }, { status: 401 });
  const { barrels, data, today, owner, dev, tasks } = r.data;
  const b = barrelCounts(barrels, now);
  const s = data ? homeSummary(data as unknown as BizData, now) : null;
  const hourIst = Number(new Date(now).toLocaleString("en-GB", { hour: "2-digit", hour12: false, timeZone: "Asia/Kolkata" }));
  const money = s ? { today, cashCounted: !!s.lastCount, lowStock: s.stock.filter((i) => i.low).map((i) => i.name), jobWorkOverdue: s.jobWork.overdue } : null;
  const biz = data as unknown as BizData | null;
  const range = (k: "week" | "month") => {
    if (!biz) return null;
    const x = rangeSummary(biz, k, now);
    return { sold: x.sold, changePct: x.changePct, bills: x.bills, cashIn: x.cashIn, upiIn: x.upiIn, spent: x.spent, creditGiven: x.creditGiven };
  };
  const nowDays = (d: string) => Math.max(0, Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${d}T00:00:00Z`)) / 86400000));
  const udhaarTop = biz
    ? udhaarReport(biz, today).rows.filter((x) => x.balance > 0).slice(0, 5).map((x) => ({ name: x.name, balance: x.balance, days: nowDays(x.last) }))
    : [];
  const runout = biz ? runOut(biz, today) : [];
  const taskList = [...tasks].sort((a, c) => (a.due || "9999").localeCompare(c.due || "9999"));
  const tipList = tips({
    runout,
    udhaar: udhaarTop.length ? (biz ? udhaarReport(biz, today).rows.filter((x) => x.balance > 0).map((x) => ({ name: x.name, balance: x.balance, days: nowDays(x.last) })) : []) : [],
    barrels: b,
    cashCounted: money ? money.cashCounted : null,
    hourIst,
    jobWorkOverdue: money?.jobWorkOverdue ?? 0,
    tasksDue: taskList.filter((t) => t.due && t.due <= today),
  });
  return NextResponse.json(
    {
      at: new Date(now).toISOString(),
      tasks: taskList.map((t) => ({ id: t.id, text: t.text, when: dueText(t.due, t.dueTime, today), late: !!t.due && t.due < today })),
      tips: tipList.map((t) => ({ icon: t.icon, text: t.text, path: t.path })),
      runout: runout.filter((x) => x.stockKg !== null || x.perDay !== null).map((x) => ({ name: x.name, kg: x.stockKg, days: x.daysLeft, level: x.level, last: x.lastBuy ? `${x.lastBuy.party || ""}${x.lastBuy.rate ? ` ₹${x.lastBuy.rate}` : ""}`.trim() : "" })),
      day: today,
      role: owner ? "OWNER" : "STAFF",
      who: dev.username,
      barrels: b,
      money: s
        ? { sold: s.soldToday, cashIn: s.cashInToday, cashOut: s.cashOutToday, upiIn: s.upiInToday, spent: s.spentToday, udhaar: s.udhaarOutstanding, udhaarCustomers: s.udhaarCustomers, jobWorkWaiting: s.jobWork.waiting, changePct: s.changePct, bills: rangeSummary(biz!, "today", now).bills, lastCount: s.lastCount }
        : null,
      week: range("week"),
      month: range("month"),
      days7: s ? s.week.map((w) => ({ label: w.label, total: w.total })) : [],
      udhaarTop,
      jobWork: s ? { waiting: s.jobWork.waiting, waitingKg: s.jobWork.waitingKg, overdue: s.jobWork.overdue, list: s.jobWork.list.slice(0, 5).map((j) => ({ customer: j.customer, seedKg: j.seedKg, ageDays: j.ageDays, due: j.due })) } : null,
      stock: s ? s.stock.slice(0, 6).map((i) => ({ name: i.name, qty: i.qty, unit: i.unit, low: i.low })) : [],
      alerts: widgetAlerts(b, money, hourIst, today),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
