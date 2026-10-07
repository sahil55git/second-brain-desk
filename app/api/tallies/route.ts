// Tally hub API — six count desks (job-work customer stock, seed, cake,
// packaging, udhar & supplier balances, tank dips). Expected figures are
// computed HERE from the books, never taken from the browser. Counts are
// stored as small JSON documents in the existing RegisterConfig table under
// ids "tally:<DESK>:<YYYY-MM-DD>" — no schema change, no migration.
import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma, safeDbCall } from "@/lib/db";
import { getUser, isValidDate } from "@/lib/registerServer";
import { businessDate } from "@/lib/register";
import {
  CAKE_ROWS, PACK_ROWS, SEED_ROWS, TANK_ROWS, balancesAsOf, cakeSold, crushTotals, deskMeta, expectedFor, gapOf,
  isGapFlagged, jobWorkExpected, packReceived, tallyId, tallyPrefix, tankKg, DESK_IDS,
  type DeskId, type RegLite, type RowDef, type RowInput,
} from "@/lib/tallyDesks";

export const dynamic = "force-dynamic";

interface SavedDoc { desk: DeskId; date: string; savedAt: string; by: string; rows: Record<string, RowInput & { label?: string; expected?: number | null; gap?: number | null; flagged?: boolean }> }

const num = (v: unknown): number | null => (v === null || v === undefined || v === "" || Number.isNaN(Number(v)) ? null : Number(v));
const endOfDayMs = (date: string) => new Date(`${date}T23:59:59.999+05:30`).getTime();

async function loadPrior(desk: DeskId, date: string) {
  const row = await prisma.registerConfig.findFirst({
    where: { id: { startsWith: tallyPrefix(desk), lt: tallyId(desk, date) } },
    orderBy: { id: "desc" },
  });
  if (!row) return null;
  return { date: row.id.slice(tallyPrefix(desk).length), doc: row.data as unknown as SavedDoc };
}

async function registerRows(from: string | null, to: string, kinds: string[]): Promise<RegLite[]> {
  const rows = await prisma.registerEntry.findMany({
    where: { date: { ...(from ? { gt: from } : {}), lte: to }, kind: { in: kinds as never[] } },
    select: { date: true, kind: true, item: true, qty: true, unit: true, amountInr: true, paymentMode: true, partyName: true, details: true },
    take: 20000,
  });
  return rows as unknown as RegLite[];
}

const blank = (key: string, label: string, unit: string): RowDef => ({ key, label, unit, expected: null, prev: null, autoIn: 0, autoOut: 0 });

async function buildRows(desk: DeskId, date: string) {
  const meta = deskMeta(desk)!;
  const prior = await loadPrior(desk, date);
  const pr = prior?.doc?.rows || {};
  const priorDate = prior?.date ?? null;
  let defs: RowDef[] = [];

  if (desk === "JOBWORK") {
    const intakes = await prisma.jobWorkIntake.findMany({
      where: { createdAt: { lte: new Date(endOfDayMs(date)) } },
      select: { customer: true, seedKg: true, settled: true, settledAt: true, createdAt: true },
    });
    defs = jobWorkExpected(intakes, endOfDayMs(date), Date.now());
  } else if (desk === "UDHAR") {
    const rows = await registerRows(null, date, ["SALE", "FRESH_CRUSH", "UDHAAR_IN", "PURCHASE", "PAYMENT"]);
    defs = balancesAsOf(rows, date);
  } else if (desk === "TANK") {
    const closings = await prisma.dailyClosing.findMany({ where: { date: { lte: date } }, orderBy: [{ date: "desc" }, { createdAt: "desc" }], take: 30, select: { date: true, stock: true } });
    defs = TANK_ROWS.map((t) => {
      let expected: number | null = null;
      let note: string | undefined;
      for (const c of closings) {
        const v = (c.stock as Record<string, { today?: number | null }> | null)?.[t.key]?.today;
        if (v !== null && v !== undefined) { expected = v; note = `book = stock tally of ${c.date}`; break; }
      }
      return { ...blank(t.key, t.label, "kg"), expected, note, kgPerCm: num(pr[t.key]?.kgPerCm) };
    });
  } else {
    const rows = await registerRows(priorDate, date, ["FRESH_CRUSH", "SALE", "PURCHASE"]);
    const crush = crushTotals(rows, priorDate, date);
    if (desk === "SEED") defs = SEED_ROWS.map((r) => ({ ...blank(r.key, r.label, "kg"), autoOut: crush.seed[r.key] || 0 }));
    if (desk === "CAKE") defs = CAKE_ROWS.map((r) => ({ ...blank(r.key, r.label, "kg"), autoIn: crush.cake, autoOut: cakeSold(rows, priorDate, date) }));
    if (desk === "PACK") {
      const rec = packReceived(rows, priorDate, date);
      defs = PACK_ROWS.map((r) => ({ ...blank(r.key, r.label, "pcs"), autoIn: rec[r.key] || 0 }));
    }
    defs = defs.map((d) => ({ ...d, prev: num(pr[d.key]?.counted), min: num(pr[d.key]?.min) }));
  }
  // rows the user added earlier stay on the list
  const have = new Set(defs.map((d) => d.key));
  for (const [key, r] of Object.entries(pr)) {
    if (r.custom && !have.has(key)) {
      defs.push({ ...blank(key, r.label || key, r.unit || meta.unit), group: r.group, custom: true, prev: meta.mode === "flow" ? num(r.counted) : null, min: num(r.min), kgPerCm: num(r.kgPerCm) });
    }
  }
  return { defs, priorDate };
}

export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const date = req.nextUrl.searchParams.get("date");
  if (!isValidDate(date)) return NextResponse.json({ error: "date=YYYY-MM-DD is required" }, { status: 400 });
  const desk = req.nextUrl.searchParams.get("desk");

  const result = await safeDbCall(async () => {
    if (!desk) {
      // which desks have a saved count for this date
      const rows = await prisma.registerConfig.findMany({ where: { id: { in: DESK_IDS.map((d) => tallyId(d, date)) } }, select: { id: true, data: true } });
      return { status: Object.fromEntries(rows.map((r) => { const d = r.data as unknown as SavedDoc; return [d.desk, { savedAt: d.savedAt, flagged: Object.values(d.rows || {}).filter((x) => x.flagged).length }]; })) };
    }
    if (!deskMeta(desk)) return null;
    const { defs, priorDate } = await buildRows(desk as DeskId, date);
    const saved = await prisma.registerConfig.findUnique({ where: { id: tallyId(desk as DeskId, date) } });
    return { desk, date, rows: defs, priorDate, saved: (saved?.data as unknown as SavedDoc) || null };
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 503 });
  if (result.data === null) return NextResponse.json({ error: "Unknown desk" }, { status: 400 });
  return NextResponse.json({ data: result.data });
}

export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const meta = deskMeta(body.desk);
  if (!meta || !isValidDate(body.date)) return NextResponse.json({ error: "desk and date are required" }, { status: 400 });
  const todayIst = businessDate(Date.now());
  if (body.date > todayIst) return NextResponse.json({ error: "A count cannot be dated in the future." }, { status: 400 });
  if (!user.isOwner && body.date < businessDate(Date.now() - 86400000)) {
    return NextResponse.json({ error: "Staff can enter today's or yesterday's count. Ask the owner for older days." }, { status: 403 });
  }
  const input = (body.rows && typeof body.rows === "object" ? body.rows : {}) as Record<string, Record<string, unknown>>;

  const result = await safeDbCall(async () => {
    const { defs } = await buildRows(meta.id, body.date);
    const byKey = new Map(defs.map((d) => [d.key, d]));
    const rows: SavedDoc["rows"] = {};
    let counted = 0;
    let flagged = 0;
    for (const [key, raw] of Object.entries(input).slice(0, 300)) {
      const inp: RowInput = { counted: num(raw.counted), received: num(raw.received), used: num(raw.used), min: num(raw.min), dip: num(raw.dip), kgPerCm: num(raw.kgPerCm) };
      let def = byKey.get(key);
      if (!def) {
        // a row the user added — accepted with a label, nothing to compare against yet
        const label = String(raw.label || "").trim().slice(0, 60);
        if (!label || !/^[\w:.\- ]{1,80}$/.test(key)) continue;
        def = { ...blank(key, label, String(raw.unit || meta.unit).slice(0, 8)), custom: true, group: raw.group ? String(raw.group).slice(0, 20) : undefined };
      }
      const c = meta.id === "TANK" ? tankKg(inp) : inp.counted ?? null;
      if (c === null && inp.min == null && inp.kgPerCm == null) continue;
      const expected = expectedFor(meta.mode, def, { ...inp, counted: c });
      const gap = gapOf(expected, c);
      const flag = isGapFlagged(meta.id, expected, c);
      if (c !== null) counted++;
      if (flag) flagged++;
      rows[key] = { label: def.label, unit: def.unit, group: def.group, custom: def.custom || undefined, counted: c, received: inp.received, used: inp.used, min: inp.min, dip: inp.dip, kgPerCm: inp.kgPerCm, expected, gap, flagged: flag };
    }
    const doc: SavedDoc = { desk: meta.id, date: body.date, savedAt: new Date().toISOString(), by: user.name, rows };
    const data = doc as unknown as Prisma.InputJsonValue;
    await prisma.registerConfig.upsert({ where: { id: tallyId(meta.id, body.date) }, create: { id: tallyId(meta.id, body.date), data }, update: { data } });
    return { counted, flagged, savedAt: doc.savedAt };
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 503 });
  return NextResponse.json({ data: result.data }, { status: 201 });
}
