// The shop print queue: job checking, and the browser + helper routes against an in-memory database.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import * as jobs from "../../app/api/print-jobs/route";
import * as one from "../../app/api/print-jobs/[id]/route";
import * as agent from "../../app/api/print-jobs/agent/route";
import { AGENT_ONLINE_MS, QUEUE_MAX_ITEMS, agentOnline, canCancel, canReprint, checkQueueJob, statusText } from "../printQueue";

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const db = vi.hoisted(() => ({ jobs: [] as Row[], agent: null as Row | null, user: { name: "Nilkant", username: "nilkant", role: "STAFF" } as Row | null }));

vi.mock("@/lib/registerServer", () => ({ getUser: async () => db.user }));
vi.mock("@/lib/attachmentServer", () => ({ missingTable: () => false, TABLE_HINT: "run db push" }));
vi.mock("@/lib/db", () => {
  const match = (j: Row, where: Row = {}) =>
    Object.entries(where).every(([k, v]) => {
      if (v && typeof v === "object" && "lt" in (v as Row)) return j[k] != null && +j[k] < +(v as Row).lt;
      return j[k] === v;
    });
  const prisma = {
    printJob: {
      create: async ({ data }: Row) => {
        const j = { id: `j${db.jobs.length + 1}`, createdAt: new Date(), status: "QUEUED", error: null, claimedAt: null, doneAt: null, agent: null, ...data };
        db.jobs.push(j);
        return j;
      },
      findUnique: async ({ where }: Row) => db.jobs.find((j) => j.id === where.id) ?? null,
      findFirst: async ({ where, orderBy }: Row) => db.jobs.filter((j) => match(j, where)).sort((a, b) => (orderBy?.createdAt === "asc" ? +a.createdAt - +b.createdAt : +b.createdAt - +a.createdAt))[0] ?? null,
      findMany: async ({ take }: Row) => [...db.jobs].sort((a, b) => +b.createdAt - +a.createdAt).slice(0, take).map((j) => { const c = { ...j }; delete c.items; return c; }),
      updateMany: async ({ where, data }: Row) => {
        const hit = db.jobs.filter((j) => match(j, where));
        hit.forEach((j) => Object.assign(j, data));
        return { count: hit.length };
      },
    },
    printAgent: {
      findUnique: async () => db.agent,
      upsert: async ({ create, update }: Row) => {
        db.agent = db.agent ? Object.assign(db.agent, update) : { ...create };
        return db.agent;
      },
    },
  };
  return { prisma, safeDbCall: async (fn: () => Promise<unknown>) => ({ ok: true, data: await fn() }) };
});


const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
const goodJob = (over: Row = {}) => ({ kind: "label", title: "BRL-01", copies: 2, items: [{ png: `data:image/png;base64,${PNG}`, widthMm: 50, heightMm: 75 }], ...over });
const req = (url: string, body?: unknown, headers: Record<string, string> = {}) => new NextRequest(`http://localhost${url}`, { method: body === undefined ? "GET" : "POST", body: body === undefined ? undefined : JSON.stringify(body), headers });
const asAgent = { "x-print-secret": "shop-secret-1234567890" };

beforeEach(() => {
  db.jobs = [];
  db.agent = null;
  db.user = { name: "Nilkant", username: "nilkant", role: "STAFF" };
  process.env.PRINT_QUEUE_SECRET = "shop-secret-1234567890";
  delete process.env.SCALE_PUSH_SECRET;
});

describe("job checking", () => {
  it("accepts a good job and strips the data: prefix", () => {
    const r = checkQueueJob(goodJob());
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.job.items[0].png).toBe(PNG);
      expect(r.job.copies).toBe(2);
    }
  });
  it("rejects bad jobs with a plain message", () => {
    const bad = [
      null,
      goodJob({ kind: "poster" }),
      goodJob({ copies: 0 }),
      goodJob({ copies: 51 }),
      goodJob({ items: [] }),
      goodJob({ items: [{ png: "not-a-png", widthMm: 50, heightMm: 75 }] }),
      goodJob({ items: [{ png: PNG, widthMm: 5, heightMm: 75 }] }),
      goodJob({ items: [{ png: PNG, widthMm: 50, heightMm: 900 }] }),
      goodJob({ items: Array.from({ length: QUEUE_MAX_ITEMS + 1 }, () => ({ png: PNG, widthMm: 50, heightMm: 30 })) }),
    ];
    for (const b of bad) {
      const r = checkQueueJob(b);
      expect(r.ok, JSON.stringify(b)?.slice(0, 60)).toBe(false);
      if (!r.ok) expect(r.error.length).toBeGreaterThan(5);
    }
  });
  it("allows a roll slip (no height)", () => {
    expect(checkQueueJob(goodJob({ kind: "slip", items: [{ png: PNG, widthMm: 80, heightMm: null }] })).ok).toBe(true);
  });
  it("knows when the helper is online and what to show", () => {
    const now = Date.now();
    expect(agentOnline(new Date(now - 3000), now)).toBe(true);
    expect(agentOnline(new Date(now - AGENT_ONLINE_MS - 1), now)).toBe(false);
    expect(agentOnline(null)).toBe(false);
    expect(statusText("FAILED", "Printer not found")).toBe("Failed: Printer not found");
    expect(canCancel("QUEUED")).toBe(true);
    expect(canCancel("PRINTING")).toBe(false);
    expect(canReprint("DONE")).toBe(true);
    expect(canReprint("QUEUED")).toBe(false);
  });
});

describe("queue routes", () => {
  it("queues a job and lists it with the helper status", async () => {
    const r = await jobs.POST(req("/api/print-jobs", goodJob()));
    expect(r.status).toBe(201);
    const list = await (await jobs.GET(req("/api/print-jobs"))).json();
    expect(list.jobs).toHaveLength(1);
    expect(list.jobs[0].status).toBe("QUEUED");
    expect(list.jobs[0].items).toBeUndefined(); // no pictures in the list
    expect(list.agent.online).toBe(false);
  });
  it("needs a login and a valid job", async () => {
    db.user = null;
    expect((await jobs.POST(req("/api/print-jobs", goodJob()))).status).toBe(401);
    db.user = { name: "N", username: "n", role: "STAFF" };
    expect((await jobs.POST(req("/api/print-jobs", goodJob({ items: [] })))).status).toBe(400);
  });

  it("the helper needs the secret", async () => {
    expect((await agent.POST(req("/api/print-jobs/agent", { action: "claim" }))).status).toBe(401);
    expect((await agent.POST(req("/api/print-jobs/agent", { action: "claim" }, { "x-print-secret": "wrong" }))).status).toBe(401);
    delete process.env.PRINT_QUEUE_SECRET;
    expect((await agent.POST(req("/api/print-jobs/agent", { action: "claim" }, asAgent))).status).toBe(503);
  });
  it("the scale bridge's secret also works", async () => {
    delete process.env.PRINT_QUEUE_SECRET;
    process.env.SCALE_PUSH_SECRET = "scale-secret-0987654321";
    expect((await agent.POST(req("/api/print-jobs/agent", { action: "claim" }, { "x-print-secret": "scale-secret-0987654321" }))).status).toBe(200);
  });

  it("full trip: queue -> helper claims -> prints -> done; oldest first, never twice", async () => {
    await jobs.POST(req("/api/print-jobs", goodJob({ title: "first" })));
    await jobs.POST(req("/api/print-jobs", goodJob({ title: "second" })));
    db.jobs[0].createdAt = new Date(Date.now() - 5000);
    const claim = async () => (await (await agent.POST(req("/api/print-jobs/agent", { action: "claim", version: "1.1", labelPrinter: "H30C", slipPrinter: "POS" }, asAgent))).json()).job;
    const a = await claim();
    expect(a.title).toBe("first");
    expect(a.items[0].png).toBe(PNG);
    expect(a.copies).toBe(2);
    const b = await claim();
    expect(b.title).toBe("second");
    expect(await claim()).toBeNull();
    expect(db.agent?.version).toBe("1.1");
    const list = await (await jobs.GET(req("/api/print-jobs"))).json();
    expect(list.agent.online).toBe(true);
    expect(list.agent.labelPrinter).toBe("H30C");
    expect(list.jobs.map((j: Row) => j.status)).toEqual(["PRINTING", "PRINTING"]);
    await agent.POST(req("/api/print-jobs/agent", { action: "done", id: a.id, ok: true }, asAgent));
    await agent.POST(req("/api/print-jobs/agent", { action: "done", id: b.id, ok: false, error: "Printer not found: X" }, asAgent));
    expect(db.jobs.find((j) => j.id === a.id)?.status).toBe("DONE");
    const failed = db.jobs.find((j) => j.id === b.id)!;
    expect(failed.status).toBe("FAILED");
    expect(failed.error).toBe("Printer not found: X");
  });

  it("a finished job is not changed again", async () => {
    await jobs.POST(req("/api/print-jobs", goodJob()));
    const id = db.jobs[0].id;
    await agent.POST(req("/api/print-jobs/agent", { action: "claim" }, asAgent));
    await agent.POST(req("/api/print-jobs/agent", { action: "done", id, ok: true }, asAgent));
    const again = await (await agent.POST(req("/api/print-jobs/agent", { action: "done", id, ok: false, error: "late" }, asAgent))).json();
    expect(again.updated).toBe(0);
    expect(db.jobs[0].status).toBe("DONE");
  });

  it("a job lost with the helper is closed as failed", async () => {
    await jobs.POST(req("/api/print-jobs", goodJob()));
    await agent.POST(req("/api/print-jobs/agent", { action: "claim" }, asAgent));
    db.jobs[0].claimedAt = new Date(Date.now() - 10 * 60_000);
    const list = await (await jobs.GET(req("/api/print-jobs"))).json();
    expect(list.jobs[0].status).toBe("FAILED");
    expect(list.jobs[0].error).toMatch(/did not answer/);
  });

  it("cancel works only while it waits; reprint copies a finished job", async () => {
    await jobs.POST(req("/api/print-jobs", goodJob()));
    const id = db.jobs[0].id;
    const call = (action: string, jid = id) => one.POST(req(`/api/print-jobs/${jid}`, { action }), { params: { id: jid } });
    expect((await call("reprint")).status).toBe(409); // still waiting
    expect((await call("cancel")).status).toBe(200);
    expect(db.jobs[0].status).toBe("CANCELLED");
    expect((await call("cancel")).status).toBe(409);
    const re = await call("reprint");
    expect(re.status).toBe(201);
    expect(db.jobs).toHaveLength(2);
    expect(db.jobs[1].status).toBe("QUEUED");
    expect(db.jobs[1].items).toEqual(db.jobs[0].items);
    expect((await call("cancel", "nope")).status).toBe(404);
    expect((await call("explode")).status).toBe(400);
  });
});
