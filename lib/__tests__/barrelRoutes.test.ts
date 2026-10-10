// Runs the real route handlers against an in-memory stand-in for the database,
// to check the anti-tampering rules end to end (tick claimed once, reweigh
// owner-only, staff never see the supplier's figures).
import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const db = vi.hoisted(() => ({ receipts: [] as Row[], barrels: [] as Row[], ticks: [] as Row[], events: [] as Row[], user: { name: "Nilkant", role: "STAFF", isOwner: false } as Row | null }));

vi.mock("@/lib/registerServer", () => ({ getUser: async () => db.user, isValidDate: (d: unknown) => typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d) }));
vi.mock("@/lib/attachmentServer", () => ({ missingTable: () => false, TABLE_HINT: "run db push" }));
vi.mock("@/lib/db", () => {
  const withBarrels = (r: Row) => ({ ...r, barrels: db.barrels.filter((b) => b.receiptId === r.id).sort((a, b) => a.seq - b.seq) });
  const prisma = {
    barrel: {
      findUnique: async ({ where }: Row) => {
        const b = db.barrels.find((x) => (where.code ? x.code === where.code : x.id === where.id));
        return b ? { ...b, receipt: db.receipts.find((r) => r.id === b.receiptId) } : null;
      },
      update: async ({ where, data }: Row) => Object.assign(db.barrels.find((b) => b.id === where.id)!, data),
    },
    oilReceipt: { findUnique: async ({ where }: Row) => { const r = db.receipts.find((x) => x.id === where.id); return r ? withBarrels(r) : null; } },
    scaleTick: {
      findUnique: async ({ where }: Row) => db.ticks.find((t) => (where.id ? t.id === where.id : t.nonce === where.nonce)) ?? null,
      updateMany: async ({ where, data }: Row) => {
        const t = db.ticks.find((x) => x.id === where.id && (where.usedAt === null ? !x.usedAt : true));
        if (!t) return { count: 0 };
        Object.assign(t, data);
        return { count: 1 };
      },
      create: async ({ data }: Row) => { const t = { id: "t" + (db.ticks.length + 1), ...data }; db.ticks.push(t); return t; },
    },
    barrelEvent: { create: async ({ data }: Row) => db.events.push(data) },
    $transaction: async (fn: (tx: unknown) => unknown) => fn(prisma),
  };
  return { prisma, safeDbCall: async (fn: () => Promise<unknown>) => { try { return { ok: true, data: await fn() }; } catch (e) { return { ok: false, error: String(e) }; } } };
});

import { NextRequest } from "next/server";
import { POST as weigh } from "@/app/api/barrels/weigh/route";
import { POST as ingest } from "@/app/api/scale-ticks/ingest/route";

const post = (url: string, body: unknown, headers: Record<string, string> = {}) =>
  new NextRequest(`http://localhost${url}`, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
const ago = (s: number) => new Date(Date.now() - s * 1000);

beforeEach(() => {
  db.user = { name: "Nilkant", role: "STAFF", isOwner: false };
  db.receipts = [{ id: "r1", lotNo: "R261010-1", status: "OPEN", date: "2026-10-10", supplierName: "Sri Balaji", product: "Sunflower oil", declaredNetKg: 400, declaredBarrels: 2, rateInrPerKg: 130, createdBy: "x" }];
  const base = { receiptId: "r1", declaredNetKg: null, grossKg: null, grossAt: null, grossSource: null, emptyKg: null, emptyAt: null, emptySource: null };
  db.barrels = [{ ...base, id: "b1", seq: 1, code: "R261010-1-01" }, { ...base, id: "b2", seq: 2, code: "R261010-1-02" }];
  db.ticks = [{ id: "t1", source: "PLATFORM-1", weightKg: 218.4, settledAt: ago(10), usedAt: null }, { id: "t2", source: "PLATFORM-1", weightKg: 18.2, settledAt: ago(5), usedAt: null }];
  db.events = [];
});

describe("POST /api/barrels/weigh", () => {
  it("takes the kilograms from the scale reading, not from the request", async () => {
    const res = await weigh(post("/api/barrels/weigh", { code: "R261010-1-01", phase: "GROSS", source: "SCALE", tickId: "t1", kg: 5 }));
    expect(res.status).toBe(200);
    expect((await res.json()).kg).toBe(218.4);
    expect(db.barrels[0]).toMatchObject({ grossKg: 218.4, grossSource: "SCALE", grossScale: "PLATFORM-1", grossBy: "Nilkant" });
    expect(db.ticks[0]).toMatchObject({ usedBarrelCode: "R261010-1-01", usedPhase: "GROSS" });
  });
  it("lets a reading be used only once", async () => {
    await weigh(post("/api/barrels/weigh", { code: "R261010-1-01", phase: "GROSS", source: "SCALE", tickId: "t1" }));
    const again = await weigh(post("/api/barrels/weigh", { code: "R261010-1-02", phase: "GROSS", source: "SCALE", tickId: "t1" }));
    expect(again.status).toBe(409);
    expect(db.barrels[1].grossKg).toBeNull();
  });
  it("refuses an old reading and an unknown one", async () => {
    db.ticks[0].settledAt = ago(600);
    expect((await weigh(post("/api/barrels/weigh", { code: "R261010-1-01", phase: "GROSS", source: "SCALE", tickId: "t1" }))).status).toBe(409);
    expect((await weigh(post("/api/barrels/weigh", { code: "R261010-1-01", phase: "GROSS", source: "SCALE", tickId: "nope" }))).status).toBe(400);
    expect((await weigh(post("/api/barrels/weigh", { code: "R261010-1-01", phase: "GROSS", source: "SCALE" }))).status).toBe(400);
  });
  it("needs the full weight first and an empty lighter than the full", async () => {
    expect((await weigh(post("/api/barrels/weigh", { code: "R261010-1-01", phase: "EMPTY", source: "SCALE", tickId: "t2" }))).status).toBe(400);
    expect(db.ticks[1].usedAt).toBeNull(); // a refused weighment must not burn the reading
    await weigh(post("/api/barrels/weigh", { code: "R261010-1-01", phase: "GROSS", source: "SCALE", tickId: "t1" }));
    const res = await weigh(post("/api/barrels/weigh", { code: "R261010-1-01", phase: "EMPTY", source: "SCALE", tickId: "t2" }));
    expect(res.status).toBe(200);
    expect(db.barrels[0]).toMatchObject({ grossKg: 218.4, emptyKg: 18.2 });
  });
  it("rejects an empty reading heavier than the full one", async () => {
    db.barrels[0].grossKg = 100;
    const res = await weigh(post("/api/barrels/weigh", { code: "R261010-1-01", phase: "EMPTY", source: "SCALE", tickId: "t1" })); // 218.4 > 100
    expect(res.status).toBe(400);
    expect(db.ticks[0].usedAt).toBeNull();
  });
  it("allows a typed weight only with a reason, and marks it MANUAL", async () => {
    expect((await weigh(post("/api/barrels/weigh", { code: "R261010-1-01", phase: "GROSS", source: "MANUAL", kg: 218 }))).status).toBe(400);
    const ok = await weigh(post("/api/barrels/weigh", { code: "R261010-1-01", phase: "GROSS", source: "MANUAL", kg: 218, note: "scale display off" }));
    expect(ok.status).toBe(200);
    expect(db.barrels[0]).toMatchObject({ grossKg: 218, grossSource: "MANUAL", grossNote: "scale display off" });
  });
  it("blocks a second weighing by staff; the owner can redo it with a reason and the old figure is logged", async () => {
    await weigh(post("/api/barrels/weigh", { code: "R261010-1-01", phase: "GROSS", source: "SCALE", tickId: "t1" }));
    db.ticks.push({ id: "t3", source: "PLATFORM-1", weightKg: 219.0, settledAt: ago(3), usedAt: null });
    expect((await weigh(post("/api/barrels/weigh", { code: "R261010-1-01", phase: "GROSS", source: "SCALE", tickId: "t3" }))).status).toBe(400);
    expect((await weigh(post("/api/barrels/weigh", { code: "R261010-1-01", phase: "GROSS", source: "SCALE", tickId: "t3", reweigh: true, note: "bad" }))).status).toBe(403);
    db.user = { name: "Sahil", role: "OWNER", isOwner: true };
    expect((await weigh(post("/api/barrels/weigh", { code: "R261010-1-01", phase: "GROSS", source: "SCALE", tickId: "t3", reweigh: true }))).status).toBe(400);
    const ok = await weigh(post("/api/barrels/weigh", { code: "R261010-1-01", phase: "GROSS", source: "SCALE", tickId: "t3", reweigh: true, note: "platform was not zeroed" }));
    expect(ok.status).toBe(200);
    expect(db.barrels[0].grossKg).toBe(219);
    expect(db.events.at(-1)).toMatchObject({ action: "REWEIGH", detail: expect.objectContaining({ previousKg: 218.4 }) });
  });
  it("does not show staff the supplier's figures, the rate or the shortage", async () => {
    db.barrels[0].declaredNetKg = 200;
    const res = await weigh(post("/api/barrels/weigh", { code: "R261010-1-01", phase: "GROSS", source: "SCALE", tickId: "t1" }));
    const j = await res.json();
    expect(j.data.declaredNetKg).toBeNull();
    expect(j.data.rateInrPerKg).toBeNull();
    expect(j.data.barrels[0].declaredNetKg).toBeNull();
    expect(j.data.summary.shortValueInr).toBeNull();
  });
  it("shows the owner everything", async () => {
    db.user = { name: "Sahil", role: "OWNER", isOwner: true };
    const j = await (await weigh(post("/api/barrels/weigh", { code: "R261010-1-01", phase: "GROSS", source: "SCALE", tickId: "t1" }))).json();
    expect(j.data.declaredNetKg).toBe(400);
    expect(j.data.rateInrPerKg).toBe(130);
  });
  it("refuses a closed lot, a foreign label and a signed-out caller", async () => {
    db.receipts[0].status = "CLOSED";
    expect((await weigh(post("/api/barrels/weigh", { code: "R261010-1-01", phase: "GROSS", source: "SCALE", tickId: "t1" }))).status).toBe(409);
    db.receipts[0].status = "OPEN";
    expect((await weigh(post("/api/barrels/weigh", { code: "R999999-9-09", phase: "GROSS", source: "SCALE", tickId: "t1" }))).status).toBe(404);
    expect((await weigh(post("/api/barrels/weigh", { code: "hello", phase: "GROSS", source: "SCALE", tickId: "t1" }))).status).toBe(400);
    db.user = null;
    expect((await weigh(post("/api/barrels/weigh", { code: "R261010-1-01", phase: "GROSS", source: "SCALE", tickId: "t1" }))).status).toBe(401);
  });
});

describe("POST /api/scale-ticks/ingest", () => {
  const good = { source: "PLATFORM-1", weightKg: 218.4, nonce: "abcd1234abcd1234" };
  it("needs the server secret to be set and to match", async () => {
    delete process.env.SCALE_PUSH_SECRET;
    expect((await ingest(post("/api/scale-ticks/ingest", good, { "x-scale-secret": "x" }))).status).toBe(503);
    process.env.SCALE_PUSH_SECRET = "s3cret-s3cret-s3cret";
    expect((await ingest(post("/api/scale-ticks/ingest", good))).status).toBe(401);
    expect((await ingest(post("/api/scale-ticks/ingest", good, { "x-scale-secret": "wrong-wrong-wrong-1" }))).status).toBe(401);
    expect(db.ticks).toHaveLength(2); // nothing added
  });
  it("stores a reading once, even if it is sent twice", async () => {
    process.env.SCALE_PUSH_SECRET = "s3cret-s3cret-s3cret";
    const h = { "x-scale-secret": "s3cret-s3cret-s3cret" };
    const a = await ingest(post("/api/scale-ticks/ingest", good, h));
    expect(a.status).toBe(201);
    const b = await ingest(post("/api/scale-ticks/ingest", good, h));
    expect(b.status).toBe(200);
    expect((await b.json()).duplicate).toBe(true);
    expect(db.ticks).toHaveLength(3);
  });
  it("rejects nonsense weights and names", async () => {
    process.env.SCALE_PUSH_SECRET = "s3cret-s3cret-s3cret";
    const h = { "x-scale-secret": "s3cret-s3cret-s3cret" };
    expect((await ingest(post("/api/scale-ticks/ingest", { ...good, weightKg: 0 }, h))).status).toBe(400);
    expect((await ingest(post("/api/scale-ticks/ingest", { ...good, weightKg: 5000, nonce: "zzzzzzzz1" }, h))).status).toBe(400);
    expect((await ingest(post("/api/scale-ticks/ingest", { ...good, source: "bad name!", nonce: "zzzzzzzz2" }, h))).status).toBe(400);
    expect((await ingest(post("/api/scale-ticks/ingest", { ...good, nonce: "x" }, h))).status).toBe(400);
  });
});
