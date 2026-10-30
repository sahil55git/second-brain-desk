// Real route handlers against an in-memory database: owner-only, month-end posts once, advance taken off.
import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const db = vi.hoisted(() => ({ emps: [] as Row[], entries: [] as Row[], events: [] as Row[], user: { name: "Sahil", role: "OWNER", isOwner: true } as Row | null }));

vi.mock("@/lib/registerServer", () => ({ getUser: async () => db.user }));
vi.mock("@/lib/db", () => {
  const api = {
    employee: {
      findMany: async () => db.emps.filter((e) => e.active).map((e) => ({ ...e, entries: db.entries.filter((x) => x.employeeId === e.id && !x.voidedAt) })),
      findUnique: async ({ where }: Row) => db.emps.find((e) => e.id === where.id) ?? null,
    },
    employeeEntry: { create: async ({ data }: Row) => { const r = { id: `n${db.entries.length + 1}`, voidedAt: null, ...data }; db.entries.push(r); return r; } },
    employeeEvent: { create: async ({ data }: Row) => { db.events.push(data); return data; } },
  };
  return { prisma: { ...api, $transaction: async (fn: (t: unknown) => unknown) => fn(api) }, safeDbCall: async (fn: () => Promise<unknown>) => ({ ok: true, data: await fn() }) };
});

import { GET as payrollGet, POST as payrollPost } from "@/app/api/employees/payroll/route";
import { POST as addEntry } from "@/app/api/employees/[id]/entries/route";

const req = (url: string, body?: unknown) => new Request(url, { method: body ? "POST" : "GET", body: body ? JSON.stringify(body) : undefined }) as never;
const nextReq = (url: string, body?: unknown) => Object.assign(req(url, body), { nextUrl: new URL(url) });

beforeEach(() => {
  db.user = { name: "Sahil", role: "OWNER", isOwner: true };
  db.emps = [{ id: "e1", name: "Ram", role: "Counter", monthlySalaryInr: 15000, active: true }];
  db.entries = [];
  db.events = [];
});

describe("employee routes", () => {
  it("staff and signed-out users cannot touch it", async () => {
    db.user = { name: "Nilkant", role: "STAFF", isOwner: false };
    expect((await payrollGet(nextReq("http://x/api/employees/payroll?month=2026-10"))).status).toBe(403);
    db.user = null;
    expect((await addEntry(nextReq("http://x/e", { type: "ADV", amountInr: 100 }), { params: { id: "e1" } })).status).toBe(401);
  });
  it("an advance is a debit and makes the balance negative", async () => {
    const r = await addEntry(nextReq("http://x/e", { type: "ADV", amountInr: 4000, date: "2026-10-05" }), { params: { id: "e1" } });
    expect(r.status).toBe(200);
    expect(db.entries[0]).toMatchObject({ type: "ADV", debitInr: 4000, creditInr: 0, month: "2026-10" });
    expect(db.events[0].action).toBe("ADD");
  });
  it("month-end: salary earned, advance taken off, paid once only", async () => {
    await addEntry(nextReq("http://x/e", { type: "ADV", amountInr: 4000, date: "2026-10-05" }), { params: { id: "e1" } });
    const body = { month: "2026-10", rows: [{ employeeId: "e1", days: 30 }] };
    const r1 = await (await payrollPost(nextReq("http://x/p", body))).json();
    expect(r1.done[0]).toMatchObject({ earnedInr: 15000, paidInr: 11000, advanceRecoveredInr: 4000 });
    const live = db.entries.reduce((a, x) => a + x.creditInr - x.debitInr, 0);
    expect(live).toBe(0);
    const r2 = await (await payrollPost(nextReq("http://x/p", body))).json();
    expect(r2.done).toHaveLength(0);
    expect(r2.skipped[0].reason).toMatch(/already posted/);
    expect(db.entries.filter((x) => x.type === "EARN")).toHaveLength(1);
  });
  it("typed advance bigger than salary leaves an advance and pays nothing", async () => {
    await addEntry(nextReq("http://x/e", { type: "ADV", amountInr: 20000, date: "2026-10-05" }), { params: { id: "e1" } });
    const r = await (await payrollPost(nextReq("http://x/p", { month: "2026-10", rows: [{ employeeId: "e1", days: 30 }] }))).json();
    expect(r.done[0]).toMatchObject({ paidInr: 0, carryForwardInr: -5000 });
    expect(db.entries.some((x) => x.type === "PAY")).toBe(false);
  });
});
