// Route-level checks for the barrel register and for weigh time/date:
//  - a scale weighing is dated by the scale's own settle time
//  - a typed weighing may carry its real time (not future, not too old, not before the full weighing)
//  - a barrel can be emptied days after it was weighed full
//  - the register is blind for staff, complete for the owner, and accepts a scanned QR link as the code
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
    oilReceipt: {
      findUnique: async ({ where }: Row) => { const r = db.receipts.find((x) => x.id === where.id); return r ? withBarrels(r) : null; },
      findMany: async ({ where }: Row) => {
        const code = where?.barrels?.some?.code;
        return db.receipts.filter((r) => (typeof code === "string" ? db.barrels.some((b) => b.receiptId === r.id && b.code === code) : true)).map(withBarrels);
      },
    },
    scaleTick: {
      findUnique: async ({ where }: Row) => db.ticks.find((t) => t.id === where.id) ?? null,
      updateMany: async ({ where, data }: Row) => {
        const t = db.ticks.find((x) => x.id === where.id && (where.usedAt === null ? !x.usedAt : true));
        if (!t) return { count: 0 };
        Object.assign(t, data);
        return { count: 1 };
      },
    },
    barrelEvent: {
      create: async ({ data }: Row) => db.events.push(data),
      findMany: async ({ where }: Row) => db.events.filter((e) => e.barrelCode === where.barrelCode),
    },
    $transaction: async (fn: (tx: unknown) => unknown) => fn(prisma),
  };
  return { prisma, safeDbCall: async (fn: () => Promise<unknown>) => { try { return { ok: true, data: await fn() }; } catch (e) { return { ok: false, error: String(e) }; } } };
});

import { NextRequest } from "next/server";
import { POST as weigh } from "@/app/api/barrels/weigh/route";
import { GET as register } from "@/app/api/barrels/register/route";

const post = (body: unknown) => new NextRequest("http://localhost/api/barrels/weigh", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const get = (qs = "") => new NextRequest(`http://localhost/api/barrels/register${qs}`);
const ago = (s: number) => new Date(Date.now() - s * 1000);
const days = (n: number) => new Date(Date.now() - n * 86_400_000);
const C1 = "R261010-1-01";
const C2 = "R261010-1-02";
const C3 = "R261010-1-03";

beforeEach(() => {
  db.user = { name: "Nilkant", role: "STAFF", isOwner: false };
  db.receipts = [{ id: "r1", lotNo: "R261010-1", status: "OPEN", date: "2026-10-10", supplierName: "Sri Balaji", product: "Sunflower oil", vehicleNo: "KA38A1", challanNo: "C-9", tankTarget: null, declaredNetKg: 540, declaredBarrels: 3, rateInrPerKg: 130, createdBy: "x" }];
  const base = { receiptId: "r1", declaredNetKg: 180, grossKg: null, grossAt: null, grossSource: null, emptyKg: null, emptyAt: null, emptySource: null };
  db.barrels = [
    { ...base, id: "b1", seq: 1, code: C1, grossKg: 192, grossAt: days(9), grossSource: "SCALE", grossBy: "A", emptyKg: 12, emptyAt: days(8), emptySource: "SCALE", emptyBy: "B" },
    { ...base, id: "b2", seq: 2, code: C2, grossKg: 191, grossAt: days(6), grossSource: "SCALE", grossBy: "A" },
    { ...base, id: "b3", seq: 3, code: C3 },
  ];
  db.ticks = [
    { id: "t1", source: "PLATFORM-1", weightKg: 190.6, settledAt: ago(20), usedAt: null },
    { id: "t2", source: "PLATFORM-1", weightKg: 12.4, settledAt: ago(8), usedAt: null },
  ];
  db.events = [{ barrelCode: C1, action: "GROSS", by: "A", at: days(9), detail: { kg: 192 } }];
});

describe("weigh time", () => {
  it("dates a scale weighing by the scale's settle time and keeps the save time separately", async () => {
    const res = await weigh(post({ code: C3, phase: "GROSS", source: "SCALE", tickId: "t1" }));
    expect(res.status).toBe(200);
    const b = db.barrels[2];
    expect(b.grossAt).toBe(db.ticks[0].settledAt);
    expect(Math.abs(b.grossRecordedAt.getTime() - Date.now())).toBeLessThan(5000);
  });
  it("empties a barrel days after it was weighed full", async () => {
    const res = await weigh(post({ code: C2, phase: "EMPTY", source: "SCALE", tickId: "t2" }));
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(j.barrel).toMatchObject({ grossKg: 191, emptyKg: 12.4, net: 178.6, state: "DONE" });
  });
  it("accepts a typed weight with its real time, and records that it was typed", async () => {
    const at = days(2).toISOString();
    const res = await weigh(post({ code: C3, phase: "GROSS", source: "MANUAL", kg: 190, weighedAt: at, note: "weighed at weighbridge" }));
    expect(res.status).toBe(200);
    expect(db.barrels[2]).toMatchObject({ grossKg: 190, grossSource: "MANUAL" });
    expect(db.barrels[2].grossAt.toISOString()).toBe(at);
    expect(db.events.at(-1)?.detail).toMatchObject({ weighedAt: at });
  });
  it("refuses a typed time in the future, too far back, or before the full weighing", async () => {
    const f = (weighedAt: string, code = C3, phase = "GROSS") => weigh(post({ code, phase, source: "MANUAL", kg: 12, weighedAt, note: "scale off" }));
    expect((await f(new Date(Date.now() + 3600_000).toISOString())).status).toBe(400);
    expect((await f(days(90).toISOString())).status).toBe(400);
    expect((await f(days(7).toISOString(), C2, "EMPTY")).status).toBe(400); // b2 was weighed full 6 days ago
    expect(db.barrels[1].emptyKg).toBeNull();
  });
  it("takes a scanned QR link as the barrel code", async () => {
    const res = await weigh(post({ code: `https://x.example/barrels?barrel=${C2}`, phase: "EMPTY", source: "SCALE", tickId: "t2" }));
    expect(res.status).toBe(200);
  });
});

describe("GET /api/barrels/register", () => {
  it("lists every barrel with gross, tare, net and waiting days", async () => {
    const j = await (await register(get("?status=all"))).json();
    expect(j.data.map((r: Row) => r.code)).toEqual([C1, C2, C3]);
    expect(j.data[0]).toMatchObject({ grossKg: 192, emptyKg: 12, netKg: 180, state: "DONE" });
    expect(j.data[1]).toMatchObject({ state: "FULL", waitingDays: 6, estNetKg: 179 });
    expect(j.totals).toMatchObject({ barrels: 3, waiting: 1, emptied: 1, netKg: 180 });
  });
  it("shows only the barrels still waiting, oldest first", async () => {
    const j = await (await register(get("?status=waiting"))).json();
    expect(j.data.map((r: Row) => r.code)).toEqual([C2]);
  });
  it("is blind for staff: no supplier figures, no history", async () => {
    const j = await (await register(get(`?code=${C1}`))).json();
    expect(j.isOwner).toBe(false);
    expect(j.data[0].declaredNetKg).toBeNull();
    expect(j.data[0].diffKg).toBeNull();
    expect(j.events).toEqual([]);
    expect(JSON.stringify(j)).not.toContain("130"); // the rate never leaves the server for staff
  });
  it("gives the owner the supplier figure, the difference and the barrel's history", async () => {
    db.user = { name: "Sahil", role: "OWNER", isOwner: true };
    const j = await (await register(get(`?code=${C1}`))).json();
    expect(j.data[0]).toMatchObject({ declaredNetKg: 180, diffKg: 0 });
    expect(j.events).toHaveLength(1);
  });
  it("finds a barrel from a scanned QR link, and rejects rubbish and anonymous callers", async () => {
    const j = await (await register(get(`?code=${encodeURIComponent(`https://x.example/barrels?barrel=${C2}`)}`))).json();
    expect(j.data.map((r: Row) => r.code)).toEqual([C2]);
    expect((await register(get("?code=hello"))).status).toBe(400);
    db.user = null;
    expect((await register(get())).status).toBe(401);
  });
});
