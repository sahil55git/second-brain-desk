// Spec A: the real route handlers against an in-memory database. Checks the
// 401 / 403 / 200 paths of every guarded route, that each change writes exactly
// one AuditLog row holding the whole record, and the job-work pay-once rules.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const db = vi.hoisted(() => ({
  user: null as Record<string, any> | null, // eslint-disable-line @typescript-eslint/no-explicit-any
  expenses: [] as Record<string, any>[], // eslint-disable-line @typescript-eslint/no-explicit-any
  invoices: [] as Record<string, any>[], // eslint-disable-line @typescript-eslint/no-explicit-any
  bills: [] as Record<string, any>[], // eslint-disable-line @typescript-eslint/no-explicit-any
  parties: [] as Record<string, any>[], // eslint-disable-line @typescript-eslint/no-explicit-any
  items: [] as Record<string, any>[], // eslint-disable-line @typescript-eslint/no-explicit-any
  closings: [] as Record<string, any>[], // eslint-disable-line @typescript-eslint/no-explicit-any
  jobs: [] as Record<string, any>[], // eslint-disable-line @typescript-eslint/no-explicit-any
  audit: [] as Record<string, any>[], // eslint-disable-line @typescript-eslint/no-explicit-any
  beforeClaim: null as null | (() => void),
}));

vi.mock("@prisma/client", () => ({ Prisma: { JsonNull: "JsonNull" }, PrismaClient: class {} }));
vi.mock("@/lib/registerServer", async (orig) => {
  const actual = await orig<typeof import("@/lib/registerServer")>();
  return { ...actual, getUser: async () => db.user };
});
vi.mock("@/lib/ownerGuard", () => ({
  requireOwner: async () =>
    !db.user
      ? { ok: false, status: 401, error: "Not signed in." }
      : !db.user.isOwner
        ? { ok: false, status: 403, error: "Owner access required." }
        : { ok: true, username: db.user.name },
}));
vi.mock("@/lib/db", () => {
  const find = (rows: Row[], id: string) => rows.find((r) => r.id === id) ?? null;
  const copy = <T,>(v: T): T => structuredClone(v);
  const gone = () => new Error("Record does not exist.");
  const remove = (rows: Row[], id: string) => {
    const i = rows.findIndex((r) => r.id === id);
    if (i < 0) throw gone();
    return rows.splice(i, 1)[0];
  };
  const change = (rows: Row[], { where, data }: Row) => {
    const r = find(rows, where.id);
    if (!r) throw gone();
    Object.assign(r, data);
    return copy(r);
  };
  const api = {
    expense: {
      findUnique: async ({ where }: Row) => copy(find(db.expenses, where.id)),
      delete: async ({ where }: Row) => remove(db.expenses, where.id),
    },
    salesInvoice: {
      findUnique: async ({ where }: Row) => copy(find(db.invoices, where.id)),
      delete: async ({ where }: Row) => remove(db.invoices, where.id),
    },
    purchaseBill: {
      findUnique: async ({ where }: Row) => copy(find(db.bills, where.id)),
      delete: async ({ where }: Row) => remove(db.bills, where.id),
    },
    party: {
      findUnique: async ({ where }: Row) => copy(find(db.parties, where.id)),
      update: async (args: Row) => change(db.parties, args),
    },
    item: {
      create: async ({ data }: Row) => {
        const r = { id: `item${db.items.length + 1}`, active: true, ...data };
        db.items.push(r);
        return copy(r);
      },
      findUnique: async ({ where }: Row) => copy(find(db.items, where.id)),
      update: async (args: Row) => change(db.items, args),
    },
    dailyClosing: {
      findUniqueOrThrow: async ({ where }: Row) => {
        const r = find(db.closings, where.id);
        if (!r) throw gone();
        return copy(r);
      },
      findMany: async () => [],
      update: async (args: Row) => change(db.closings, args),
    },
    jobWorkIntake: {
      findUnique: async ({ where }: Row) => copy(find(db.jobs, where.id)),
      findUniqueOrThrow: async ({ where }: Row) => {
        const r = find(db.jobs, where.id);
        if (!r) throw gone();
        return copy(r);
      },
      updateMany: async ({ where, data }: Row) => {
        db.beforeClaim?.();
        const r = find(db.jobs, where.id);
        if (!r || (where.settled !== undefined && r.settled !== where.settled)) return { count: 0 };
        Object.assign(r, data);
        return { count: 1 };
      },
    },
    auditLog: {
      create: async ({ data }: Row) => {
        const r = { id: `a${db.audit.length + 1}`, at: new Date(), ...data };
        db.audit.push(r);
        return r;
      },
      findMany: async ({ where, take }: Row) =>
        db.audit
          .filter((r) => (!where.entity || r.entity === where.entity) && (!where.at || ((!where.at.gte || r.at >= where.at.gte) && (!where.at.lt || r.at < where.at.lt))))
          .sort((a, b) => b.at.getTime() - a.at.getTime())
          .slice(0, take),
    },
  };
  return {
    prisma: { ...api, $transaction: async (fn: (t: unknown) => unknown) => fn(api) },
    safeDbCall: async (fn: () => Promise<unknown>) => {
      try {
        return { ok: true, data: await fn() };
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : "db error" };
      }
    },
  };
});

import { DELETE as deleteSale } from "@/app/api/sales/[id]/route";
import { DELETE as deleteBill } from "@/app/api/purchases/[id]/route";
import { DELETE as deleteExpense } from "@/app/api/expenses/[id]/route";
import { PATCH as patchParty, DELETE as deleteParty } from "@/app/api/parties/[id]/route";
import { POST as postItem } from "@/app/api/items/route";
import { PATCH as patchItem, DELETE as deleteItem } from "@/app/api/items/[id]/route";
import { PATCH as patchClosing } from "@/app/api/daily-closing/[id]/route";
import { PATCH as patchJob } from "@/app/api/job-work/[id]/route";
import { POST as settleJob } from "@/app/api/job-work/[id]/settle/route";
import { GET as getAudit } from "@/app/api/audit/route";
import { STANDARD_RATE } from "@/lib/calculations";
import { pagesForPath } from "@/lib/access";

const TODAY = "2026-11-10";
const YESTERDAY = "2026-11-09";
const owner = { name: "Sahil", role: "OWNER", isOwner: true };
const staff = { name: "Nilkant", role: "STAFF", isOwner: false };

const send = (method: string, body?: unknown) =>
  new Request("http://x/api", { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) }) as never;
const get = (url: string) => Object.assign(new Request(url) as object, { nextUrl: new URL(url) }) as never;
const ctx = (id: string) => ({ params: { id } });

const mkJob = (o: Row = {}): Row => ({
  id: "j1",
  customer: "Ramesh",
  vehicleNo: null,
  seedKg: 100,
  cakeOwnership: "SHOP",
  advanceCustomerInr: 0,
  advanceAutoInr: 0,
  cans: null,
  notes: null,
  settled: false,
  settlementCustomerInr: null,
  settlementAutoInr: null,
  settlementRatePerKg: null,
  settlementAmountInr: null,
  settledAt: null,
  createdAt: new Date("2026-11-10T05:00:00Z"), // 10:30 am on 10 Nov in India
  ...o,
});

beforeAll(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-10T10:00:00Z")); // 3:30 pm on 10 Nov in India
});
afterAll(() => {
  vi.useRealTimers();
});

beforeEach(() => {
  db.user = staff;
  db.beforeClaim = null;
  db.audit = [];
  db.expenses = [
    { id: "x_today", date: TODAY, category: "Tea", amountInr: 40 },
    { id: "x_old", date: YESTERDAY, category: "Transport", amountInr: 900 },
  ];
  db.invoices = [
    {
      id: "inv1",
      invoiceNo: "INV-0412",
      date: YESTERDAY,
      totalInr: 4250,
      party: { id: "p1", name: "Suresh" },
      lineItems: [
        { id: "l1", name: "Sunflower oil", qty: 10, rateInr: 100 },
        { id: "l2", name: "Groundnut oil", qty: 25, rateInr: 130 },
      ],
      returns: [],
    },
  ];
  db.bills = [
    { id: "b1", billNo: "S-77", date: YESTERDAY, totalInr: 18000, party: { id: "p2", name: "Siddhi Agro" }, lineItems: [{ id: "bl1", name: "Soya oil", qty: 100, rateInr: 180 }] },
  ];
  db.parties = [{ id: "p1", name: "Suresh", phone: null, active: true }];
  db.items = [{ id: "i1", name: "Sunflower oil", unit: "kg", active: true }];
  db.closings = [
    { id: "c_today", date: TODAY, session: "EVENING", cashInOpening: 1000, cashInSales: 500, cashInOther: 0, cashOutGrn: 0, cashOutExpenses: 100, cashOutSalary: 0, cashOutUpi: 0, cashOutDraw: 0, cashOutOther: 0, counterCashInr: 1400, stock: null, createdAt: new Date("2026-11-10T08:00:00Z") },
    { id: "c_old", date: YESTERDAY, session: "EVENING", cashInOpening: 1000, cashInSales: 500, cashInOther: 0, cashOutGrn: 0, cashOutExpenses: 100, cashOutSalary: 0, cashOutUpi: 0, cashOutDraw: 0, cashOutOther: 0, counterCashInr: 1400, stock: null, createdAt: new Date("2026-11-09T08:00:00Z") },
  ];
  db.jobs = [mkJob()];
});

const json = async (r: Response) => r.json();

describe("expenses DELETE", () => {
  it("signed-out gets 401 and nothing changes", async () => {
    db.user = null;
    expect((await deleteExpense(send("DELETE"), ctx("x_today"))).status).toBe(401);
    expect(db.expenses).toHaveLength(2);
    expect(db.audit).toHaveLength(0);
  });
  it("staff cannot delete yesterday's expense (403)", async () => {
    const r = await deleteExpense(send("DELETE"), ctx("x_old"));
    expect(r.status).toBe(403);
    expect(db.expenses.map((e) => e.id)).toContain("x_old");
    expect(db.audit).toHaveLength(0);
  });
  it("staff can delete today's expense and it is logged with the full row", async () => {
    const r = await deleteExpense(send("DELETE"), ctx("x_today"));
    expect(r.status).toBe(200);
    expect(db.expenses.map((e) => e.id)).toEqual(["x_old"]);
    expect(db.audit).toHaveLength(1);
    expect(db.audit[0]).toMatchObject({ action: "DELETE", entity: "Expense", entityId: "x_today", by: "Nilkant", isOwner: false });
    expect(db.audit[0].before).toMatchObject({ category: "Tea", amountInr: 40, date: TODAY });
  });
  it("owner can delete any day", async () => {
    db.user = owner;
    expect((await deleteExpense(send("DELETE"), ctx("x_old"))).status).toBe(200);
    expect(db.audit[0]).toMatchObject({ entity: "Expense", entityId: "x_old", isOwner: true });
  });
  it("a missing expense is 404", async () => {
    db.user = owner;
    expect((await deleteExpense(send("DELETE"), ctx("nope"))).status).toBe(404);
  });
});

describe("sales and purchase DELETE (owner only)", () => {
  it("401 signed out, 403 for staff, nothing deleted or logged", async () => {
    db.user = null;
    expect((await deleteSale(send("DELETE"), ctx("inv1"))).status).toBe(401);
    expect((await deleteBill(send("DELETE"), ctx("b1"))).status).toBe(401);
    db.user = staff;
    expect((await deleteSale(send("DELETE"), ctx("inv1"))).status).toBe(403);
    expect((await deleteBill(send("DELETE"), ctx("b1"))).status).toBe(403);
    expect(db.invoices).toHaveLength(1);
    expect(db.bills).toHaveLength(1);
    expect(db.audit).toHaveLength(0);
  });
  it("owner delete of an invoice writes exactly one audit row holding the invoice and its lines", async () => {
    db.user = owner;
    const r = await deleteSale(send("DELETE"), ctx("inv1"));
    expect(r.status).toBe(200);
    expect(db.invoices).toHaveLength(0);
    expect(db.audit).toHaveLength(1);
    const a = db.audit[0];
    expect(a).toMatchObject({ action: "DELETE", entity: "SalesInvoice", entityId: "inv1", isOwner: true });
    expect(a.summary).toContain("INV-0412");
    expect(a.summary).toContain("Suresh");
    expect(a.before.invoiceNo).toBe("INV-0412");
    expect(a.before.lineItems).toHaveLength(2);
    expect(a.before.party.name).toBe("Suresh");
  });
  it("owner delete of a purchase bill keeps the bill and its lines", async () => {
    db.user = owner;
    expect((await deleteBill(send("DELETE"), ctx("b1"))).status).toBe(200);
    expect(db.audit).toHaveLength(1);
    expect(db.audit[0]).toMatchObject({ action: "DELETE", entity: "PurchaseBill", entityId: "b1" });
    expect(db.audit[0].before.lineItems).toHaveLength(1);
  });
  it("404 for a missing invoice or bill", async () => {
    db.user = owner;
    expect((await deleteSale(send("DELETE"), ctx("nope"))).status).toBe(404);
    expect((await deleteBill(send("DELETE"), ctx("nope"))).status).toBe(404);
  });
});

describe("parties", () => {
  it("any signed-in user can PATCH, and it is logged before and after", async () => {
    const r = await patchParty(send("PATCH", { phone: "9876543210" }), ctx("p1"));
    expect(r.status).toBe(200);
    expect(db.audit).toHaveLength(1);
    expect(db.audit[0]).toMatchObject({ action: "EDIT", entity: "Party", entityId: "p1", by: "Nilkant" });
    expect(db.audit[0].before.phone).toBeNull();
    expect(db.audit[0].after.phone).toBe("9876543210");
  });
  it("signed-out PATCH is 401", async () => {
    db.user = null;
    expect((await patchParty(send("PATCH", { phone: "1" }), ctx("p1"))).status).toBe(401);
    expect(db.audit).toHaveLength(0);
  });
  it("DELETE is owner only: 401, 403, then 200 with a soft delete and a log row", async () => {
    db.user = null;
    expect((await deleteParty(send("DELETE"), ctx("p1"))).status).toBe(401);
    db.user = staff;
    expect((await deleteParty(send("DELETE"), ctx("p1"))).status).toBe(403);
    expect(db.parties[0].active).toBe(true);
    db.user = owner;
    expect((await deleteParty(send("DELETE"), ctx("p1"))).status).toBe(200);
    expect(db.parties[0].active).toBe(false);
    expect(db.audit).toHaveLength(1);
    expect(db.audit[0]).toMatchObject({ action: "DELETE", entity: "Party", entityId: "p1" });
    expect(db.audit[0].before.active).toBe(true);
  });
});

describe("items (owner only)", () => {
  it("POST: 401 signed out, 403 staff, 201 owner with a CREATE log row", async () => {
    db.user = null;
    expect((await postItem(send("POST", { name: "Rice bran oil" }))).status).toBe(401);
    db.user = staff;
    expect((await postItem(send("POST", { name: "Rice bran oil" }))).status).toBe(403);
    expect(db.items).toHaveLength(1);
    expect(db.audit).toHaveLength(0);
    db.user = owner;
    const r = await postItem(send("POST", { name: "Rice bran oil" }));
    expect(r.status).toBe(201);
    expect(db.items).toHaveLength(2);
    expect(db.audit).toHaveLength(1);
    expect(db.audit[0]).toMatchObject({ action: "CREATE", entity: "Item" });
    expect(db.audit[0].before).toBeUndefined();
    expect(db.audit[0].after.name).toBe("Rice bran oil");
  });
  it("PATCH and DELETE: 403 for staff, logged for the owner", async () => {
    db.user = staff;
    expect((await patchItem(send("PATCH", { gstRatePct: 5 }), ctx("i1"))).status).toBe(403);
    expect((await deleteItem(send("DELETE"), ctx("i1"))).status).toBe(403);
    expect(db.audit).toHaveLength(0);
    db.user = owner;
    expect((await patchItem(send("PATCH", { gstRatePct: 5 }), ctx("i1"))).status).toBe(200);
    expect(db.items[0].gstRatePct).toBe(5);
    expect((await deleteItem(send("DELETE"), ctx("i1"))).status).toBe(200);
    expect(db.items[0].active).toBe(false);
    expect(db.audit.map((a) => a.action)).toEqual(["EDIT", "DELETE"]);
  });
  it("401 when signed out", async () => {
    db.user = null;
    expect((await patchItem(send("PATCH", { name: "x" }), ctx("i1"))).status).toBe(401);
    expect((await deleteItem(send("DELETE"), ctx("i1"))).status).toBe(401);
  });
});

describe("daily closing PATCH", () => {
  it("signed out is 401", async () => {
    db.user = null;
    expect((await patchClosing(send("PATCH", { counterCashInr: 1 }), ctx("c_today"))).status).toBe(401);
  });
  it("staff cannot rewrite an earlier day's count — the mismatch flag cannot be edited away", async () => {
    const r = await patchClosing(send("PATCH", { counterCashInr: 1500 }), ctx("c_old"));
    expect(r.status).toBe(403);
    expect(db.closings.find((c) => c.id === "c_old")!.counterCashInr).toBe(1400);
    expect(db.audit).toHaveLength(0);
  });
  it("staff can fix today's count and it is logged before and after", async () => {
    const r = await patchClosing(send("PATCH", { counterCashInr: 1500 }), ctx("c_today"));
    expect(r.status).toBe(200);
    expect(db.audit).toHaveLength(1);
    expect(db.audit[0]).toMatchObject({ action: "EDIT", entity: "DailyClosing", entityId: "c_today" });
    expect(db.audit[0].before.counterCashInr).toBe(1400);
    expect(db.audit[0].after.counterCashInr).toBe(1500);
  });
  it("owner can fix any day", async () => {
    db.user = owner;
    expect((await patchClosing(send("PATCH", { counterCashInr: 1500 }), ctx("c_old"))).status).toBe(200);
    expect(db.audit[0]).toMatchObject({ entityId: "c_old", isOwner: true });
  });
});

describe("job-work PATCH", () => {
  it("signed out is 401", async () => {
    db.user = null;
    expect((await patchJob(send("PATCH", { seedKg: 120 }), ctx("j1"))).status).toBe(401);
  });
  it("staff can fix an unpaid entry made today, and it is logged", async () => {
    const r = await patchJob(send("PATCH", { seedKg: 120 }), ctx("j1"));
    expect(r.status).toBe(200);
    expect(db.jobs[0].seedKg).toBe(120);
    expect(db.audit).toHaveLength(1);
    expect(db.audit[0]).toMatchObject({ action: "EDIT", entity: "JobWorkIntake", entityId: "j1" });
    expect(db.audit[0].before.seedKg).toBe(100);
    expect(db.audit[0].after.seedKg).toBe(120);
  });
  it("an entry made after midnight India time counts as today even though UTC still says yesterday", async () => {
    db.jobs = [mkJob({ createdAt: new Date("2026-11-09T19:30:00Z") })]; // 1:00 am on 10 Nov in India
    expect((await patchJob(send("PATCH", { seedKg: 110 }), ctx("j1"))).status).toBe(200);
  });
  it("staff cannot change an entry from an earlier day", async () => {
    db.jobs = [mkJob({ createdAt: new Date("2026-11-09T05:00:00Z") })];
    expect((await patchJob(send("PATCH", { seedKg: 120 }), ctx("j1"))).status).toBe(403);
    expect(db.jobs[0].seedKg).toBe(100);
    expect(db.audit).toHaveLength(0);
  });
  it("staff cannot change a paid entry; the owner can, and it is logged", async () => {
    db.jobs = [mkJob({ settled: true, settlementAmountInr: 600 })];
    expect((await patchJob(send("PATCH", { seedKg: 500 }), ctx("j1"))).status).toBe(403);
    expect(db.jobs[0].seedKg).toBe(100);
    db.user = owner;
    expect((await patchJob(send("PATCH", { seedKg: 90 }), ctx("j1"))).status).toBe(200);
    expect(db.jobs[0].seedKg).toBe(90);
    expect(db.audit).toHaveLength(1);
    expect(db.audit[0].before.settled).toBe(true);
  });
  it("rejects seed kg that is not a number above zero", async () => {
    for (const bad of [0, -5, "abc", null, Number.NaN]) {
      expect((await patchJob(send("PATCH", { seedKg: bad }), ctx("j1"))).status).toBe(400);
    }
    expect(db.jobs[0].seedKg).toBe(100);
    expect(db.audit).toHaveLength(0);
  });
  it("rejects negative advances but accepts zero and blank", async () => {
    expect((await patchJob(send("PATCH", { advanceCustomerInr: -100 }), ctx("j1"))).status).toBe(400);
    expect((await patchJob(send("PATCH", { advanceAutoInr: "-1" }), ctx("j1"))).status).toBe(400);
    expect((await patchJob(send("PATCH", { advanceCustomerInr: 0, advanceAutoInr: "" }), ctx("j1"))).status).toBe(200);
  });
  it("409 when the entry was paid between the check and the write", async () => {
    db.beforeClaim = () => {
      db.jobs[0].settled = true;
    };
    expect((await patchJob(send("PATCH", { seedKg: 130 }), ctx("j1"))).status).toBe(409);
    expect(db.jobs[0].seedKg).toBe(100);
    expect(db.audit).toHaveLength(0);
  });
  it("404 for a missing entry", async () => {
    expect((await patchJob(send("PATCH", { seedKg: 1 }), ctx("nope"))).status).toBe(404);
  });
});

describe("job-work settle", () => {
  const std = STANDARD_RATE.SHOP;

  it("signed out is 401", async () => {
    db.user = null;
    expect((await settleJob(send("POST", {}), ctx("j1"))).status).toBe(401);
  });
  it("staff pays an unpaid entry at the standard rate: logged as SETTLE", async () => {
    const r = await settleJob(send("POST", {}), ctx("j1"));
    expect(r.status).toBe(200);
    const j = await json(r);
    expect(j.data.settled).toBe(true);
    expect(db.jobs[0].settled).toBe(true);
    expect(db.jobs[0].settlementRatePerKg).toBe(std);
    expect(db.audit).toHaveLength(1);
    expect(db.audit[0]).toMatchObject({ action: "SETTLE", entity: "JobWorkIntake", entityId: "j1", by: "Nilkant" });
    expect(db.audit[0].before.settled).toBe(false);
    expect(db.audit[0].after.settled).toBe(true);
  });
  it("a second pay by staff on a paid entry is 403 and changes nothing", async () => {
    await settleJob(send("POST", { settlementCustomerInr: 400, settlementAutoInr: 200 }), ctx("j1"));
    const paid = { ...db.jobs[0] };
    const r = await settleJob(send("POST", { settlementCustomerInr: 1, settlementAutoInr: 1 }), ctx("j1"));
    expect(r.status).toBe(403);
    expect(db.jobs[0]).toEqual(paid);
    expect(db.audit).toHaveLength(1);
  });
  it("two quick taps: the loser gets 409 and the first amounts stand", async () => {
    // Second request read the entry as unpaid, but the first one paid it before it could write.
    db.beforeClaim = () => {
      db.jobs[0].settled = true;
      db.jobs[0].settlementCustomerInr = 111;
    };
    const r = await settleJob(send("POST", { settlementCustomerInr: 999 }), ctx("j1"));
    expect(r.status).toBe(409);
    expect(db.jobs[0].settlementCustomerInr).toBe(111);
    expect(db.audit).toHaveLength(0);
  });
  it("owner can pay a paid entry again: logged as RESETTLE", async () => {
    await settleJob(send("POST", {}), ctx("j1"));
    db.user = owner;
    const r = await settleJob(send("POST", { settlementCustomerInr: 50, settlementAutoInr: 0 }), ctx("j1"));
    expect(r.status).toBe(200);
    expect(db.jobs[0].settlementAmountInr).toBe(50);
    expect(db.audit.map((a) => a.action)).toEqual(["SETTLE", "RESETTLE"]);
    expect(db.audit[1].isOwner).toBe(true);
  });
  it("staff rate must be within ₹1 of the standard; the owner can use any rate", async () => {
    expect((await settleJob(send("POST", { ratePerKg: std + 3 }), ctx("j1"))).status).toBe(403);
    expect(db.jobs[0].settled).toBe(false);
    expect(db.audit).toHaveLength(0);
    expect((await settleJob(send("POST", { ratePerKg: std + 1 }), ctx("j1"))).status).toBe(200);
    db.jobs = [mkJob()];
    db.audit = [];
    db.user = owner;
    expect((await settleJob(send("POST", { ratePerKg: std + 3 }), ctx("j1"))).status).toBe(200);
    expect(db.jobs[0].settlementRatePerKg).toBe(std + 3);
  });
  it("rejects invalid or negative amounts and rates (400)", async () => {
    for (const body of [
      { settlementCustomerInr: -10 },
      { settlementAutoInr: -1 },
      { settlementCustomerInr: "abc" },
      { settlementAutoInr: "-5" },
      { ratePerKg: -6 },
      { ratePerKg: 0 },
      { ratePerKg: "abc" },
    ]) {
      expect((await settleJob(send("POST", body), ctx("j1"))).status).toBe(400);
    }
    expect(db.jobs[0].settled).toBe(false);
    expect(db.audit).toHaveLength(0);
  });
  it("accepts any split between customer and auto (Sahil's decision)", async () => {
    const r = await settleJob(send("POST", { settlementCustomerInr: 1, settlementAutoInr: 2 }), ctx("j1"));
    expect(r.status).toBe(200);
    expect(db.jobs[0]).toMatchObject({ settlementCustomerInr: 1, settlementAutoInr: 2, settlementAmountInr: 3 });
  });
  it("404 for a missing entry", async () => {
    expect((await settleJob(send("POST", {}), ctx("nope"))).status).toBe(404);
  });
});

describe("activity log route (owner only)", () => {
  beforeEach(() => {
    db.audit = [
      { id: "a1", at: new Date("2026-11-09T05:00:00Z"), by: "Nilkant", isOwner: false, action: "DELETE", entity: "Expense", entityId: "x1", summary: "Tea" },
      { id: "a2", at: new Date("2026-11-10T05:00:00Z"), by: "Sahil", isOwner: true, action: "DELETE", entity: "SalesInvoice", entityId: "i1", summary: "INV-1" },
    ];
  });
  it("401 signed out, 403 staff", async () => {
    db.user = null;
    expect((await getAudit(get("http://x/api/audit"))).status).toBe(401);
    db.user = staff;
    expect((await getAudit(get("http://x/api/audit"))).status).toBe(403);
  });
  it("owner gets rows newest first, and can filter by record type and date range", async () => {
    db.user = owner;
    let j = await json(await getAudit(get("http://x/api/audit")));
    expect(j.data.map((r: Row) => r.id)).toEqual(["a2", "a1"]);
    j = await json(await getAudit(get("http://x/api/audit?entity=Expense")));
    expect(j.data.map((r: Row) => r.id)).toEqual(["a1"]);
    j = await json(await getAudit(get("http://x/api/audit?from=2026-11-10&to=2026-11-10")));
    expect(j.data.map((r: Row) => r.id)).toEqual(["a2"]);
  });
  it("rejects an unknown record type or a bad date", async () => {
    db.user = owner;
    expect((await getAudit(get("http://x/api/audit?entity=Hack"))).status).toBe(400);
    expect((await getAudit(get("http://x/api/audit?from=yesterday"))).status).toBe(400);
  });
});

describe("page access", () => {
  it("items list is readable by register, sales and stock; the audit API needs the settings page", () => {
    expect(pagesForPath("/api/items")).toEqual(["register", "sales", "stock"]);
    expect(pagesForPath("/api/items/abc")).toEqual(["register", "sales", "stock"]);
    expect(pagesForPath("/api/audit")).toEqual(["settings"]);
  });
});
