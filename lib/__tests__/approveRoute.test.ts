// Specs E and F: the owner's-OK route and the wrong-password limit, against an in-memory database.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import bcrypt from "bcryptjs";

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const db = vi.hoisted(() => ({ user: null as Row | null, entries: [] as Row[], audit: [] as Row[], users: [] as Row[], attempts: [] as Row[], attemptsTable: true }));

vi.mock("@prisma/client", () => ({ Prisma: {}, PrismaClient: class {} }));
vi.mock("@/lib/registerServer", async (orig) => {
  const actual = await orig<typeof import("@/lib/registerServer")>();
  return { ...actual, getUser: async () => db.user };
});
vi.mock("@/lib/db", () => {
  const api = {
    registerEntry: {
      findUnique: async ({ where }: Row) => structuredClone(db.entries.find((e) => e.id === where.id) ?? null),
      update: async ({ where, data }: Row) => Object.assign(db.entries.find((e) => e.id === where.id)!, data),
    },
    auditLog: { create: async ({ data }: Row) => (db.audit.push(data), data) },
    user: { findUnique: async ({ where }: Row) => db.users.find((u) => u.username === where.username) ?? null },
    loginAttempt: {
      findMany: async ({ where }: Row) => {
        if (!db.attemptsTable) throw new Error("table LoginAttempt does not exist");
        return db.attempts.filter((a) => a.username === where.username && a.at >= where.at.gte);
      },
      create: async ({ data }: Row) => {
        if (!db.attemptsTable) throw new Error("table LoginAttempt does not exist");
        db.attempts.push({ ...data, at: new Date() });
      },
      deleteMany: async ({ where }: Row) => {
        db.attempts = db.attempts.filter((a) => !(a.at < where.at.lt));
      },
    },
    $transaction: async (fn: (tx: unknown) => unknown) => fn(api),
  };
  return {
    prisma: api,
    safeDbCall: async (fn: () => Promise<unknown>) => {
      try {
        return { ok: true, data: await fn() };
      } catch (e) {
        return { ok: false, error: String(e) };
      }
    },
  };
});

import { POST as approve } from "@/app/api/register/[id]/approve/route";
import { authOptions } from "@/lib/auth";

const owner = { name: "Sahil", username: "sahil", isOwner: true };
const staff = { name: "Nilkant", username: "nilkant", isOwner: false };
const call = (id: string, body: unknown) => approve(new NextRequest(`http://x/api/register/${id}/approve`, { method: "POST", body: JSON.stringify(body) }), { params: { id } });

beforeEach(() => {
  db.user = owner;
  db.audit = [];
  db.entries = [
    { id: "e1", kind: "EXPENSE", amountInr: 3500, partyName: null, createdByName: "Nilkant", details: { approval: "pending", clientId: "cabc1234" } },
    { id: "e2", kind: "EXPENSE", amountInr: 500, partyName: null, createdByName: "Nilkant", details: null },
  ];
});

describe("POST /api/register/[id]/approve", () => {
  it("is for the owner only", async () => {
    db.user = null;
    expect((await call("e1", { decision: "approve" })).status).toBe(401);
    db.user = staff;
    expect((await call("e1", { decision: "approve" })).status).toBe(403);
    expect(db.entries[0].details.approval).toBe("pending");
    expect(db.audit).toHaveLength(0);
  });
  it("needs a clear decision", async () => {
    expect((await call("e1", {})).status).toBe(400);
    expect((await call("e1", { decision: "maybe" })).status).toBe(400);
  });
  it("approves once, keeps the other details and writes one log line", async () => {
    expect((await call("e1", { decision: "approve" })).status).toBe(200);
    expect(db.entries[0].details).toMatchObject({ approval: "approved", approvalBy: "Sahil", clientId: "cabc1234" });
    expect(db.audit).toHaveLength(1);
    expect(db.audit[0]).toMatchObject({ action: "APPROVE", entity: "RegisterEntry", entityId: "e1", by: "Sahil" });
    expect((await call("e1", { decision: "reject" })).status).toBe(409); // already decided
    expect(db.audit).toHaveLength(1);
  });
  it("refuses with a reason and keeps the entry", async () => {
    expect((await call("e1", { decision: "reject", reason: "not agreed" })).status).toBe(200);
    expect(db.entries).toHaveLength(2);
    expect(db.entries[0].details).toMatchObject({ approval: "rejected", approvalNote: "not agreed" });
    expect(db.audit[0].action).toBe("REJECT");
  });
  it("says so for an entry that is not waiting, or does not exist", async () => {
    expect((await call("e2", { decision: "approve" })).status).toBe(409);
    expect((await call("nope", { decision: "approve" })).status).toBe(404);
  });
});

describe("wrong-password limit at login", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const login = (username: string, password: string) => (authOptions.providers[0] as any).options.authorize({ username, password });
  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-13T04:00:00Z"));
    db.attempts = [];
    db.attemptsTable = true;
    db.users = [{ id: "u1", username: "nilkant", name: "Nilkant", role: "STAFF", active: true, passwordHash: await bcrypt.hash("right", 4) }];
  });
  afterEach(() => {
    vi.useRealTimers();
  });
  it("lets the right password in and counts wrong ones", async () => {
    expect(await login("nilkant", "right")).toMatchObject({ username: "nilkant" });
    expect(await login("nilkant", "wrong")).toBeNull();
    expect(db.attempts).toHaveLength(1);
  });
  it("locks the username after five wrong tries, even for the right password, then opens after 15 minutes", async () => {
    for (let i = 0; i < 5; i++) expect(await login("Nilkant ", "wrong")).toBeNull();
    expect(await login("nilkant", "right")).toBeNull();
    expect(db.attempts).toHaveLength(5); // a locked try is not counted again, so the lock cannot be stretched for ever
    vi.setSystemTime(new Date("2026-11-13T04:15:01Z"));
    expect(await login("nilkant", "right")).toMatchObject({ username: "nilkant" });
  });
  it("counts tries against a username that does not exist, and keeps other usernames open", async () => {
    for (let i = 0; i < 5; i++) await login("ghost", "x");
    expect(db.attempts.filter((a) => a.username === "ghost")).toHaveLength(5);
    expect(await login("nilkant", "right")).not.toBeNull();
  });
  it("still lets people in when the tries table is missing", async () => {
    db.attemptsTable = false;
    expect(await login("nilkant", "wrong")).toBeNull();
    expect(await login("nilkant", "right")).toMatchObject({ username: "nilkant" });
  });
});
