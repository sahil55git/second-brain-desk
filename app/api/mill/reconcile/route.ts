// Mill Desk ↔ main app check. GET ?from=&to= (default today) → for every mill record, the ONE main-app row it
// became (or what is missing / doubled), the cash and UPI totals on both sides, oil and khali. POST { repair: true,
// from?, to? } (owner) → saves every mill record again through the same sync, which only fills what is missing:
// it never makes a second row, so it is safe to run as often as wanted.
import { NextRequest, NextResponse } from "next/server";
import { prisma, safeDbCall } from "@/lib/db";
import { getUser, isValidDate } from "@/lib/registerServer";
import { bizDate, MILL_KIND, millMark, type MillJob } from "@/lib/mill/millDesk";
import { ids, ownOil, runNeedsBatch, runOilKg, runMark, type MillRunLike } from "@/lib/mill/millMap";
import { khaliNow, runSerial, syncJob, syncOil, syncRun } from "@/lib/mill/millSync";

export const dynamic = "force-dynamic";
const r2 = (n: number) => Math.round(n * 100) / 100;

function range(req: NextRequest, body?: { from?: unknown; to?: unknown }) {
  const q = req.nextUrl.searchParams;
  const from = body?.from ?? q.get("from");
  const to = body?.to ?? q.get("to");
  const today = bizDate();
  const f = isValidDate(from) ? from : today;
  const t = isValidDate(to) ? to : f;
  return f <= t ? { from: f, to: t } : null;
}

export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const rg = range(req);
  if (!rg) return NextResponse.json({ error: "from must not be after to." }, { status: 400 });
  const r = await safeDbCall(async () => {
    const where = { date: { gte: rg.from, lte: rg.to } };
    const [jobs, own, runs, intakes, transfers, batches] = await Promise.all([
      prisma.opsRecord.findMany({ where: { kind: MILL_KIND.job, ...where }, orderBy: { createdAt: "asc" }, take: 3000 }),
      prisma.opsRecord.findMany({ where: { kind: MILL_KIND.own, ...where, data: { path: ["key"], equals: "ooil" } }, take: 10000 }),
      prisma.opsRecord.findMany({ where: { kind: MILL_KIND.run, ...where }, orderBy: { createdAt: "asc" }, take: 1000 }),
      prisma.jobWorkIntake.findMany({ where: { notes: { contains: "[mill:" } }, orderBy: { createdAt: "asc" }, take: 20000 }),
      prisma.opsRecord.findMany({ where: { kind: "mill_transfer", ...where }, take: 10000 }),
      prisma.mfgBatch.findMany({ where: { notes: { contains: "[mill-run:" } }, take: 5000 }),
    ]);

    // --- jobs: one intake each, same money, same payment way
    const intakeOf = (id: string) => intakes.filter((i: { id: string; notes: string | null }) => i.id === ids.job(id) || (i.notes || "").includes(millMark(id)));
    const jobIssues: string[] = [];
    let millCash = 0, millUpi = 0, intakeCash = 0, intakeUpi = 0;
    for (const rec of jobs as { data: unknown }[]) {
      const j = rec.data as unknown as MillJob;
      const rows = intakeOf(j.id);
      if (rows.length === 0) jobIssues.push(`${j.tok} ${j.customer}: not in Job-Work yet`);
      if (rows.length > 1) jobIssues.push(`${j.tok} ${j.customer}: ${rows.length} job-work entries (should be one)`);
      const i = rows[0];
      if (i && j.settled && !i.settled) jobIssues.push(`${j.tok}: paid at the mill but not settled in Job-Work`);
      if (i?.settled) {
        const amt = i.settlementAmountInr || 0;
        if (String(i.settlementMode || "").toUpperCase() === "UPI") intakeUpi += amt;
        else intakeCash += amt;
      }
      if (j.settled) {
        const m = String(j.method || "").toLowerCase() === "upi";
        const amt = i?.settlementAmountInr || 0;
        if (m) millUpi += amt;
        else millCash += amt;
      }
    }

    // --- oil: the mill's weighings and the stock transfers match one to one
    const millOil = (own as { ref: string | null; data: unknown }[]).map((o) => ownOil(String(o.ref), (o.data as { v?: unknown }).v)).filter(Boolean) as { id: string; kg: number }[];
    const fromMill = (transfers as { id: string; date: string; data: unknown }[]).filter((x) => (x.data as { from?: string }).from === "mill-desk");
    const oilIssues: string[] = [];
    for (const o of millOil) if (!fromMill.some((x) => x.id === ids.transfer(o.id))) oilIssues.push(`${o.kg} kg weighed but not in stock`);
    const ids2 = new Set(millOil.map((o) => ids.transfer(o.id)));
    for (const x of fromMill) if (!ids2.has(x.id)) oilIssues.push(`a stock transfer of ${(x.data as { oilKg?: number }).oilKg} kg has no weighing behind it`);
    // oil typed by hand on the old Mill → tank screen that matches a mill weighing: counted twice
    const manual = (transfers as { id: string; date: string; data: unknown }[]).filter((x) => (x.data as { from?: string }).from !== "mill-desk");
    const maybeTwice = manual.filter((m) => fromMill.some((x) => x.date === m.date && Math.abs(((x.data as { oilKg: number }).oilKg || 0) - ((m.data as { oilKg: number }).oilKg || 0)) <= 0.5));
    for (const m of maybeTwice) oilIssues.push(`${(m.data as { oilKg?: number }).oilKg} kg on ${m.date} was also typed on the old Mill → tank screen: count it once (the owner can remove one)`);

    // --- runs: one batch each (once there is oil)
    const runIssues: string[] = [];
    for (const rec of runs as { data: unknown }[]) {
      const run = rec.data as unknown as MillRunLike;
      if (!runNeedsBatch(run)) continue;
      const rows = (batches as { id: string; notes: string | null; step1Kg: number | null }[]).filter((b) => b.id === ids.batch(run.id) || (b.notes || "").includes(runMark(run.id)));
      if (rows.length === 0) runIssues.push(`Run ${run.id}: ${runOilKg(run)} kg oil, no Manufacturing batch`);
      else if (rows.length > 1) runIssues.push(`Run ${run.id}: ${rows.length} batches (should be one)`);
      else if (Math.abs((rows[0].step1Kg || 0) - runOilKg(run)) > 0.05) runIssues.push(`Run ${run.id}: Manufacturing shows ${rows[0].step1Kg} kg, mill shows ${runOilKg(run)} kg`);
    }

    const issues = jobIssues.length + oilIssues.length + runIssues.length;
    return {
      from: rg.from,
      to: rg.to,
      ok: issues === 0 && Math.abs(millCash - intakeCash) < 0.5 && Math.abs(millUpi - intakeUpi) < 0.5,
      jobs: { millJobs: jobs.length, jobWorkEntries: intakes.length, issues: jobIssues },
      cash: { millCash: r2(millCash), jobWorkCash: r2(intakeCash), millUpi: r2(millUpi), jobWorkUpi: r2(intakeUpi) },
      oil: { weighedKg: r2(millOil.reduce((a, o) => a + o.kg, 0)), inStockKg: r2(fromMill.reduce((a, x) => a + ((x.data as { oilKg?: number }).oilKg || 0), 0)), issues: oilIssues },
      runs: { runs: runs.length, batches: batches.length, issues: runIssues },
      khali: await khaliNow(),
    };
  });
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 503 });
  return NextResponse.json(r.data, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  if (!user.isOwner) return NextResponse.json({ error: "Only the owner can run the repair." }, { status: 403 });
  const body = (await req.json().catch(() => ({}))) as { repair?: unknown; from?: unknown; to?: unknown };
  if (body.repair !== true) return NextResponse.json({ error: "Send { repair: true }." }, { status: 400 });
  const rg = range(req, body);
  if (!rg) return NextResponse.json({ error: "from must not be after to." }, { status: 400 });
  const by = user.name || user.username || null;
  const done = { jobs: 0, oil: 0, runs: 0, errors: [] as string[] };
  const r = await safeDbCall(async () => {
    const where = { date: { gte: rg.from, lte: rg.to } };
    const [jobs, own, runs] = await Promise.all([
      prisma.opsRecord.findMany({ where: { kind: MILL_KIND.job, ...where }, orderBy: { createdAt: "asc" }, take: 3000 }),
      prisma.opsRecord.findMany({ where: { kind: MILL_KIND.own, ...where, data: { path: ["key"], equals: "ooil" } }, orderBy: { createdAt: "asc" }, take: 10000 }),
      prisma.opsRecord.findMany({ where: { kind: MILL_KIND.run, ...where }, orderBy: { createdAt: "asc" }, take: 1000 }),
    ]);
    for (const rec of jobs as { data: unknown }[]) {
      try {
        if ((await syncJob(rec.data as unknown as MillJob, by)) === "created") done.jobs++;
      } catch (e) {
        done.errors.push(`job: ${String((e as Error)?.message || e).slice(0, 80)}`);
      }
    }
    for (const o of own as { ref: string | null; data: unknown; date: string; by: string | null; createdAt: Date }[]) {
      try {
        if ((await syncOil({ id: String(o.ref), v: (o.data as { v?: unknown }).v, date: o.date, by: o.by, createdAt: o.createdAt })) === "created") done.oil++;
      } catch (e) {
        done.errors.push(`oil: ${String((e as Error)?.message || e).slice(0, 80)}`);
      }
    }
    for (const rec of runs as { data: unknown; date: string; createdAt: Date }[]) {
      try {
        const res = await syncRun(rec.data as unknown as MillRunLike, rec.date, await runSerial(rec));
        if (res === "created") done.runs++;
      } catch (e) {
        done.errors.push(`run: ${String((e as Error)?.message || e).slice(0, 80)}`);
      }
    }
    return true;
  });
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 503 });
  return NextResponse.json({ ok: true, from: rg.from, to: rg.to, created: done });
}
