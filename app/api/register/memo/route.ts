// Cash tally — memo-sheet day totals, the scale report scan and the shift
// handover note. These are kept SEPARATE from the register on purpose: nothing
// here creates a RegisterEntry or changes sales, stock, GST, reports or party
// balances. Any signed-in person may type them; their name is recorded.
import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma, safeDbCall } from "@/lib/db";
import { getUser, isValidDate } from "@/lib/registerServer";
import { businessDate } from "@/lib/register";
import { isMemoLine, normalizeMemoLine } from "@/lib/memoTotals";

export const dynamic = "force-dynamic";

function dateOk(user: { isOwner: boolean }, date: unknown): string | null {
  if (!isValidDate(date)) return "date=YYYY-MM-DD is required";
  if (date > businessDate(Date.now())) return "A memo total cannot be dated in the future.";
  if (!user.isOwner && date < businessDate(Date.now() - 86400000)) return "Staff can enter today's or yesterday's totals. Ask the owner for older days.";
  return null;
}

export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const bad = dateOk(user, body.date);
  if (bad) return NextResponse.json({ error: bad }, { status: 400 });
  const date: string = body.date;

  const lines = (Array.isArray(body.lines) ? body.lines : []).map(normalizeMemoLine).filter((x: unknown): x is NonNullable<ReturnType<typeof normalizeMemoLine>> => !!x);
  const scaleLines = body.scale && Array.isArray(body.scale.lines) ? body.scale.lines : null;
  const hand = body.handover as { session?: string; countedBy?: string; handedTo?: string } | undefined;
  if (!lines.length && !body.scale && !hand) return NextResponse.json({ error: "Nothing to save." }, { status: 400 });
  if (hand && (!(hand.session === "AFTERNOON" || hand.session === "NIGHT") || !String(hand.countedBy || "").trim() || !String(hand.handedTo || "").trim())) {
    return NextResponse.json({ error: "Handover needs the session, who counted and who it was handed to." }, { status: 400 });
  }

  const result = await safeDbCall(async () => {
    for (const l of lines) {
      await prisma.cashMemoTotal.upsert({
        where: { date_line: { date, line: l.line } },
        create: { date, line: l.line, amountInr: l.amountInr, cashInr: l.cashInr, qty: l.qty, unit: l.unit, source: l.source, enteredByName: user.name },
        update: { amountInr: l.amountInr, cashInr: l.cashInr, qty: l.qty, unit: l.unit, source: l.source, enteredByName: user.name },
      });
    }
    if (body.scale) {
      const n = Number;
      const clean = (scaleLines || []).slice(0, 40).map((x: Record<string, unknown>) => ({
        name: String(x.name || "").slice(0, 40), key: typeof x.key === "string" ? x.key : null, kg: Math.max(0, n(x.kg) || 0), pcs: Math.max(0, Math.round(n(x.pcs) || 0)), amountInr: Math.max(0, n(x.amountInr) || 0),
      }));
      const fin = (v: unknown) => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) || Number(v) < 0 ? null : Number(v));
      const data = { totalKg: fin(body.scale.totalKg), totalInr: fin(body.scale.totalInr), taxInr: fin(body.scale.taxInr), lines: clean as unknown as Prisma.InputJsonValue, enteredByName: user.name };
      await prisma.scaleReportScan.upsert({ where: { date }, create: { date, ...data }, update: data });
    }
    if (hand) {
      const data = { countedBy: String(hand.countedBy).trim().slice(0, 40), handedTo: String(hand.handedTo).trim().slice(0, 40), enteredByName: user.name };
      await prisma.cashHandover.upsert({ where: { date_session: { date, session: hand.session as string } }, create: { date, session: hand.session as string, ...data }, update: data });
    }
    return { saved: lines.length };
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 503 });
  return NextResponse.json({ data: result.data }, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const date = req.nextUrl.searchParams.get("date");
  const line = req.nextUrl.searchParams.get("line");
  const bad = dateOk(user, date);
  if (bad) return NextResponse.json({ error: bad }, { status: 400 });
  const what = line === "SCALE" ? "SCALE" : isMemoLine(line) ? line : null;
  if (!what) return NextResponse.json({ error: "line must be a memo line or SCALE" }, { status: 400 });
  const result = await safeDbCall(async () => {
    if (what === "SCALE") await prisma.scaleReportScan.deleteMany({ where: { date: date as string } });
    else await prisma.cashMemoTotal.deleteMany({ where: { date: date as string, line: what } });
    return { ok: true };
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 503 });
  return NextResponse.json({ data: result.data });
}
