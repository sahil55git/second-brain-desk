import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const db = vi.hoisted(() => ({ user: null as Row | null, setting: null as Row | null, opsTable: true }));

vi.mock("@prisma/client", () => ({ Prisma: {}, PrismaClient: class {} }));
vi.mock("@/lib/registerServer", async (orig) => ({ ...(await orig<typeof import("@/lib/registerServer")>()), getUser: async () => db.user }));
vi.mock("@/lib/hubData", () => ({
  loadHubData: async () => ({
    sales: [], purchases: [], expenses: [], jobWork: [], mfg: [], items: [], refunds: [], adjustments: [],
    register: [{ id: "r1", date: "2026-11-02", kind: "SALE", item: "sunflower", itemLabel: null, qty: 100, unit: "kg", amountInr: 1, paymentMode: "CASH", createdAt: new Date("2026-11-02T05:00:00Z") }],
    closings: [{ date: "2026-11-01", session: "NIGHT", stock: { sf: { today: 1000 } }, createdAt: new Date("2026-11-01T16:00:00Z") }],
  }),
}));
vi.mock("@/lib/db", () => ({
  prisma: {
    opsRecord: { findMany: async () => { if (!db.opsTable) throw new Error("no table"); return [{ id: "o1", kind: "pack_run", date: "2026-11-02", data: { oilKg: 50, fromTank: "Sunflower tank" }, createdAt: new Date("2026-11-02T06:00:00Z") }]; } },
    appSetting: { findUnique: async () => db.setting },
  },
  safeDbCall: async (fn: () => Promise<unknown>) => { try { return { ok: true, data: await fn() }; } catch (e) { return { ok: false, error: String(e) }; } },
}));

import { GET } from "@/app/api/stock-ledger/route";
const get = (q = "") => GET(new NextRequest(`http://x/api/stock-ledger${q}`));

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-03T06:00:00Z"));
  db.user = { name: "Counter", username: "counter", isOwner: false };
  db.setting = null;
  db.opsTable = true;
});
afterEach(() => {
  vi.useRealTimers();
});

describe("GET /api/stock-ledger", () => {
  it("needs a login and a sensible date", async () => {
    db.user = null;
    expect((await get()).status).toBe(401);
    db.user = { name: "x", isOwner: false };
    expect((await get("?asOf=tomorrow")).status).toBe(400);
    expect((await get("?asOf=2026-11-04")).status).toBe(400); // the future
  });
  it("gives one line per oil from counts, register, and packing runs, in the saved mode", async () => {
    db.setting = { data: { mode: "book" } };
    const j = await (await get("?asOf=2026-11-03")).json();
    const sf = j.data.rows.find((r: Row) => r.key === "sf");
    expect(sf).toMatchObject({ basis: "book", counted: { kg: 1000 }, outSinceKg: 150, carriedKg: 850, bookKg: 850, stockKg: 850, gapKg: 0 });
    expect(j.data.settings.mode).toBe("book");
    expect(j.isOwner).toBe(false);
    expect(j.days).toBeUndefined();
  });
  it("adds the day-by-day view for one oil, and still works without the operations table", async () => {
    db.opsTable = false;
    const j = await (await get("?asOf=2026-11-03&key=sf")).json();
    expect(j.data.rows.find((r: Row) => r.key === "sf").outSinceKg).toBe(100);
    expect(j.days.map((d: Row) => [d.date, d.outKg, d.countedKg])).toEqual([["2026-11-02", 100, null], ["2026-11-01", 0, 1000]]);
  });
});
