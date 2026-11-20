// Mill Desk data (/mill). GET → everything the screen shows today; POST → the changes one phone made
// ({ up: {job, q, run, cust, barrel}, del: {q: ids}, own: [...] }). Each item is saved on its own, so a
// worker phone and the counter phone can work at the same time. Everything is kept ONCE and fed into the
// app's own records (lib/mill/millSync.ts): jobs → JobWorkIntake (register, cash closing, job-work reports),
// our oil → stock ledger (mill_transfer), runs → Manufacturing batches, barrels → barrel fleet. Payments made
// on the Job-Work desk come back onto the mill job. Weights are never changed here: a waiting weighing is
// only marked "sorted" when the counter person uses it.
import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma, safeDbCall } from "@/lib/db";
import { getUser, dayRange } from "@/lib/registerServer";
import { bizDate, cleanItem, jobClosed, jobError, LIST_KINDS, MAX_BATCH, MILL_KIND, slipNo, tokNo, tokOf, validId, type MillEntity, type MillJob } from "@/lib/mill/millDesk";
import { ids, type MillBarrel, type MillRunLike } from "@/lib/mill/millMap";
import { khaliNow, overlayPayments, runSerial, syncBarrel, syncJob, syncOil, syncRun } from "@/lib/mill/millSync";

export const dynamic = "force-dynamic";
const COUNTER_KEY = "mill_counter";
type Counter = { jw: number; ws: number };

async function readCounter(): Promise<Counter> {
  const r = await prisma.appSetting.findUnique({ where: { key: COUNTER_KEY } });
  const d = (r?.data || {}) as Partial<Counter>;
  return { jw: Number(d.jw) || 0, ws: Number(d.ws) || 0 };
}
async function writeCounter(c: Counter, by: string) {
  await prisma.appSetting.upsert({ where: { key: COUNTER_KEY }, create: { key: COUNTER_KEY, data: c as Prisma.InputJsonValue, updatedBy: by }, update: { data: c as Prisma.InputJsonValue, updatedBy: by } });
}

const data = (rows: { data: unknown }[]) => rows.map((r) => r.data as Record<string, unknown>);

export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const today = bizDate();
  const { start } = dayRange(today);
  const r = await safeDbCall(async () => {
    const [jobs, queue, runs, own, custs, barrels, counter] = await Promise.all([
      prisma.opsRecord.findMany({ where: { kind: MILL_KIND.job, OR: [{ status: "open" }, { updatedAt: { gte: start } }, { date: today }] }, orderBy: { createdAt: "asc" }, take: 1000 }),
      prisma.opsRecord.findMany({ where: { kind: MILL_KIND.q, status: "open" }, orderBy: { createdAt: "asc" }, take: 1000 }),
      prisma.opsRecord.findMany({ where: { kind: MILL_KIND.run, OR: [{ date: today }, { status: { not: "done" } }] }, orderBy: { createdAt: "asc" }, take: 300 }),
      prisma.opsRecord.findMany({ where: { kind: MILL_KIND.own, date: today }, orderBy: { createdAt: "asc" }, take: 3000 }),
      prisma.opsRecord.findMany({ where: { kind: MILL_KIND.cust }, orderBy: { createdAt: "asc" }, take: 3000 }),
      prisma.opsRecord.findMany({ where: { kind: MILL_KIND.barrel }, orderBy: { ref: "asc" }, take: 200 }),
      readCounter(),
    ]);
    const jobList = await overlayPayments(data(jobs));
    const maxTok = jobList.reduce((m, j) => Math.max(m, tokNo(String(j.tok || ""))), 0);
    return {
      me: { name: user.name, isOwner: user.isOwner },
      day: today,
      jobs: jobList,
      queue: data(queue),
      runs: data(runs),
      own: own.map((o: { data: unknown; ref: string | null }) => ({ ...(o.data as object), id: o.ref })),
      custs: data(custs),
      barrels: data(barrels),
      nextJw: Math.max(counter.jw, maxTok) + 1,
      wsn: counter.ws + 1,
      khali: await khaliNow(),
    };
  });
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 503 });
  return NextResponse.json(r.data, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const b = (await req.json().catch(() => null)) as { up?: Record<string, unknown[]>; del?: { q?: unknown[] }; own?: unknown[] } | null;
  if (!b || typeof b !== "object") return NextResponse.json({ error: "Nothing to save." }, { status: 400 });
  const by = user.name || user.username || null;
  const today = bizDate();
  const count = LIST_KINDS.reduce((n, k) => n + (Array.isArray(b.up?.[k]) ? b.up![k].length : 0), 0) + (b.own?.length || 0) + (b.del?.q?.length || 0);
  if (count > MAX_BATCH) return NextResponse.json({ error: "Too many changes at once." }, { status: 400 });

  const errors: string[] = [];
  const notes: string[] = []; // things to do in the main app (not errors), e.g. a barrel that is not registered
  const remap: Record<string, string> = {};
  const r = await safeDbCall(async () => {
    const counter = await readCounter();
    let counterChanged = false;
    for (const kind of LIST_KINDS) {
      const list = Array.isArray(b.up?.[kind]) ? b.up![kind] : [];
      for (const raw of list) {
        const item = cleanItem(raw);
        if (!item) {
          errors.push(`${kind}: bad record`);
          continue;
        }
        const id = item.id as string;
        const existing = await prisma.opsRecord.findFirst({ where: { kind: MILL_KIND[kind as MillEntity], ref: id } });
        let status = "open";
        if (kind === "job") {
          const e = jobError(item);
          if (e) {
            errors.push(`${item.tok || id}: ${e}`);
            continue;
          }
          if (!existing) {
            // a new token: its invoice number must be unused (two counters may have picked the same one)
            const clash = await prisma.opsRecord.findFirst({ where: { kind: MILL_KIND.job, NOT: { ref: id }, data: { path: ["tok"], equals: item.tok as string } } });
            if (clash) {
              const n = Math.max(counter.jw, tokNo(item.tok as string)) + 1;
              item.tok = tokOf(n);
              remap[id] = item.tok as string;
            }
          }
          const n = tokNo(item.tok as string);
          if (n > counter.jw) {
            counter.jw = n;
            counterChanged = true;
          }
          status = jobClosed(item as unknown as MillJob) ? "closed" : "open";
        } else if (kind === "run") {
          status = String(item.state || "weighed").slice(0, 20);
        } else if (kind === "q") {
          const ws = slipNo(item.slip);
          if (ws > counter.ws) {
            counter.ws = ws;
            counterChanged = true;
          }
          if (existing && existing.status !== "open") continue; // already used by the counter person
        }
        let rec = existing;
        if (existing) rec = await prisma.opsRecord.update({ where: { id: existing.id }, data: { data: item as Prisma.InputJsonValue, status } });
        else {
          try {
            rec = await prisma.opsRecord.create({ data: { id: ids.own(`${kind}_${id}`), kind: MILL_KIND[kind as MillEntity], ref: id, date: today, data: item as Prisma.InputJsonValue, status, by } });
          } catch (e) {
            if ((e as { code?: string })?.code !== "P2002") throw e;
            rec = (await prisma.opsRecord.findFirst({ where: { kind: MILL_KIND[kind as MillEntity], ref: id } })) // the same item arrived twice
              ?? (await prisma.opsRecord.create({ data: { kind: MILL_KIND[kind as MillEntity], ref: id, date: today, data: item as Prisma.InputJsonValue, status, by } })); // a very long id that shortened to another's
          }
        }
        const fail = (what: string) => (e: unknown) => errors.push(`${what}: not copied (${String((e as Error)?.message || e).slice(0, 80)})`);
        if (kind === "job") await syncJob(item as unknown as MillJob, by).catch(fail(String(item.tok)));
        else if (kind === "run" && rec) await runSerial(rec).then((n) => syncRun(item as unknown as MillRunLike, rec!.date, n)).catch(fail("Run"));
        else if (kind === "barrel") await syncBarrel(item as unknown as MillBarrel, by).then((m) => { if (m !== "recorded") notes.push(`${item.id}: ${m}`); }).catch(fail(String(item.id)));
      }
    }
    // weighings the counter person has used: kept, marked sorted (weights are never deleted)
    for (const id of b.del?.q || []) {
      if (!validId(id)) continue;
      await prisma.opsRecord.updateMany({ where: { kind: MILL_KIND.q, ref: id, status: "open" }, data: { status: "sorted" } });
    }
    for (const raw of b.own || []) {
      const o = raw as { id?: unknown; key?: unknown; v?: unknown };
      if (!validId(o.id) || typeof o.key !== "string" || !/^[a-z]{2,12}$/.test(o.key)) continue;
      const v = Array.isArray(o.v) ? [Number(o.v[0]) || 0, String(o.v[1] || "").slice(0, 30)] : Number(o.v) || 0;
      let rec = await prisma.opsRecord.findFirst({ where: { kind: MILL_KIND.own, ref: o.id } });
      if (!rec) {
        try {
          rec = await prisma.opsRecord.create({ data: { id: ids.own(o.id), kind: MILL_KIND.own, ref: o.id, date: today, data: { key: o.key, v } as Prisma.InputJsonValue, status: "open", by } });
        } catch (e) {
          if ((e as { code?: string })?.code !== "P2002") throw e;
          rec = (await prisma.opsRecord.findFirst({ where: { kind: MILL_KIND.own, ref: o.id } })) // the same weighing arrived twice
            ?? (await prisma.opsRecord.create({ data: { kind: MILL_KIND.own, ref: o.id, date: today, data: { key: o.key, v } as Prisma.InputJsonValue, status: "open", by } }));
        }
      }
      // our oil goes into the stock ledger once (fixed id per weighing)
      if (rec && o.key === "ooil") await syncOil({ id: o.id, v, date: rec.date, by: rec.by ?? by, createdAt: rec.createdAt }).catch((e) => errors.push(`oil ${String(e?.message || e).slice(0, 80)}`));
    }
    if (counterChanged) await writeCounter(counter, by || "");
    return { nextJw: counter.jw + 1 };
  });
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 503 });
  return NextResponse.json({ ok: true, errors, notes, remap, nextJw: r.data.nextJw });
}
