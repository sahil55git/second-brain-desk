// End to end through the real /api/mill route: two phones, a lost reply that makes a phone send the same
// batch again, a payment made on the Job-Work desk, UPI. After all of it the main app must hold exactly one
// row for each job, each can of oil and each run, and the money must be counted once, on the right side.
import { beforeEach, describe, expect, it, vi } from "vitest";

const { tables, fake, reset } = vi.hoisted(() => {
  type Row = Record<string, unknown> & { id: string };
  const tables: Record<string, Row[]> = {};
  const t = (n: string) => (tables[n] ||= []);
  let cuid = 0;
  let clock = 0;
  const dup = () => Object.assign(new Error("Unique constraint failed"), { code: "P2002" });
  const get = (r: Row, path: string[]) => path.reduce<unknown>((o, k) => (o && typeof o === "object" ? (o as Record<string, unknown>)[k] : undefined), r.data);
  function matches(r: Row, where: Record<string, unknown> = {}): boolean {
    return Object.entries(where).every(([k, v]) => {
      if (k === "OR") return (v as Record<string, unknown>[]).some((w) => matches(r, w));
      if (k === "NOT") return !matches(r, v as Record<string, unknown>);
      if (k === "data" && v && typeof v === "object" && "path" in (v as object)) return get(r, (v as { path: string[] }).path) === (v as { equals: unknown }).equals;
      if (v && typeof v === "object" && !(v instanceof Date)) {
        const o = v as Record<string, unknown>;
        if ("contains" in o) return String(r[k] ?? "").includes(String(o.contains));
        if ("in" in o) return (o.in as unknown[]).includes(r[k]);
        if ("not" in o) return r[k] !== o.not;
        if ("gte" in o || "lte" in o) return (o.gte === undefined || (r[k] as never) >= (o.gte as never)) && (o.lte === undefined || (r[k] as never) <= (o.lte as never));
      }
      return r[k] === v;
    });
  }
  const model = (name: string) => ({
    findUnique: async ({ where }: { where: Record<string, unknown> }) => t(name).find((r) => matches(r, where)) ?? null,
    findFirst: async ({ where }: { where?: Record<string, unknown> } = {}) => t(name).find((r) => matches(r, where)) ?? null,
    findMany: async ({ where }: { where?: Record<string, unknown> } = {}) => t(name).filter((r) => matches(r, where)),
    count: async ({ where }: { where?: Record<string, unknown> } = {}) => t(name).filter((r) => matches(r, where)).length,
    create: async ({ data }: { data: Record<string, unknown> }) => {
      const id = (data.id as string) || `c${++cuid}`;
      if (t(name).some((r) => r.id === id)) throw dup();
      const row = { createdAt: new Date(Date.UTC(2026, 10, 20, 4, 0, 0) + ++clock * 1000), updatedAt: new Date(), status: "open", ...data, id } as Row;
      t(name).push(row);
      return row;
    },
    update: async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
      const row = t(name).find((r) => matches(r, where));
      if (!row) throw new Error("not found");
      Object.assign(row, data, { updatedAt: new Date(Date.now() + ++clock) });
      return row;
    },
    updateMany: async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
      const rows = t(name).filter((r) => matches(r, where));
      rows.forEach((r) => Object.assign(r, data));
      return { count: rows.length };
    },
    upsert: async ({ where, create, update }: { where: Record<string, unknown>; create: Record<string, unknown>; update: Record<string, unknown> }) => {
      const row = t(name).find((r) => matches(r, where));
      if (row) return Object.assign(row, update);
      const made = { id: `c${++cuid}`, ...create } as Row;
      t(name).push(made);
      return made;
    },
  });
  const fake: Record<string, unknown> = {
    jobWorkIntake: model("jobWorkIntake"),
    opsRecord: model("opsRecord"),
    mfgBatch: model("mfgBatch"),
    fleetBarrel: model("fleetBarrel"),
    fleetEvent: model("fleetEvent"),
    appSetting: { findUnique: async ({ where }: { where: { key: string } }) => t("appSetting").find((r) => r.key === where.key) ?? null, upsert: async ({ where, create, update }: { where: { key: string }; create: Record<string, unknown>; update: Record<string, unknown> }) => { const r = t("appSetting").find((x) => x.key === where.key); if (r) return Object.assign(r, update); t("appSetting").push({ id: `s${++cuid}`, ...create } as Row); } },
    registerEntry: model("registerEntry"),
    $transaction: async (fn: (tx: unknown) => unknown) => fn(fake),
  };
  return { tables, fake, reset: () => { for (const k of Object.keys(tables)) delete tables[k]; cuid = 0; clock = 0; } };
});
vi.mock("@/lib/db", () => ({ prisma: fake, safeDbCall: async (fn: () => Promise<unknown>) => { try { return { ok: true, data: await fn() }; } catch (e) { return { ok: false, error: String((e as Error).message) }; } } }));
vi.mock("@/lib/registerServer", () => ({ getUser: async () => ({ username: "raju", name: "Raju", role: "STAFF", isOwner: false }), dayRange: () => ({ start: new Date("2026-11-19T18:30:00Z") }), isValidDate: (d: unknown) => typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d) }));

import { GET, POST } from "@/app/api/mill/route";
import { jobWorkCashEvents, jobWorkUpiEvents } from "@/lib/register";
import { ledgerMoves } from "@/lib/stockLedger";
import type { NextRequest } from "next/server";

const t = (n: string) => (tables[n] ||= []);
const post = (body: unknown) => POST({ json: async () => body } as unknown as NextRequest);
const get = () => GET({} as unknown as NextRequest).then((r) => r.json());
const job = (o: Record<string, unknown> = {}) => ({ id: "J1", tok: "JW-0001", customer: "Gundappa", place: "Janawada", seedKg: 500, nb: 10, cake: "SHOP", advC: 0, advA: 0, ...o });

beforeEach(reset);

describe("/api/mill: nothing is ever copied twice", () => {
  const batch = () => ({
    up: { job: [job()], q: [], run: [{ id: "R1", time: "20 Nov 08:30 AM", seedKg: 287.4, nb: 6, state: "oil", oil: [[15.2, "K2"], [16.1, "Floor barrel"]] }], cust: [], barrel: [] },
    del: { q: [] },
    own: [{ id: "O1", key: "ooil", v: [15.2, "K2"], idx: 0 }, { id: "O2", key: "ooil", v: [16.1, "Floor barrel"], idx: 1 }, { id: "O3", key: "okhali", v: 44.1, idx: 0 }],
  });
  it("the same batch sent three times (lost replies) leaves one of everything", async () => {
    for (let i = 0; i < 3; i++) expect((await post(batch())).status).toBe(200);
    expect(t("opsRecord").filter((r) => r.kind === "mill_job")).toHaveLength(1);
    expect(t("opsRecord").filter((r) => r.kind === "mill_own")).toHaveLength(3);
    expect(t("opsRecord").filter((r) => r.kind === "mill_run")).toHaveLength(1);
    expect(t("jobWorkIntake")).toHaveLength(1);
    expect(t("mfgBatch")).toHaveLength(1);
    const transfers = t("opsRecord").filter((r) => r.kind === "mill_transfer");
    expect(transfers).toHaveLength(2);
    expect(transfers.reduce((a, r) => a + (r.data as { oilKg: number }).oilKg, 0)).toBeCloseTo(31.3, 6);
  });
  it("two phones sending the same job, and the same oil, at the same moment", async () => {
    await Promise.all([post(batch()), post(batch())]);
    expect(t("jobWorkIntake")).toHaveLength(1);
    expect(t("opsRecord").filter((r) => r.kind === "mill_transfer")).toHaveLength(2);
    expect(t("opsRecord").filter((r) => r.kind === "mill_own")).toHaveLength(3);
  });
  it("oil and the Manufacturing batch agree, and the stock ledger sees the oil once", async () => {
    await post(batch());
    await post(batch());
    expect(t("mfgBatch")[0].step1Kg).toBeCloseTo(31.3, 6);
    const ops = t("opsRecord").map((r) => ({ id: r.id, kind: r.kind as string, date: r.date as string, data: r.data as Record<string, unknown>, createdAt: (r.createdAt as Date).toISOString() }));
    const { moves } = ledgerMoves({ register: [], sales: [], purchases: [] } as never, ops);
    expect(moves.reduce((a, m) => a + m.kg, 0)).toBeCloseTo(31.3, 6);
  });
  it("paid by UPI: one settlement, on the UPI side, not in the drawer", async () => {
    const paid = batch();
    paid.up.job = [job({ settled: true, method: "upi", crushed: true })];
    await post(batch());
    await post(paid);
    await post(paid);
    const row = t("jobWorkIntake")[0] as never as Parameters<typeof jobWorkCashEvents>[0] & { settlementMode: string };
    expect(t("jobWorkIntake")).toHaveLength(1);
    expect(jobWorkCashEvents(row)).toHaveLength(0);
    expect(jobWorkUpiEvents(row)).toHaveLength(1);
    expect(jobWorkUpiEvents(row)[0].amount).toBe(-3000);
  });
  it("paid in cash: one cash event of the same amount the mill shows", async () => {
    const paid = batch();
    paid.up.job = [job({ settled: true, method: "cash" })];
    await post(paid);
    await post(paid);
    const row = t("jobWorkIntake")[0] as never as Parameters<typeof jobWorkCashEvents>[0];
    expect(jobWorkCashEvents(row)).toEqual([expect.objectContaining({ amount: -3000, bucket: "jwOut" })]);
    expect(jobWorkUpiEvents(row)).toHaveLength(0);
  });
  it("a payment made on the Job-Work desk shows on the mill job, and is not changed by the mill", async () => {
    await post(batch());
    Object.assign(t("jobWorkIntake")[0], { settled: true, settlementAmountInr: 2900, settledAt: new Date(), settlementMode: "UPI", oilCollectedAt: new Date() });
    const d = await get();
    expect(d.jobs[0]).toMatchObject({ settled: true, method: "upi", given: true });
    await post(batch()); // a phone that has not yet seen the payment saves its old state
    expect(t("jobWorkIntake")).toHaveLength(1);
    expect(t("jobWorkIntake")[0]).toMatchObject({ settled: true, settlementAmountInr: 2900, settlementMode: "UPI" });
  });
  it("khali stack = bags weighed − khali sold at the counter", async () => {
    // the bags are dated "today": pin today to the sale's day, or the test breaks the day after it was written
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-20T06:00:00Z"));
    try {
      await post(batch());
      t("registerEntry").push({ id: "e1", kind: "SALE", item: "cake", unit: "kg", qty: 20, date: "2026-11-20" });
      const d = await get();
      expect(d.khali).toMatchObject({ inKg: 44.1, soldKg: 20, stackKg: 24.1 });
    } finally {
      vi.useRealTimers();
    }
  });
});
