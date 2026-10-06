// Quick stock tally — the Daily Closing desk's 10-product oil-stock count,
// entered from the Quick Register. Stored on the same DailyClosing row as
// that session's cash count (Tally 1 = AFTERNOON, Tally 2 = NIGHT), so the
// Daily Closing desk, Reports and the triage list all see one record.
// Computed server-side with the desk's own functions (lib/stockTally.ts ->
// lib/calculations.ts); staff and owner may both enter counts.
import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma, safeDbCall } from "@/lib/db";
import { getUser, isValidDate } from "@/lib/registerServer";
import { STOCK_PRODUCTS } from "@/lib/calculations";
import { buildTally, sessionStamp, type TallyInput } from "@/lib/stockTally";
import { businessDate } from "@/lib/register";

export const dynamic = "force-dynamic";

const SOURCES = ["register", "register-stock"];

export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const date = req.nextUrl.searchParams.get("date");
  if (!isValidDate(date)) return NextResponse.json({ error: "date=YYYY-MM-DD is required" }, { status: 400 });
  const result = await safeDbCall(async () => {
    const [prior, todays] = await Promise.all([
      prisma.dailyClosing.findMany({
        where: { date: { lte: date } },
        orderBy: { createdAt: "desc" },
        take: 60,
        select: { id: true, date: true, session: true, source: true, createdAt: true, stock: true },
      }),
      prisma.dailyClosing.findMany({ where: { date }, orderBy: { createdAt: "asc" } }),
    ]);
    // "Yesterday" for a session = the most recent count before it, never the
    // session's own earlier save (so re-opening a count to correct it works).
    const yesterdayFor = (session: "AFTERNOON" | "NIGHT") => {
      const rows = prior
        .filter((p) => !(p.date === date && p.session === session && SOURCES.includes(p.source || "")))
        .map((p) => ({ createdAt: sessionStamp(p.date, p.session), stock: (p.stock as Record<string, TallyInput>) || null }));
      const t = buildTally(rows, {}, sessionStamp(date, session));
      return Object.fromEntries(t.rows.map((r) => [r.key, r.computed.yesterday]));
    };
    const last = (session: "AFTERNOON" | "NIGHT") =>
      todays.filter((c) => c.session === session && c.stock && Object.keys(c.stock as object).length).slice(-1)[0] || null;
    return {
      products: STOCK_PRODUCTS,
      yesterday: { AFTERNOON: yesterdayFor("AFTERNOON"), NIGHT: yesterdayFor("NIGHT") },
      sessions: { AFTERNOON: last("AFTERNOON"), NIGHT: last("NIGHT") },
    };
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 503 });
  return NextResponse.json({ data: result.data });
}

export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const session = body.session === "NIGHT" ? "NIGHT" : body.session === "AFTERNOON" ? "AFTERNOON" : null;
  if (!session || !isValidDate(body.date)) {
    return NextResponse.json({ error: "date and session (AFTERNOON|NIGHT) are required" }, { status: 400 });
  }
  // A count may be entered late (e.g. yesterday's closing count typed the next
  // morning). Never for the future; staff may go back one day, the owner further.
  const todayIst = businessDate(Date.now());
  const yesterdayIst = businessDate(Date.now() - 86400000);
  if (body.date > todayIst) return NextResponse.json({ error: "A stock count cannot be dated in the future." }, { status: 400 });
  if (!user.isOwner && body.date < yesterdayIst) {
    return NextResponse.json({ error: "Staff can enter today's or yesterday's stock. Ask the owner for older days." }, { status: 403 });
  }
  const input: Record<string, TallyInput> = {};
  for (const p of STOCK_PRODUCTS) {
    const r = body.stock?.[p.key];
    if (!r) continue;
    const n = (v: unknown) => (v === "" || v === null || v === undefined || !Number.isFinite(Number(v)) || Number(v) < 0 ? null : Number(v));
    input[p.key] = { today: n(r.today), reportSale: n(r.reportSale), yesterdayOverride: n(r.yesterdayOverride) };
  }
  if (!Object.values(input).some((v) => v.today !== null)) {
    return NextResponse.json({ error: "Enter at least one product's count." }, { status: 400 });
  }

  const result = await safeDbCall(async () => {
    const now = new Date();
    const existing = await prisma.dailyClosing.findFirst({
      where: { date: body.date, session, source: { in: SOURCES } },
      orderBy: { createdAt: "desc" },
    });
    const at = sessionStamp(body.date, session);
    const prior = await prisma.dailyClosing.findMany({
      where: { date: { lte: body.date }, ...(existing ? { NOT: { id: existing.id } } : {}) },
      orderBy: { date: "desc" },
      take: 60,
      select: { date: true, session: true, stock: true },
    });
    const tally = buildTally(
      prior.map((p) => ({ createdAt: sessionStamp(p.date, p.session), stock: (p.stock as Record<string, TallyInput>) || null })),
      input,
      at
    );
    const stock: Record<string, unknown> = {};
    for (const r of tally.rows) if (r.computed.today !== null) stock[r.key] = r.computed;

    // Attach to this session's register row if there is one; else a stock-only row.
    const row = existing
      ? await prisma.dailyClosing.update({ where: { id: existing.id }, data: { stock: stock as Prisma.InputJsonValue } })
      : await prisma.dailyClosing.create({
          // back-dated counts take their own date's time slot so later lookups order them correctly
          data: { date: body.date, session, stock: stock as Prisma.InputJsonValue, source: "register-stock", createdAt: body.date === todayIst ? now : at },
        });
    return { row, counted: tally.counted, flagged: tally.flagged };
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 503 });
  return NextResponse.json({ data: result.data }, { status: 201 });
}
