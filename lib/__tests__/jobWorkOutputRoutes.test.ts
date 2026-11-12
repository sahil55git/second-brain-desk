// Spec B: the day-output route and the "oil collected" tick, against an
// in-memory database. Checks 401 / 403 / 400 / 200 paths and the audit rows.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const db = vi.hoisted(() => ({
  user: null as Record<string, any> | null, // eslint-disable-line @typescript-eslint/no-explicit-any
  jobs: [] as Record<string, any>[], // eslint-disable-line @typescript-eslint/no-explicit-any
  outputs: [] as Record<string, any>[], // eslint-disable-line @typescript-eslint/no-explicit-any
  audit: [] as Record<string, any>[], // eslint-disable-line @typescript-eslint/no-explicit-any
}));

vi.mock("@prisma/client", () => ({ Prisma: { JsonNull: "JsonNull" }, PrismaClient: class {} }));
vi.mock("@/lib/registerServer", async (orig) => {
  const actual = await orig<typeof import("@/lib/registerServer")>();
  return { ...actual, getUser: async () => db.user };
});
vi.mock("@/lib/db", () => {
  const copy = <T,>(v: T): T => structuredClone(v);
  const api = {
    jobWorkIntake: {
      findUnique: async ({ where }: Row) => copy(db.jobs.find((r) => r.id === where.id) ?? null),
      findUniqueOrThrow: async ({ where }: Row) => copy(db.jobs.find((r) => r.id === where.id)),
      updateMany: async ({ where, data }: Row) => {
        const r = db.jobs.find((x) => x.id === where.id);
        if (!r || (where.settled !== undefined && r.settled !== where.settled)) return { count: 0 };
        Object.assign(r, data);
        return { count: 1 };
      },
    },
    jobWorkDayOutput: {
      findUnique: async ({ where }: Row) => copy(db.outputs.find((r) => r.date === where.date) ?? null),
      findMany: async () => copy(db.outputs),
      upsert: async ({ where, create, update }: Row) => {
        const r = db.outputs.find((x) => x.date === where.date);
        if (r) {
          Object.assign(r, update);
          return copy(r);
        }
        const n = { id: `o${db.outputs.length + 1}`, ...create };
        db.outputs.push(n);
        return copy(n);
      },
    },
    auditLog: {
      create: async ({ data }: Row) => {
        db.audit.push({ id: `a${db.audit.length + 1}`, ...data });
        return data;
      },
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

import { GET as getOutput, PUT as putOutput } from "@/app/api/job-work/output/route";
import { PATCH as patchJob } from "@/app/api/job-work/[id]/route";

const TODAY = "2026-11-12";
const YESTERDAY = "2026-11-11";
const owner = { name: "Sahil", role: "OWNER", isOwner: true };
const staff = { name: "Nilkant", role: "STAFF", isOwner: false };

const send = (method: string, body?: unknown) =>
  new Request("http://x/api", { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) }) as never;
const get = (url: string) => Object.assign(new Request(url) as object, { nextUrl: new URL(url) }) as never;
const ctx = (id: string) => ({ params: { id } });

const mkJob = (o: Row = {}): Row => ({
  id: "j1",
  customer: "Ramesh",
  seedKg: 100,
  cakeOwnership: "SHOP",
  advanceCustomerInr: 0,
  advanceAutoInr: 0,
  cans: null,
  notes: null,
  settled: false,
  oilCollectedAt: null,
  oilHeldTag: null,
  createdAt: new Date("2026-11-11T05:00:00Z"), // yesterday in India
  ...o,
});

beforeAll(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-12T10:00:00Z")); // 3:30 pm on 12 Nov in India
});
afterAll(() => {
  vi.useRealTimers();
});
beforeEach(() => {
  db.user = staff;
  db.audit = [];
  db.outputs = [];
  db.jobs = [mkJob()];
});

describe("PUT /api/job-work/output", () => {
  it("401 when not signed in", async () => {
    db.user = null;
    expect((await putOutput(send("PUT", { date: TODAY, oilKg: 200, cakeKg: 750 }))).status).toBe(401);
  });
  it("staff can record today, and it is logged once", async () => {
    const res = await putOutput(send("PUT", { date: TODAY, oilKg: 220, cakeKg: 760 }));
    expect(res.status).toBe(200);
    expect(db.outputs).toHaveLength(1);
    expect(db.outputs[0]).toMatchObject({ date: TODAY, oilKg: 220, cakeKg: 760, by: "Nilkant" });
    expect(db.audit).toHaveLength(1);
    expect(db.audit[0]).toMatchObject({ action: "CREATE", entity: "JobWorkDayOutput" });
  });
  it("saving the same day again updates it (EDIT) instead of adding a second row", async () => {
    await putOutput(send("PUT", { date: TODAY, oilKg: 220, cakeKg: 760 }));
    await putOutput(send("PUT", { date: TODAY, oilKg: 230, cakeKg: 750 }));
    expect(db.outputs).toHaveLength(1);
    expect(db.outputs[0].oilKg).toBe(230);
    expect(db.audit.map((a) => a.action)).toEqual(["CREATE", "EDIT"]);
    expect(db.audit[1].before).toMatchObject({ oilKg: 220 });
  });
  it("staff get 403 for an earlier day; the owner can", async () => {
    expect((await putOutput(send("PUT", { date: YESTERDAY, oilKg: 1, cakeKg: 1 }))).status).toBe(403);
    expect(db.outputs).toHaveLength(0);
    db.user = owner;
    expect((await putOutput(send("PUT", { date: YESTERDAY, oilKg: 1, cakeKg: 1 }))).status).toBe(200);
  });
  it("rejects bad numbers, blanks, future dates and bad dates", async () => {
    for (const body of [
      { date: TODAY, oilKg: -1, cakeKg: 5 },
      { date: TODAY, oilKg: "abc", cakeKg: 5 },
      { date: TODAY, oilKg: "", cakeKg: 5 },
      { date: TODAY, oilKg: 5 },
      { date: TODAY, oilKg: 0, cakeKg: 0 },
      { date: "2026-11-13", oilKg: 5, cakeKg: 5 },
      { date: "12/11/2026", oilKg: 5, cakeKg: 5 },
    ]) {
      expect((await putOutput(send("PUT", body))).status).toBe(400);
    }
    expect(db.outputs).toHaveLength(0);
  });
});

describe("GET /api/job-work/output", () => {
  it("401 when not signed in, 200 with a day's row", async () => {
    db.user = null;
    expect((await getOutput(get("http://x/api/job-work/output"))).status).toBe(401);
    db.user = staff;
    await putOutput(send("PUT", { date: TODAY, oilKg: 220, cakeKg: 760 }));
    const res = await getOutput(get(`http://x/api/job-work/output?date=${TODAY}`));
    expect((await res.json()).data).toMatchObject({ oilKg: 220 });
    expect((await getOutput(get("http://x/api/job-work/output?date=bad"))).status).toBe(400);
  });
});

describe("PATCH /api/job-work/[id] oil collection", () => {
  it("staff can tick collected on an earlier day's entry, and it is logged", async () => {
    const res = await patchJob(send("PATCH", { oilCollected: true }), ctx("j1"));
    expect(res.status).toBe(200);
    expect(db.jobs[0].oilCollectedAt).toBeInstanceOf(Date);
    expect(db.audit).toHaveLength(1);
  });
  it("staff can tick it even after the entry is paid", async () => {
    db.jobs = [mkJob({ settled: true })];
    expect((await patchJob(send("PATCH", { oilCollected: true }), ctx("j1"))).status).toBe(200);
  });
  it("staff cannot undo a tick; the owner can", async () => {
    db.jobs = [mkJob({ oilCollectedAt: new Date() })];
    expect((await patchJob(send("PATCH", { oilCollected: false }), ctx("j1"))).status).toBe(403);
    expect(db.jobs[0].oilCollectedAt).not.toBeNull();
    db.user = owner;
    expect((await patchJob(send("PATCH", { oilCollected: false }), ctx("j1"))).status).toBe(200);
    expect(db.jobs[0].oilCollectedAt).toBeNull();
  });
  it("saves and clears the tag text", async () => {
    await patchJob(send("PATCH", { oilHeldTag: "  Blue drum 3  " }), ctx("j1"));
    expect(db.jobs[0].oilHeldTag).toBe("Blue drum 3");
    await patchJob(send("PATCH", { oilHeldTag: "" }), ctx("j1"));
    expect(db.jobs[0].oilHeldTag).toBeNull();
  });
  it("rejects a non-boolean tick and an empty body", async () => {
    expect((await patchJob(send("PATCH", { oilCollected: "yes" }), ctx("j1"))).status).toBe(400);
    expect((await patchJob(send("PATCH", {}), ctx("j1"))).status).toBe(400);
  });
  it("other edits keep the old rules: staff cannot edit yesterday's entry", async () => {
    expect((await patchJob(send("PATCH", { seedKg: 120 }), ctx("j1"))).status).toBe(403);
    expect(db.jobs[0].seedKg).toBe(100);
  });
});
