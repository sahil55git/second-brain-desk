// Cash tally — memo-sheet day totals, the scale report scan and the shift
// handover note. These are kept SEPARATE from the register on purpose: nothing
// here creates a RegisterEntry or changes sales, stock, GST, reports or party
// balances. Any signed-in person may type them; their name is recorded.
import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma, safeDbCall } from "@/lib/db";
import { getUser, isValidDate } from "@/lib/registerServer";
import { businessDate } from "@/lib/register";
import { isExtraLine, isMemoLine, isUpiLine, normalizeExtraLine, normalizeMemoLine, normalizeUpiLine } from "@/lib/memoTotals";

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
  const upiLines = (Array.isArray(body.upi) ? body.upi : []).map(normalizeUpiLine).filter((x: unknown): x is NonNullable<ReturnType<typeof normalizeUpiLine>> => !!x);
  const extraLines = (Array.isArray(body.extras) ? body.extras : []).map(normalizeExtraLine).filter((x: unknown): x is NonNullable<ReturnType<typeof normalizeExtraLine>> => !!x);
  const scaleLines = body.scale && Array.isArray(body.scale.lines) ? body.scale.lines : null;
  const hand = body.handover as { session?: string; countedBy?: string; handedTo?: string } | undefined;
  if (!lines.length && !upiLines.length && !extraLines.length && !body.scale && !hand) return NextResponse.json({ error: "Nothing to save." }, { status: 400 });
  if (hand && (!(hand.session === "AFTERNOON" || hand.session === "NIGHT") || !String(hand.countedBy || "").trim() || !String(hand.handedTo || "").trim())) {
    return NextResponse.json({ error: "Handover needs the session, who counted and who it was handed to." }, { status: 400 });
  }

  const result = await safeDbCall(async () => {
    // Every save is also written to the append-only log: who, when, old and new value.
    const touched = [...lines.map((l: { line: string }) => l.line), ...upiLines.map((u: { line: string }) => u.line), ...extraLines.map((x: { line: string }) => x.line)];
    const before = touched.length ? await prisma.cashMemoTotal.findMany({ where: { date, line: { in: touched } } }) : [];
    const prevOf = (line: string) => before.find((b) => b.line === line)?.amountInr ?? null;
    const logRows: { date: string; line: string; action: string; amountInr: number | null; prevInr: number | null; session?: string | null; note?: string | null; enteredByName: string }[] = [
      ...lines.map((l: { line: string; amountInr: number; source: string }) => ({ date, line: l.line, action: "SAVE", amountInr: l.amountInr, prevInr: prevOf(l.line), note: l.source === "scale-scan" ? "from scale report" : null, enteredByName: user.name })),
      ...upiLines.map((u: { line: string; amountInr: number }) => ({ date, line: u.line, action: "SAVE", amountInr: u.amountInr, prevInr: prevOf(u.line), enteredByName: user.name })),
      ...extraLines.map((x: { line: string; amountInr: number }) => ({ date, line: x.line, action: "SAVE", amountInr: x.amountInr, prevInr: prevOf(x.line), enteredByName: user.name })),
    ];
    for (const x of extraLines) {
      await prisma.cashMemoTotal.upsert({
        where: { date_line: { date, line: x.line } },
        create: { date, line: x.line, amountInr: x.amountInr, cashInr: x.amountInr, source: "typed", enteredByName: user.name },
        update: { amountInr: x.amountInr, cashInr: x.amountInr, source: "typed", enteredByName: user.name },
      });
    }
    for (const l of lines) {
      await prisma.cashMemoTotal.upsert({
        where: { date_line: { date, line: l.line } },
        create: { date, line: l.line, amountInr: l.amountInr, cashInr: l.cashInr, qty: l.qty, unit: l.unit, source: l.source, enteredByName: user.name },
        update: { amountInr: l.amountInr, cashInr: l.cashInr, qty: l.qty, unit: l.unit, source: l.source, enteredByName: user.name },
      });
    }
    for (const u of upiLines) {
      await prisma.cashMemoTotal.upsert({
        where: { date_line: { date, line: u.line } },
        create: { date, line: u.line, amountInr: u.amountInr, cashInr: 0, source: "typed", enteredByName: user.name },
        update: { amountInr: u.amountInr, cashInr: 0, source: "typed", enteredByName: user.name },
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
      logRows.push({ date, line: "SCALE", action: "SAVE", amountInr: data.totalInr, prevInr: null, note: "scale report kept", enteredByName: user.name });
    }
    if (hand) {
      const data = { countedBy: String(hand.countedBy).trim().slice(0, 40), handedTo: String(hand.handedTo).trim().slice(0, 40), enteredByName: user.name };
      await prisma.cashHandover.upsert({ where: { date_session: { date, session: hand.session as string } }, create: { date, session: hand.session as string, ...data }, update: data });
      logRows.push({ date, line: "HANDOVER", action: "SAVE", amountInr: null, prevInr: null, session: hand.session as string, note: `${data.countedBy} to ${data.handedTo}`, enteredByName: user.name });
    }
    if (logRows.length) await prisma.cashTallyLog.createMany({ data: logRows });
    return { saved: lines.length + upiLines.length + extraLines.length };
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
  const what = line === "SCALE" ? "SCALE" : isMemoLine(line) || isUpiLine(line) || isExtraLine(line) ? line : null;
  if (!what) return NextResponse.json({ error: "line must be a memo line, UPI line, cash line or SCALE" }, { status: 400 });
  const result = await safeDbCall(async () => {
    let prev: number | null = null;
    if (what === "SCALE") {
      prev = (await prisma.scaleReportScan.findUnique({ where: { date: date as string } }))?.totalInr ?? null;
      await prisma.scaleReportScan.deleteMany({ where: { date: date as string } });
    } else {
      prev = (await prisma.cashMemoTotal.findUnique({ where: { date_line: { date: date as string, line: what } } }))?.amountInr ?? null;
      await prisma.cashMemoTotal.deleteMany({ where: { date: date as string, line: what } });
    }
    await prisma.cashTallyLog.create({ data: { date: date as string, line: what, action: "DELETE", amountInr: null, prevInr: prev, enteredByName: user.name } });
    return { ok: true };
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 503 });
  return NextResponse.json({ data: result.data });
}
