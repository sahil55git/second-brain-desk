// Mill Desk → main app (server). Each function makes or updates exactly ONE main-app record per mill item,
// under a fixed id, so saving twice, retrying or re-syncing never makes a second row. The shapes come from
// lib/mill/millMap.ts. Every function is safe to call again.
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { checkFleetWeigh } from "@/lib/barrelFleet";
import { logFleetEvent } from "@/lib/barrelFleetServer";
import { yieldSnapshotFrom } from "@/lib/mfgCalculations";
import { bizDate, intakeData, MILL_KIND, millMark, type MillJob } from "@/lib/mill/millDesk";
import { batchFields, fleetStep, ids, khaliStack, ownOil, runMark, runNeedsBatch, transferData, type MillBarrel, type MillRunLike } from "@/lib/mill/millMap";

const isDup = (e: unknown) => (e as { code?: string })?.code === "P2002";

// --------------------------------------------------------------------------- job → JobWorkIntake
/** One JobWorkIntake per mill job (fixed id). A job already paid in the Job-Work desk keeps its money. */
export async function syncJob(j: MillJob, by: string | null) {
  const mark = millMark(j.id);
  const id = ids.job(j.id);
  let found = await prisma.jobWorkIntake.findUnique({ where: { id } });
  if (!found) found = await prisma.jobWorkIntake.findFirst({ where: { notes: { contains: mark } } }); // made before fixed ids
  const serial = found ? Number(found.notes?.match(/Token (\d+)/)?.[1]) || null : (await prisma.opsRecord.count({ where: { kind: "mill_job", date: bizDate() } })) || null;
  const d = intakeData(j, by, serial);
  if (!found) {
    const { settledByName, ...rest } = d;
    try {
      await prisma.jobWorkIntake.create({ data: { id, ...rest, settledByName, settledAt: j.settled ? new Date() : null, oilCollectedAt: j.given ? new Date() : null } });
      return "created" as const;
    } catch (e) {
      if (!isDup(e)) throw e;
      found = await prisma.jobWorkIntake.findUnique({ where: { id } }); // another save made it a moment ago
      if (!found) throw e;
    }
  }
  const f = found!;
  if (f.settled) {
    // paid already (here or on the Job-Work desk): the money, time and who stay as they are
    const { settledByName: _a, settlementCustomerInr: _b, settlementAutoInr: _c, settlementRatePerKg: _d, settlementAmountInr: _e, settlementMode: _f, settled: _g, ...rest } = d;
    void _a; void _b; void _c; void _d; void _e; void _f; void _g;
    await prisma.jobWorkIntake.update({
      where: { id: f.id },
      data: { ...rest, createdByName: f.createdByName ?? d.createdByName, ...(f.settlementMode == null && j.settled ? { settlementMode: d.settlementMode } : {}), oilCollectedAt: j.given ? f.oilCollectedAt ?? new Date() : f.oilCollectedAt },
    });
    return "updated" as const;
  }
  await prisma.jobWorkIntake.update({
    where: { id: f.id },
    data: { ...d, createdByName: f.createdByName ?? d.createdByName, settledByName: j.settled ? d.settledByName : null, settledAt: j.settled ? new Date() : null, oilCollectedAt: j.given ? f.oilCollectedAt ?? new Date() : null },
  });
  return "updated" as const;
}

// --------------------------------------------------------------------------- own oil → tank stock
/** One `mill_transfer` per weighed can of our own oil. The stock ledger already reads these. */
export async function syncOil(own: { id: string; v: unknown; date: string; by: string | null; createdAt?: Date }) {
  const o = ownOil(own.id, own.v);
  if (!o) return "skipped" as const;
  const id = ids.transfer(own.id);
  try {
    await prisma.opsRecord.create({ data: { id, kind: "mill_transfer", ref: `mill:${own.id}`.slice(0, 80), date: own.date, data: transferData(o) as unknown as Prisma.InputJsonValue, status: "open", by: own.by, ...(own.createdAt ? { createdAt: own.createdAt } : {}) } });
    return "created" as const;
  } catch (e) {
    if (isDup(e)) return "exists" as const;
    throw e;
  }
}

// --------------------------------------------------------------------------- run → Manufacturing batch
/** One MfgBatch per crushing run that has oil. Later steps (2–4) typed on the Manufacturing screen are kept. */
export async function syncRun(run: MillRunLike, date: string, serial: number) {
  if (!runNeedsBatch(run)) return "waiting" as const;
  const f = batchFields(run, serial, date);
  const id = ids.batch(run.id);
  let found = await prisma.mfgBatch.findUnique({ where: { id } });
  if (!found) found = await prisma.mfgBatch.findFirst({ where: { notes: { contains: runMark(run.id) } } });
  if (!found) {
    const snap = yieldSnapshotFrom(f);
    try {
      await prisma.mfgBatch.create({ data: { id, ...f, suppliers: f.suppliers as unknown as Prisma.InputJsonValue, yield: snap as unknown as Prisma.InputJsonValue } });
      return "created" as const;
    } catch (e) {
      if (!isDup(e)) throw e;
      found = await prisma.mfgBatch.findUnique({ where: { id } });
      if (!found) throw e;
    }
  }
  const b = found!;
  // the mill controls seed and the crude oil weighed; step 2–4, the label and the reference yield belong to the Manufacturing screen
  const merged = { ...b, suppliers: f.suppliers, step1Kg: f.step1Kg };
  await prisma.mfgBatch.update({
    where: { id: b.id },
    data: { suppliers: f.suppliers as unknown as Prisma.InputJsonValue, step1Kg: f.step1Kg, notes: b.notes && b.notes.includes(runMark(run.id)) ? f.notes : b.notes, yield: yieldSnapshotFrom(merged) as unknown as Prisma.InputJsonValue },
  });
  return "updated" as const;
}

// --------------------------------------------------------------------------- barrel → fleet
/** Records the mill's full/empty weighing on the fleet barrel, by the fleet's own rules. Returns what happened. */
export async function syncBarrel(m: MillBarrel, by: string | null): Promise<string> {
  const code = String(m.id || "").toUpperCase();
  const barrel = await prisma.fleetBarrel.findUnique({ where: { code } });
  if (!barrel) return `${code} is not registered in Barrel Fleet`;
  const step = fleetStep(barrel as never, m);
  if (step.do === "skip") return step.why;
  const problem = checkFleetWeigh(step.phase, step.kg, barrel);
  if (problem) return problem;
  const at = new Date();
  const who = by || "Mill Desk";
  const done = await prisma.$transaction(async (tx) => {
    const fresh = await tx.fleetBarrel.findUnique({ where: { id: barrel.id } });
    if (!fresh || fresh.updatedAt.getTime() !== barrel.updatedAt.getTime()) return false; // changed meanwhile: the next save decides again
    if (step.phase === "GROSS") {
      await tx.fleetBarrel.update({ where: { id: barrel.id }, data: { status: "FULL", product: "Oil (not named at mill)", grossKg: step.kg, grossAt: at, netKg: step.netKg, lastGrossDiffKg: null } });
      await logFleetEvent(tx, barrel, "GROSS", who, { at, source: "MILL", scale: "Mill scale", kg: step.kg, tareKg: barrel.tareKg, netKg: step.netKg, product: "Oil (not named at mill)", note: "Mill Desk" });
    } else {
      await tx.fleetBarrel.update({
        where: { id: barrel.id },
        data: { status: "EMPTY", product: null, netKg: null, lastGrossDiffKg: null, lastEmptyKg: step.kg, lastEmptyAt: at, ...(step.setsTare ? { tareKg: step.kg, tareAt: at, tareBy: who } : {}) },
      });
      await logFleetEvent(tx, barrel, "EMPTY", who, { at, source: "MILL", scale: "Mill scale", kg: step.kg, tareKg: step.setsTare ? step.kg : barrel.tareKg, netKg: step.netKg, product: barrel.product, note: "Mill Desk", detail: { setsTare: step.setsTare, pouredKg: step.netKg } });
    }
    return true;
  });
  return done ? "recorded" : "the barrel changed meanwhile, saved again on the next change";
}

// --------------------------------------------------------------------------- reads
/** Money and oil handover done on the Job-Work desk show on the mill job too (one truth: the intake). */
export async function overlayPayments(jobs: Record<string, unknown>[]): Promise<Record<string, unknown>[]> {
  if (!jobs.length) return jobs;
  const byId = await prisma.jobWorkIntake.findMany({ where: { id: { in: jobs.map((j) => ids.job(String(j.id))) } } });
  const found = new Map(byId.map((i: { id: string }) => [i.id, i]));
  const missing = jobs.filter((j) => !found.has(ids.job(String(j.id)))).slice(0, 150); // made before fixed ids: find by the mark in the notes
  if (missing.length) {
    const old = await prisma.jobWorkIntake.findMany({ where: { OR: missing.map((j) => ({ notes: { contains: millMark(String(j.id)) } })) } });
    for (const i of old) for (const j of missing) if (i.notes?.includes(millMark(String(j.id)))) found.set(ids.job(String(j.id)), i);
  }
  return jobs.map((j) => {
    const i = found.get(ids.job(String(j.id))) as unknown as { settled: boolean; settlementMode: string | null; oilCollectedAt: Date | null } | undefined;
    if (!i) return j;
    const out = { ...j };
    if (i.settled && !out.settled) {
      out.settled = true;
      out.method = String(i.settlementMode || "").toUpperCase() === "UPI" ? "upi" : "cash";
    }
    if (i.oilCollectedAt && !out.given) out.given = true;
    return out;
  });
}

/** Khali stack: bags weighed at the mill minus khali sold at the counter (worked out, never stored). */
export async function khaliNow() {
  const [bags, sales] = await Promise.all([
    prisma.opsRecord.findMany({ where: { kind: MILL_KIND.own, data: { path: ["key"], equals: "okhali" } }, select: { date: true, data: true }, take: 50000 }),
    prisma.registerEntry.findMany({ where: { kind: "SALE", item: "cake", unit: "kg" }, select: { date: true, qty: true }, take: 50000 }),
  ]);
  return khaliStack(
    bags.map((b: { date: string; data: unknown }) => ({ date: b.date, kg: Number((b.data as { v?: unknown }).v) || 0 })),
    sales.map((x: { date: string; qty: number | null }) => ({ date: x.date, kg: x.qty || 0 }))
  );
}

/** Position of a run among the day's runs, oldest first (its label in Manufacturing). */
export async function runSerial(rec: { date: string; createdAt: Date }) {
  return (await prisma.opsRecord.count({ where: { kind: MILL_KIND.run, date: rec.date, createdAt: { lte: rec.createdAt } } })) || 1;
}
