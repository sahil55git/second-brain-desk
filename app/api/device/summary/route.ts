// What the Android widgets and alerts show. Signed with a phone's widget key (Authorization:
// Bearer mdt_...), not a login, so it is outside the sign-in check (middleware.ts). The key can
// only read this summary. A key made by the owner gets the money figures; a staff key gets the
// barrel counts only.
import { NextRequest, NextResponse } from "next/server";
import { cleanSettings, minutesLate } from "@/lib/staffRules";
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
    // "My work" widget: what this phone's user entered today, and what is waiting (no money for staff)
    const user = await prisma.user.findUnique({ where: { username: dev.username }, select: { name: true } }).catch(() => null);
    const myName = user?.name || dev.username;
    const mine = await prisma.registerEntry.findMany({ where: { date: today, createdByName: myName }, select: { kind: true, amountInr: true, createdAt: true, details: true } }).catch(() => []);
    const jwOpen = await prisma.jobWorkIntake.findMany({ where: { settled: false }, select: { seedKg: true } }).catch(() => []);
    const pendingOk = await prisma.registerEntry.findMany({ where: { date: { gte: shift(today, -60) }, details: { path: ["approval"], equals: "pending" } }, orderBy: { createdAt: "desc" }, take: 20, select: { kind: true, amountInr: true, partyName: true, createdByName: true, date: true } }).catch(() => []);
    const tasks = await prisma.task.findMany({ where: { username: dev.username, doneAt: null }, orderBy: [{ due: "asc" }, { createdAt: "asc" }], take: 12 }).catch(() => []);
    // owner's "Staff ledger" widget: what we owe each person, who is in / late / absent today (private: owner only)
    const staffRows = owner ? await staffBlock(today) : null;
    return { dev, barrels, data, today, owner, tasks, mine, jwOpen, pendingOk, myName, staffRows };
  });
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 503 });
  if (!r.data) return NextResponse.json({ error: "This widget key is switched off. Turn widgets on again in the app." }, { status: 401 });
  const { barrels, data, today, owner, dev, tasks, mine, jwOpen, pendingOk, myName, staffRows } = r.data;
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
      me: {
        name: myName,
        entries: mine.length,
        last: mine.length ? new Date(Math.max(...mine.map((e: { createdAt: Date }) => e.createdAt.getTime()))).toISOString() : null,
        waitingOk: mine.filter((e: { details: unknown }) => (e.details as { approval?: string } | null)?.approval === "pending").length,
        jobWorkLots: jwOpen.length,
        jobWorkKg: Math.round(jwOpen.reduce((a: number, j: { seedKg: number }) => a + j.seedKg, 0)),
      },
      // entries waiting for the owner's OK: the owner sees each one, staff only their own count (in "me")
      approvals: owner ? pendingOk.map((e: { kind: string; amountInr: number; partyName: string | null; createdByName: string | null; date: string }) => ({ kind: e.kind, amount: e.amountInr, party: e.partyName, by: e.createdByName, date: e.date })) : null,
      staff: staffRows,
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

/** Per active employee: balance (we owe + / advance −) and today's attendance with lateness. */
async function staffBlock(today: string) {
  const [emps, sums, att, rules] = await Promise.all([
    prisma.employee.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.employeeEntry.groupBy({ by: ["employeeId"], where: { voidedAt: null }, _sum: { creditInr: true, debitInr: true } }),
    prisma.attendance.findMany({ where: { date: today }, select: { employeeId: true, status: true, inAt: true } }),
    prisma.appSetting.findUnique({ where: { key: "staffRules" } }),
  ]);
  const cfg = cleanSettings(rules?.data);
  const bal = new Map<string, number>(sums.map((x: { employeeId: string; _sum: { creditInr: number | null; debitInr: number | null } }) => [x.employeeId, (x._sum.creditInr ?? 0) - (x._sum.debitInr ?? 0)]));
  const at = new Map<string, { status: string; inAt: Date | null }>(att.map((a: { employeeId: string; status: string; inAt: Date | null }) => [a.employeeId, a]));
  const list = emps.map((e: { id: string; name: string }) => {
    const a = at.get(e.id);
    const late = a && a.status !== "A" ? minutesLate(a.inAt ? a.inAt.toISOString() : null, cfg.openTime, cfg.graceMin) : 0;
    return { name: e.name, balance: Math.round((bal.get(e.id) ?? 0) * 100) / 100, today: a ? a.status : null, inAt: a?.inAt ? a.inAt.toISOString() : null, lateMin: late };
  });
  return {
    count: list.length,
    owed: Math.round(list.filter((x: { balance: number }) => x.balance > 0).reduce((t: number, x: { balance: number }) => t + x.balance, 0)),
    advances: Math.round(-list.filter((x: { balance: number }) => x.balance < 0).reduce((t: number, x: { balance: number }) => t + x.balance, 0)),
    present: list.filter((x: { today: string | null }) => x.today === "P" || x.today === "H").length,
    absent: list.filter((x: { today: string | null }) => x.today === "A").length,
    late: list.filter((x: { lateMin: number }) => x.lateMin > 0).length,
    open: cfg.openTime,
    list: list.slice(0, 12),
  };
}
