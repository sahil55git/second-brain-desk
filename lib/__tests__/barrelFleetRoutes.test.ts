// Runs the real fleet route handlers against an in-memory stand-in for the database, to check the rules
// end to end: tare set once, scale reading used once, owner-only changes, oil-loss flag, ledger rows.
import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const db = vi.hoisted(() => ({ barrels: [] as Row[], events: [] as Row[], ticks: [] as Row[], user: { name: "Nilkant", role: "STAFF", isOwner: false } as Row | null }));

vi.mock("@/lib/registerServer", () => ({
  getUser: async () => db.user,
  isValidDate: (d: unknown) => typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d),
  dayRange: (d: string) => ({ start: new Date(`${d}T00:00:00+05:30`), end: new Date(new Date(`${d}T00:00:00+05:30`).getTime() + 86_400_000) }),
}));
vi.mock("@/lib/attachmentServer", () => ({ missingTable: () => false, TABLE_HINT: "run db push" }));
vi.mock("@/lib/db", () => {
  let seq = 0;
  const prisma = {
    fleetBarrel: {
      findUnique: async ({ where }: Row) => db.barrels.find((b) => (where.code ? b.code === where.code : b.id === where.id)) ?? null,
      findMany: async () => [...db.barrels].sort((a, b) => a.code.localeCompare(b.code)),
      create: async ({ data }: Row) => {
        if (db.barrels.some((b) => b.code === data.code)) throw Object.assign(new Error("dup"), { code: "P2002" });
        const b = { id: `b${++seq}`, status: "NEW", capacityKg: 190, tareKg: null, tareAt: null, tareBy: null, product: null, grossKg: null, grossAt: null, netKg: null, lastGrossDiffKg: null, lastEmptyKg: null, lastEmptyAt: null, location: "SHOP", holder: null, sinceAt: new Date(), condition: "OK", notes: null, active: true, ...data };
        db.barrels.push(b);
        return b;
      },
      update: async ({ where, data }: Row) => Object.assign(db.barrels.find((b) => b.id === where.id)!, data),
    },
    fleetEvent: {
      create: async ({ data }: Row) => {
        const e = { id: `e${db.events.length + 1}`, recordedAt: new Date(), ...data };
        db.events.push(e);
        return e;
      },
      findMany: async ({ where = {} }: Row = {}) =>
        db.events
          .filter((e) => (where.barrelCode ? e.barrelCode === where.barrelCode : true) && (where.barrelId ? e.barrelId === where.barrelId : true) && (where.party?.not === null ? e.party != null : true))
          .sort((a, b) => +new Date(b.at) - +new Date(a.at)),
      findUnique: async ({ where }: Row) => db.events.find((e) => e.id === where.id) ?? null,
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
    $transaction: async (fn: (tx: unknown) => unknown) => fn(prisma),
  };
  return { prisma, safeDbCall: async (fn: () => Promise<unknown>) => { try { return { ok: true, data: await fn() }; } catch (e) { return { ok: false, error: String(e) }; } } };
});

import { NextRequest } from "next/server";
import { GET as list, POST as register } from "@/app/api/barrel-fleet/route";
import { POST as weigh } from "@/app/api/barrel-fleet/weigh/route";
import { POST as move } from "@/app/api/barrel-fleet/move/route";
import { PATCH as edit } from "@/app/api/barrel-fleet/[code]/route";
import { GET as ledger } from "@/app/api/barrel-fleet/events/route";

const req = (url: string, method: string, body?: unknown) =>
  new NextRequest(`http://localhost${url}`, { method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
const ago = (s: number) => new Date(Date.now() - s * 1000);
const tick = (id: string, kg: number, age = 10) => db.ticks.push({ id, source: "PLATFORM-1", weightKg: kg, settledAt: ago(age), usedAt: null });
const owner = () => (db.user = { name: "Sahil", role: "OWNER", isOwner: true });
const staff = () => (db.user = { name: "Nilkant", role: "STAFF", isOwner: false });
const w = (body: Row) => weigh(req("/api/barrel-fleet/weigh", "POST", { source: "SCALE", ...body }));
const barrel = (code: string) => db.barrels.find((b) => b.code === code)!;

beforeEach(() => {
  staff();
  db.barrels = [];
  db.events = [];
  db.ticks = [];
});

async function twoBarrels() {
  owner();
  await register(req("/api/barrel-fleet", "POST", { count: 2 }));
  staff();
}

describe("register", () => {
  it("owner registers BRL-01..03 and each gets a REGISTER row; staff cannot", async () => {
    staff();
    expect((await register(req("/api/barrel-fleet", "POST", { count: 3 }))).status).toBe(403);
    owner();
    const res = await register(req("/api/barrel-fleet", "POST", { count: 3 }));
    expect(res.status).toBe(201);
    expect(db.barrels.map((b) => b.code)).toEqual(["BRL-01", "BRL-02", "BRL-03"]);
    expect(db.barrels[0]).toMatchObject({ capacityKg: 190, status: "NEW", tareKg: null });
    expect(db.events.filter((e) => e.action === "REGISTER")).toHaveLength(3);
    const more = await register(req("/api/barrel-fleet", "POST", { count: 1 }));
    expect((await more.json()).data[0].code).toBe("BRL-04");
  });
  it("lists barrels with a summary", async () => {
    await twoBarrels();
    const j = await (await list(req("/api/barrel-fleet", "GET"))).json();
    expect(j.data).toHaveLength(2);
    expect(j.summary).toMatchObject({ barrels: 2, noTare: 2 });
  });
});

describe("weigh", () => {
  it("first empty weight sets the tare from the scale, not from the request", async () => {
    await twoBarrels();
    tick("t1", 12.4);
    const res = await w({ code: "BRL-01", phase: "EMPTY", tickId: "t1", kg: 5 });
    expect(res.status).toBe(200);
    expect((await res.json()).kg).toBe(12.4);
    expect(barrel("BRL-01")).toMatchObject({ tareKg: 12.4, status: "EMPTY", tareBy: "Nilkant", lastEmptyKg: 12.4 });
    expect(db.events.at(-1)).toMatchObject({ action: "EMPTY", kg: 12.4, tareKg: 12.4, source: "SCALE", scale: "PLATFORM-1" });
    expect(db.events.at(-1)!.detail.setsTare).toBe(true);
  });

  it("a scale reading works once only", async () => {
    await twoBarrels();
    tick("t1", 12.4);
    expect((await w({ code: "BRL-01", phase: "EMPTY", tickId: "t1" })).status).toBe(200);
    const again = await w({ code: "BRL-02", phase: "EMPTY", tickId: "t1" });
    expect(again.status).toBe(409);
    expect(barrel("BRL-02").tareKg).toBeNull();
  });

  it("an old reading is refused", async () => {
    await twoBarrels();
    tick("t1", 12.4, 400);
    expect((await w({ code: "BRL-01", phase: "EMPTY", tickId: "t1" })).status).toBe(409);
  });

  it("a full weight needs a tare and a chosen oil; net = gross − tare", async () => {
    await twoBarrels();
    tick("t1", 192.4);
    const noTare = await w({ code: "BRL-01", phase: "GROSS", tickId: "t1", product: "Sunflower oil" });
    expect(noTare.status).toBe(400);
    expect((await noTare.json()).error).toMatch(/no tare yet/);
    expect(db.ticks[0].usedAt).toBeFalsy(); // a refused weighing does not burn the scale reading

    tick("t0", 12.4);
    await w({ code: "BRL-01", phase: "EMPTY", tickId: "t0" });
    const noOil = await w({ code: "BRL-01", phase: "GROSS", tickId: "t1" });
    expect((await noOil.json()).error).toMatch(/Choose which oil/);

    const ok = await w({ code: "BRL-01", phase: "GROSS", tickId: "t1", product: "Sunflower oil" });
    const j = await ok.json();
    expect(j.net).toBe(180);
    expect(barrel("BRL-01")).toMatchObject({ status: "FULL", product: "Sunflower oil", grossKg: 192.4, netKg: 180 });
  });

  it("weighing a full barrel again shows oil lost since the last full weight", async () => {
    await twoBarrels();
    tick("a", 12.4);
    await w({ code: "BRL-01", phase: "EMPTY", tickId: "a" });
    tick("b", 192.4);
    await w({ code: "BRL-01", phase: "GROSS", tickId: "b", product: "Sunflower oil" });
    tick("c", 189.1);
    const j = await (await w({ code: "BRL-01", phase: "GROSS", tickId: "c", product: "Sunflower oil" })).json();
    expect(barrel("BRL-01").lastGrossDiffKg).toBe(-3.3);
    expect(j.data.flags.map((f: Row) => f.code)).toContain("OIL_LOST");
    expect(db.events.at(-1)!.detail).toMatchObject({ prevGrossKg: 192.4, diffKg: -3.3 });
  });

  it("emptying a full barrel records the oil poured out and the drift from the tare", async () => {
    await twoBarrels();
    tick("a", 12.4);
    await w({ code: "BRL-01", phase: "EMPTY", tickId: "a" });
    tick("b", 192.4);
    await w({ code: "BRL-01", phase: "GROSS", tickId: "b", product: "Sunflower oil" });
    tick("c", 13.9);
    const j = await (await w({ code: "BRL-01", phase: "EMPTY", tickId: "c" })).json();
    expect(j.net).toBe(178.5); // 192.4 − 13.9 poured
    expect(db.events.at(-1)!.detail).toMatchObject({ driftKg: 1.5, pouredKg: 178.5, setsTare: false });
    expect(barrel("BRL-01")).toMatchObject({ tareKg: 12.4, status: "EMPTY", product: null, netKg: null }); // tare is not silently changed
    expect(j.data.flags.map((f: Row) => f.code)).toContain("TARE_DRIFT");
  });

  it("a typed weight needs a reason and is marked MANUAL", async () => {
    await twoBarrels();
    const noWhy = await w({ code: "BRL-01", phase: "EMPTY", source: "MANUAL", kg: 12.4 });
    expect(noWhy.status).toBe(400);
    const ok = await w({ code: "BRL-01", phase: "EMPTY", source: "MANUAL", kg: 12.4, note: "Scale not working" });
    expect(ok.status).toBe(200);
    expect(db.events.at(-1)).toMatchObject({ source: "MANUAL", note: "Scale not working" });
  });

  it("only the owner can change an existing tare, and must say why", async () => {
    await twoBarrels();
    tick("a", 12.4);
    await w({ code: "BRL-01", phase: "EMPTY", tickId: "a" });
    tick("b", 13.2);
    const byStaff = await w({ code: "BRL-01", phase: "EMPTY", tickId: "b", setTare: true, note: "new dent" });
    expect(byStaff.status).toBe(403);
    owner();
    const noWhy = await w({ code: "BRL-01", phase: "EMPTY", tickId: "b", setTare: true });
    expect(noWhy.status).toBe(400);
    const ok = await w({ code: "BRL-01", phase: "EMPTY", tickId: "b", setTare: true, note: "new dent" });
    expect(ok.status).toBe(200);
    expect(barrel("BRL-01").tareKg).toBe(13.2);
    expect(db.events.at(-1)!.detail).toMatchObject({ setsTare: true, previousTareKg: 12.4 });
  });

  it("refuses unknown or foreign labels", async () => {
    await twoBarrels();
    tick("a", 12.4);
    expect((await w({ code: "R261010-1-03", phase: "EMPTY", tickId: "a" })).status).toBe(400);
    expect((await w({ code: "BRL-09", phase: "EMPTY", tickId: "a" })).status).toBe(404);
  });
});

describe("move", () => {
  async function fullBarrel() {
    await twoBarrels();
    tick("a", 12.4);
    await w({ code: "BRL-01", phase: "EMPTY", tickId: "a" });
    tick("b", 192.4);
    await w({ code: "BRL-01", phase: "GROSS", tickId: "b", product: "Sunflower oil" });
  }

  it("sending out needs a name; the ledger row copies what left the shop", async () => {
    await fullBarrel();
    const noName = await move(req("/api/barrel-fleet/move", "POST", { code: "BRL-01", to: "CUSTOMER", purpose: "SALE" }));
    expect(noName.status).toBe(400);
    const ok = await move(req("/api/barrel-fleet/move", "POST", { code: "BRL-01", to: "CUSTOMER", holder: "Ravi Stores", purpose: "SALE", ref: "INV-114", vehicleNo: "ka 38 b 1234" }));
    expect(ok.status).toBe(200);
    expect(barrel("BRL-01")).toMatchObject({ location: "CUSTOMER", holder: "Ravi Stores" });
    expect(db.events.at(-1)).toMatchObject({ action: "MOVE", fromLoc: "SHOP", toLoc: "CUSTOMER", party: "Ravi Stores", purpose: "SALE", ref: "INV-114", vehicleNo: "KA 38 B 1234", kg: 192.4, tareKg: 12.4, netKg: 180, product: "Sunflower oil" });
  });

  it("bringing it back to the shop clears the holder", async () => {
    await fullBarrel();
    await move(req("/api/barrel-fleet/move", "POST", { code: "BRL-01", to: "CUSTOMER", holder: "Ravi Stores" }));
    const back = await move(req("/api/barrel-fleet/move", "POST", { code: "BRL-01", to: "SHOP" }));
    expect(back.status).toBe(200);
    expect(barrel("BRL-01")).toMatchObject({ location: "SHOP", holder: null });
  });

  it("a leaking barrel with oil in it cannot go out", async () => {
    await fullBarrel();
    await edit(req("/api/barrel-fleet/BRL-01", "PATCH", { condition: "LEAKING" }), { params: { code: "BRL-01" } });
    const res = await move(req("/api/barrel-fleet/move", "POST", { code: "BRL-01", to: "CUSTOMER", holder: "Ravi Stores" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/LEAKING/);
  });
});

describe("edit", () => {
  it("staff can report a dent but cannot clear it, retire a barrel or change capacity", async () => {
    await twoBarrels();
    const p = (body: Row) => edit(req("/api/barrel-fleet/BRL-01", "PATCH", body), { params: { code: "BRL-01" } });
    expect((await p({ condition: "DENTED" })).status).toBe(200);
    expect((await p({ condition: "OK" })).status).toBe(403);
    expect((await p({ active: false })).status).toBe(403);
    expect((await p({ capacityKg: 200 })).status).toBe(403);
  });
  it("the owner clears it with a reason and can retire a barrel", async () => {
    await twoBarrels();
    const p = (body: Row) => edit(req("/api/barrel-fleet/BRL-01", "PATCH", body), { params: { code: "BRL-01" } });
    await p({ condition: "DENTED" });
    owner();
    expect((await p({ condition: "OK" })).status).toBe(400); // reason missing
    expect((await p({ condition: "OK", note: "dent hammered out" })).status).toBe(200);
    expect((await p({ active: false, note: "scrapped" })).status).toBe(200);
    expect(barrel("BRL-01")).toMatchObject({ active: false, condition: "RETIRED" });
    tick("a", 12.4);
    const res = await w({ code: "BRL-01", phase: "EMPTY", tickId: "a" });
    expect((await res.json()).error).toMatch(/retired/);
  });
});

describe("ledger", () => {
  it("filters by barrel and returns the rows newest first", async () => {
    await twoBarrels();
    tick("a", 12.4);
    await w({ code: "BRL-01", phase: "EMPTY", tickId: "a" });
    await move(req("/api/barrel-fleet/move", "POST", { code: "BRL-01", to: "CUSTOMER", holder: "Ravi Stores" }));
    const j = await (await ledger(req("/api/barrel-fleet/events?code=BRL-01", "GET"))).json();
    expect(j.data.every((e: Row) => e.barrelCode === "BRL-01")).toBe(true);
    expect(j.data.map((e: Row) => e.action)).toEqual(expect.arrayContaining(["REGISTER", "EMPTY", "MOVE"]));
    const bad = await ledger(req("/api/barrel-fleet/events?code=XYZ", "GET"));
    expect(bad.status).toBe(400);
  });
});
