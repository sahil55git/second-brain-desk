// Mill Counter Desk: the small rules (which barrel is next, what a lot adds up to) and the whole receiving
// flow through the real routes — start a lot, weigh each barrel full (gross), then empty (tare), net = gross − tare —
// with a double tap and a re-used scale reading, to be sure there is exactly one lot, one weighing per phase,
// and one figure everywhere.
import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const db = vi.hoisted(() => ({ receipts: [] as Row[], barrels: [] as Row[], ticks: [] as Row[], events: [] as Row[], ops: [] as string[], user: { name: "Nilkant", role: "STAFF", isOwner: false } as Row | null }));

vi.mock("@/lib/registerServer", () => ({ getUser: async () => db.user, isValidDate: (d: unknown) => typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d) }));
vi.mock("@/lib/attachmentServer", () => ({ missingTable: () => false, TABLE_HINT: "run db push" }));
vi.mock("@/lib/db", () => {
  const withBarrels = (r: Row) => ({ ...r, barrels: db.barrels.filter((b) => b.receiptId === r.id).sort((a, b) => a.seq - b.seq) });
  const prisma = {
    clientOp: {
      create: async ({ data }: Row) => {
        if (db.ops.includes(data.id)) throw Object.assign(new Error("dup"), { code: "P2002" });
        db.ops.push(data.id);
        return data;
      },
      delete: async ({ where }: Row) => {
        db.ops = db.ops.filter((x) => x !== where.id);
      },
    },
    party: { findUnique: async () => null },
    oilReceipt: {
      count: async ({ where }: Row) => db.receipts.filter((r) => r.date === where.date).length,
      findMany: async ({ where }: Row) => db.receipts.filter((r) => !where?.status || r.status === where.status).map(withBarrels),
      findUnique: async ({ where }: Row) => {
        const r = db.receipts.find((x) => x.id === where.id);
        return r ? withBarrels(r) : null;
      },
      create: async ({ data }: Row) => {
        const { barrels, ...rest } = data;
        const r = { id: "r" + (db.receipts.length + 1), status: "OPEN", ...rest };
        db.receipts.push(r);
        for (const b of barrels.create as Row[]) db.barrels.push({ id: "b" + (db.barrels.length + 1), receiptId: r.id, grossKg: null, grossAt: null, grossSource: null, emptyKg: null, emptyAt: null, emptySource: null, declaredNetKg: null, ...b });
        return withBarrels(r);
      },
    },
    barrel: {
      findUnique: async ({ where }: Row) => {
        const b = db.barrels.find((x) => x.code === where.code);
        return b ? { ...b, receipt: db.receipts.find((r) => r.id === b.receiptId) } : null;
      },
      update: async ({ where, data }: Row) => Object.assign(db.barrels.find((b) => b.id === where.id)!, data),
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
    barrelEvent: { create: async ({ data }: Row) => db.events.push(data) },
    $transaction: async (fn: (tx: unknown) => unknown) => fn(prisma),
  };
  return { prisma, safeDbCall: async (fn: () => Promise<unknown>) => { try { return { ok: true, data: await fn() }; } catch (e) { return { ok: false, error: String(e) }; } } };
});

import { NextRequest } from "next/server";
import { GET as listLots, POST as newLot } from "@/app/api/barrels/route";
import { POST as weigh } from "@/app/api/barrels/weigh/route";
import { lotTotals, netOnDay, newClientId, nextBarrel, stepOf, waitingBarrels, weighProblem, weighResult, type CLot } from "@/lib/mill/millCounter";
import { pagesForPath } from "@/lib/access";

const post = (url: string, body: unknown) => new NextRequest(`http://localhost${url}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const get = (url: string) => new NextRequest(`http://localhost${url}`);
const ago = (s: number) => new Date(Date.now() - s * 1000);
const tick = (id: string, kg: number) => db.ticks.push({ id, source: "BT-ISCALE-S-18", weightKg: kg, settledAt: ago(5), usedAt: null });

beforeEach(() => {
  db.user = { name: "Nilkant", role: "STAFF", isOwner: false };
  db.receipts = [];
  db.barrels = [];
  db.ticks = [];
  db.events = [];
  db.ops = [];
});

describe("counter rules", () => {
  const b = (seq: number, g: number | null, e: number | null) => ({ seq, code: `R-1-${seq}`, grossKg: g, emptyKg: e });
  it("says what each barrel needs next", () => {
    expect(stepOf(b(1, null, null))).toBe("GROSS");
    expect(stepOf(b(1, 192, null))).toBe("EMPTY");
    expect(stepOf(b(1, 192, 12))).toBe("DONE");
  });
  it("picks the next barrel after this one, then wraps round", () => {
    const bs = [b(1, 192, 12), b(2, null, null), b(3, null, null), b(4, 190, null)];
    expect(nextBarrel(bs, 2, "GROSS")?.seq).toBe(3);
    expect(nextBarrel(bs, 3, "GROSS")?.seq).toBe(2); // wraps
    expect(nextBarrel(bs, 1, "EMPTY")?.seq).toBe(4);
    expect(nextBarrel([b(1, 192, 12)], 1, "EMPTY")).toBeNull();
  });
  it("adds up only barrels with both weights, so gross − tare = net", () => {
    const t = lotTotals([b(1, 192, 12), b(2, 190.5, 11.5), b(3, 188, null), b(4, null, null)]);
    expect(t).toMatchObject({ barrels: 4, fullWeighed: 3, done: 2, waiting: 1, notWeighed: 1, grossKg: 382.5, tareKg: 23.5, netKg: 359 });
    expect(t.grossKg - t.tareKg).toBe(t.netKg);
  });
  it("lists full barrels still waiting, oldest first, with days", () => {
    const now = Date.parse("2026-11-20T10:00:00Z");
    const lot: CLot = { id: "r1", lotNo: "R261118-1", date: "2026-11-18", supplierName: "S", product: "P", status: "OPEN", barrels: [{ ...b(1, 192, null), grossAt: "2026-11-18T05:00:00Z" }, { ...b(2, 190, 12), grossAt: "2026-11-18T05:10:00Z" }, { ...b(3, 191, null), grossAt: "2026-11-19T05:00:00Z" }] };
    const w = waitingBarrels([lot, { ...lot, id: "r2", status: "CLOSED" }], now);
    expect(w.map((x) => [x.seq, x.days])).toEqual([[1, 2], [3, 1]]);
    expect(netOnDay([lot], "2026-11-18")).toBe(178);
    expect(netOnDay([lot], "2026-11-19")).toBe(0);
  });
  it("uses the server's own weighing rules and words", () => {
    expect(weighProblem("EMPTY", 200, { grossKg: 192, emptyKg: null })).toMatch(/cannot weigh as much/);
    expect(weighProblem("EMPTY", 12, { grossKg: null, emptyKg: null })).toMatch(/full first/);
    expect(weighProblem("GROSS", 192, { grossKg: null, emptyKg: null })).toBeNull();
    expect(weighResult("EMPTY", 12, { grossKg: 192, emptyKg: 12 })).toBe("192 (full) − 12 (empty) = 180 kg oil");
  });
  it("makes client ids the server accepts", () => {
    for (let i = 0; i < 50; i++) expect(newClientId()).toMatch(/^c[a-z0-9]{6,30}$/);
  });
  it("needs the same page access as the barrel desk", () => {
    expect(pagesForPath("/mill/counter")).toEqual(["mfg", "stock"]);
    expect(pagesForPath("/mill")).toEqual(["jobwork", "mfg", "register"]);
  });
});

describe("receiving a lot through the real routes", () => {
  it("a double tap on Receive makes ONE lot with its barrels", async () => {
    const body = { clientId: "cabc123xyz", supplierName: "Sri Balaji", product: "Sunflower oil", barrelCount: 3, vehicleNo: "ka38 1234" };
    const a = await newLot(post("/api/barrels", body));
    const b = await newLot(post("/api/barrels", body));
    expect(a.status).toBe(201);
    expect((await b.json()).duplicate).toBe(true);
    expect(db.receipts).toHaveLength(1);
    expect(db.barrels).toHaveLength(3);
    expect(db.receipts[0].vehicleNo).toBe("KA38 1234");
    expect(db.barrels.map((x) => x.code)).toEqual(expect.arrayContaining([expect.stringMatching(/-01$/), expect.stringMatching(/-02$/), expect.stringMatching(/-03$/)]));
  });

  it("a failed save frees the id so the corrected try goes through", async () => {
    const bad = await newLot(post("/api/barrels", { clientId: "cretry00001", supplierName: "", product: "Sunflower oil", barrelCount: 2 }));
    expect(bad.status).toBe(400);
    const ok = await newLot(post("/api/barrels", { clientId: "cretry00002", supplierName: "Sri Balaji", product: "Sunflower oil", barrelCount: 2 }));
    expect(ok.status).toBe(201);
    expect(db.receipts).toHaveLength(1);
  });

  it("gross, then tare, gives the net; a reading works once; a repeat tap saves nothing twice", async () => {
    await newLot(post("/api/barrels", { clientId: "clot0000001", supplierName: "Sri Balaji", product: "Sunflower oil", barrelCount: 2 }));
    const code1 = db.barrels[0].code;
    tick("t1", 192.4);
    tick("t2", 12.3);
    tick("t3", 190);

    // full weight from the scale reading (the request's own kg is ignored)
    const g = await weigh(post("/api/barrels/weigh", { code: code1, phase: "GROSS", source: "SCALE", tickId: "t1", kg: 5, clientId: "cw00000001" }));
    expect(g.status).toBe(200);
    expect(db.barrels[0]).toMatchObject({ grossKg: 192.4, grossSource: "SCALE", grossScale: "BT-ISCALE-S-18" });
    // the same tap sent again (lost reply) is answered "already saved"
    const again = await weigh(post("/api/barrels/weigh", { code: code1, phase: "GROSS", source: "SCALE", tickId: "t1", kg: 5, clientId: "cw00000001" }));
    expect((await again.json()).duplicate).toBe(true);
    // the same reading cannot be used for another barrel
    const reuse = await weigh(post("/api/barrels/weigh", { code: db.barrels[1].code, phase: "GROSS", source: "SCALE", tickId: "t1", clientId: "cw00000002" }));
    expect(reuse.status).toBe(409);
    expect(db.barrels[1].grossKg).toBeNull();

    // empty weight later
    const e = await weigh(post("/api/barrels/weigh", { code: code1, phase: "EMPTY", source: "SCALE", tickId: "t2", clientId: "cw00000003" }));
    expect(e.status).toBe(200);
    const j = await e.json();
    expect(j.barrel.net).toBe(180.1);
    expect(db.barrels[0]).toMatchObject({ grossKg: 192.4, emptyKg: 12.3 });
    // an empty reading heavier than the full barrel is refused
    const bad = await weigh(post("/api/barrels/weigh", { code: db.barrels[1].code, phase: "EMPTY", source: "SCALE", tickId: "t3", clientId: "cw00000004" }));
    expect(bad.status).toBe(400);

    // what the counter screen lists is the same single record
    const list = await (await listLots(get("/api/barrels"))).json();
    expect(list.data).toHaveLength(1);
    const lot = list.data[0];
    expect(lotTotals(lot.barrels)).toMatchObject({ done: 1, grossKg: 192.4, tareKg: 12.3, netKg: 180.1 });
    expect(lot.summary.measuredNetKg).toBe(180.1);
    expect(db.events.filter((x) => x.action === "GROSS" || x.action === "EMPTY")).toHaveLength(2);
  });

  it("staff do not see the challan figures; the owner does", async () => {
    db.user = { name: "Sahil", role: "OWNER", isOwner: true };
    await newLot(post("/api/barrels", { clientId: "cowner00001", supplierName: "Sri Balaji", product: "Sunflower oil", barrelCount: 1, declaredNetKg: 180 }));
    expect((await (await listLots(get("/api/barrels"))).json()).data[0].declaredNetKg).toBe(180);
    db.user = { name: "Nilkant", role: "STAFF", isOwner: false };
    expect((await (await listLots(get("/api/barrels"))).json()).data[0].declaredNetKg).toBeNull();
  });
});
