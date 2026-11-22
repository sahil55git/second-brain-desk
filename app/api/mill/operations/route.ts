import { NextRequest, NextResponse } from "next/server";
import { prisma, safeDbCall } from "@/lib/db";
import { getUser, dayRange, isValidDate } from "@/lib/registerServer";
import { bizDate, MILL_KIND, type MillJob } from "@/lib/mill/millDesk";
import { type MillRunLike, runOilKg } from "@/lib/mill/millMap";
import { readStockCount } from "@/lib/mill/millOperations";
import { khaliNow } from "@/lib/mill/millSync";

export const dynamic = "force-dynamic";
const countKind = "mill_stock_count";

export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const today = bizDate();
  const from = req.nextUrl.searchParams.get("from") ?? today;
  const to = req.nextUrl.searchParams.get("to") ?? from;
  if (!isValidDate(from) || !isValidDate(to) || from > to || to > today) {
    return NextResponse.json({ error: "Choose a valid date range." }, { status: 400 });
  }
  const checkedAt = new Date();
  const date = { gte: from, lte: to };
  const r = await safeDbCall(async () => {
    const [records, payments, history, khali] = await Promise.all([
      prisma.opsRecord.findMany({ where: { kind: { in: [MILL_KIND.job, MILL_KIND.run, MILL_KIND.own] }, date }, orderBy: { createdAt: "asc" } }),
      prisma.jobWorkIntake.findMany({
        where: { notes: { contains: "[mill:" }, settled: true, settledAt: { gte: dayRange(from).start, lt: dayRange(to).end, lte: checkedAt } },
        select: { id: true, customer: true, cakeOwnership: true, settledAt: true, settlementMode: true, settlementAmountInr: true, settlementCustomerInr: true, settlementAutoInr: true },
      }),
      prisma.opsRecord.findMany({ where: { kind: countKind, date: { lte: to } }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], select: { id: true, date: true, createdAt: true, data: true } }),
      to === today ? khaliNow() : null,
    ]);
    const jobs = records.filter(x => x.kind === MILL_KIND.job).map(x => {
      const j = x.data as unknown as MillJob;
      return { id: x.id, date: x.date, name: j.customer, ref: j.tok, seed: j.seedKg, crushed: !!j.crushed, oil: j.oilKg ?? null, khali: j.khaliKg ?? null };
    });
    const runs = records.filter(x => x.kind === MILL_KIND.run).map(x => {
      const run = x.data as unknown as MillRunLike;
      return { id: x.id, date: x.date, ref: run.id, seed: run.seedKg ?? 0, crushed: run.state === "oil" || run.state === "done", oil: runOilKg(run) };
    });
    const paid = payments.map(p => {
      const amounts = p.cakeOwnership === "SHOP"
        ? [p.settlementCustomerInr ?? p.settlementAmountInr ?? 0, p.settlementAutoInr ?? 0]
        : [-(p.settlementAmountInr ?? 0)];
      return { id: p.id, name: p.customer, at: p.settledAt, method: p.settlementMode ?? "UNKNOWN", out: amounts.reduce((s, n) => s + Math.max(0, n), 0), in: amounts.reduce((s, n) => s + Math.max(0, -n), 0) };
    });
    const counts = history.flatMap(h => {
      const count = readStockCount(h.data);
      return count ? [{ id: h.id, date: h.date, at: h.createdAt, ...count }] : [];
    });
    const ownKhali = records.filter(x => x.kind === MILL_KIND.own && (x.data as { key?: string }).key === "okhali")
      .map(x => ({ id: x.id, date: x.date, kg: Number((x.data as { v?: unknown }).v) || 0 }));
    return { today, checkedAt, jobs, runs, ownKhali, paid, counts, khali };
  });
  return r.ok ? NextResponse.json(r.data, { headers: { "Cache-Control": "no-store" } }) : NextResponse.json({ error: r.error }, { status: 503 });
}

export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const body = await req.json().catch(() => null);
  const count = readStockCount(body?.count);
  if (!count || typeof body?.id !== "string" || !/^[0-9a-f-]{36}$/i.test(body.id)) {
    return NextResponse.json({ error: "Enter a material, measured weight and bag count." }, { status: 400 });
  }
  const id = "msc_" + body.id;
  const date = bizDate();
  const r = await safeDbCall(() => prisma.opsRecord.upsert({
    where: { id },
    create: { id, kind: countKind, date, data: { ...count }, status: "recorded", by: user.username },
    update: {},
  }));
  return r.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: r.error }, { status: 503 });
}
