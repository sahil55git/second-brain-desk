// Spec C: the payables and khali-sales routes are owner-only and read the right records.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const db = vi.hoisted(() => ({ user: null as Row | null, bills: [] as Row[], entries: [] as Row[], parties: [] as Row[] }));

vi.mock("@prisma/client", () => ({ Prisma: {}, PrismaClient: class {} }));
vi.mock("@/lib/registerServer", async (orig) => {
  const actual = await orig<typeof import("@/lib/registerServer")>();
  return { ...actual, getUser: async () => db.user };
});
vi.mock("@/lib/db", () => {
  const match = (r: Row, where: Row) =>
    Object.entries(where).every(([k, v]) => (v && typeof v === "object" ? (v.gte === undefined || r[k] >= v.gte) && (v.lte === undefined || r[k] <= v.lte) : r[k] === v));
  const prisma = {
    purchaseBill: { findMany: async ({ where }: Row) => db.bills.filter((r) => match(r, where)) },
    registerEntry: { findMany: async ({ where }: Row) => db.entries.filter((r) => match(r, where)) },
    party: { findMany: async () => db.parties },
  };
  return { prisma, safeDbCall: async (fn: () => Promise<unknown>) => ({ ok: true, data: await fn() }) };
});

import { GET as payablesGET } from "@/app/api/payables/route";
import { GET as khaliGET } from "@/app/api/khali-sales/route";

const req = (url: string) => new NextRequest(`http://x${url}`);
const owner = { name: "Sahil", username: "sahil", isOwner: true };
const staff = { name: "Counter", username: "counter", isOwner: false };

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-30T06:00:00Z"));
  db.user = owner;
  db.parties = [{ id: "p1", name: "Basava Traders" }];
  db.bills = [
    { id: "b1", billNo: "A-17", date: "2026-11-01", totalInr: 50000, partyId: "p1", paymentMode: "CREDIT" },
    { id: "b2", billNo: "A-18", date: "2026-11-20", totalInr: 9999, partyId: "p1", paymentMode: "CASH" }, // paid on the spot: not owed
  ];
  db.entries = [
    { id: "e1", kind: "PURCHASE", paymentMode: "CREDIT", item: "seed", itemLabel: null, date: "2026-11-25", amountInr: 20000, partyId: null, partyName: "basava traders" },
    { id: "e2", kind: "PURCHASE", paymentMode: "CASH", item: "seed", itemLabel: null, date: "2026-11-26", amountInr: 7777, partyId: "p1", partyName: "Basava Traders" },
    { id: "e3", kind: "PAYMENT", paymentMode: "CASH", item: "supplier", itemLabel: null, date: "2026-11-10", amountInr: 30000, partyId: "p1", partyName: "Basava Traders" },
    { id: "e4", kind: "PAYMENT", paymentMode: "CASH", item: "salary", itemLabel: null, date: "2026-11-10", amountInr: 8000, partyId: null, partyName: "Basava Traders" }, // salary is not a supplier payment
    { id: "k1", kind: "SALE", item: "cake", date: "2026-11-12", qty: 1000, unit: "kg", rateInr: 32, amountInr: 32000, paymentMode: "BANK", partyName: "Feed Mill", notes: null },
    { id: "k2", kind: "SALE", item: "cake", date: "2026-09-01", qty: 500, unit: "kg", rateInr: 30, amountInr: 15000, paymentMode: "CASH", partyName: "Feed Mill", notes: null },
    { id: "s1", kind: "SALE", item: "karadi", date: "2026-11-12", qty: 5, unit: "kg", rateInr: 300, amountInr: 1500, paymentMode: "CASH", partyName: null, notes: null },
  ];
});

afterEach(() => {
  vi.useRealTimers();
});

describe("GET /api/payables", () => {
  it("is closed to a signed-out visitor and to staff", async () => {
    db.user = null;
    expect((await payablesGET(req("/api/payables"))).status).toBe(401);
    db.user = staff;
    expect((await payablesGET(req("/api/payables"))).status).toBe(403);
  });
  it("adds credit bills and credit register purchases, minus supplier payments only", async () => {
    const res = await payablesGET(req("/api/payables"));
    expect(res.status).toBe(200);
    const { data, today } = await res.json();
    expect(today).toBe("2026-11-30");
    expect(data.suppliers).toHaveLength(1);
    expect(data.suppliers[0]).toMatchObject({ name: "Basava Traders", billedInr: 70000, paidInr: 30000, owedInr: 40000, status: "late" });
    expect(data.suppliers[0].openBills.map((b: Row) => [b.ref, b.remainingInr, b.source])).toEqual([["A-17", 20000, "bill"], ["seed", 20000, "register"]]);
  });
});

describe("GET /api/khali-sales", () => {
  it("is closed to a signed-out visitor and to staff", async () => {
    db.user = null;
    expect((await khaliGET(req("/api/khali-sales?from=2026-11-01&to=2026-11-30"))).status).toBe(401);
    db.user = staff;
    expect((await khaliGET(req("/api/khali-sales?from=2026-11-01&to=2026-11-30"))).status).toBe(403);
  });
  it("needs a valid date range", async () => {
    expect((await khaliGET(req("/api/khali-sales"))).status).toBe(400);
    expect((await khaliGET(req("/api/khali-sales?from=2026-11-30&to=2026-11-01"))).status).toBe(400);
  });
  it("returns only oil cake sales inside the dates", async () => {
    const { data } = await (await khaliGET(req("/api/khali-sales?from=2026-11-01&to=2026-11-30"))).json();
    expect(data.rows.map((r: Row) => r.id)).toEqual(["k1"]);
    expect(data).toMatchObject({ kg: 1000, amountInr: 32000, avgRateInr: 32 });
  });
});
