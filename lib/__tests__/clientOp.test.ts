// The "never save the same offline entry twice" guard, and the job-work intake route using it.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const db = vi.hoisted(() => ({ ops: new Map<string, Row>(), table: true, intakes: [] as Row[], failCreate: false }));

vi.mock("@prisma/client", () => ({ Prisma: {}, PrismaClient: class {} }));
vi.mock("@/lib/registerServer", async (orig) => ({ ...(await orig<typeof import("@/lib/registerServer")>()), getUser: async () => ({ name: "Nilkant", username: "nilkant", isOwner: false }) }));
vi.mock("@/lib/db", () => ({
  prisma: {
    clientOp: {
      create: async ({ data }: Row) => {
        if (!db.table) throw new Error("relation ClientOp does not exist");
        if (db.ops.has(data.id)) throw Object.assign(new Error("Unique constraint failed"), { code: "P2002" });
        db.ops.set(data.id, data);
        return data;
      },
      delete: async ({ where }: Row) => {
        if (!db.ops.delete(where.id)) throw new Error("not found");
      },
    },
    jobWorkIntake: {
      create: async ({ data }: Row) => {
        if (db.failCreate) throw new Error("database is down");
        const row = { id: `j${db.intakes.length + 1}`, ...data };
        db.intakes.push(row);
        return row;
      },
    },
  },
  safeDbCall: async (fn: () => Promise<unknown>) => { try { return { ok: true, data: await fn() }; } catch (e) { return { ok: false, error: String(e) }; } },
}));

import { claimOp, releaseOp } from "@/lib/clientOp";
import { POST as intake } from "@/app/api/job-work/route";

const post = (body: Row) => intake(new NextRequest("http://x/api/job-work", { method: "POST", body: JSON.stringify(body) }));
const entry = { customer: "Ramesh", seedKg: 120, cakeOwnership: "SHOP" };

beforeEach(() => {
  db.ops.clear();
  db.table = true;
  db.intakes = [];
  db.failCreate = false;
});

describe("claimOp", () => {
  it("is new the first time and duplicate after that", async () => {
    expect(await claimOp("cabc12345", "x")).toBe("new");
    expect(await claimOp("cabc12345", "x")).toBe("duplicate");
    expect(await claimOp("cother999", "x")).toBe("new");
  });
  it("ignores a missing or odd id, and carries on when the table is not there", async () => {
    for (const bad of [undefined, null, "", "short", "has space 12", 12345, "C" + "a".repeat(10), "c" + "a".repeat(40)]) expect(await claimOp(bad, "x"), String(bad)).toBe("none");
    db.table = false;
    expect(await claimOp("cabc12345", "x")).toBe("none");
  });
  it("can be released so a corrected retry goes through", async () => {
    await claimOp("cabc12345", "x");
    await releaseOp("cabc12345");
    expect(await claimOp("cabc12345", "x")).toBe("new");
    await releaseOp("cnever0000"); // nothing to free: no error
  });
});

describe("POST /api/job-work with a clientId", () => {
  it("saves once; the same entry sent again is answered 'already saved' and adds nothing", async () => {
    const a = await post({ ...entry, clientId: "cintake001" });
    expect(a.status).toBe(201);
    const b = await post({ ...entry, clientId: "cintake001" });
    expect(b.status).toBe(200);
    expect(await b.json()).toMatchObject({ duplicate: true, data: null });
    expect(db.intakes).toHaveLength(1);
  });
  it("two different entries for the same customer and weight are both saved", async () => {
    await post({ ...entry, clientId: "cintake001" });
    await post({ ...entry, clientId: "cintake002" });
    expect(db.intakes).toHaveLength(2);
  });
  it("a save that failed frees the id, so the retry is saved and not mistaken for a duplicate", async () => {
    db.failCreate = true;
    expect((await post({ ...entry, clientId: "cintake001" })).status).toBe(503);
    db.failCreate = false;
    expect((await post({ ...entry, clientId: "cintake001" })).status).toBe(201);
    expect(db.intakes).toHaveLength(1);
  });
  it("an entry refused for its content does not use up the id", async () => {
    expect((await post({ customer: "Ramesh", seedKg: -5, clientId: "cintake001" })).status).toBe(400);
    expect(db.ops.size).toBe(0);
  });
  it("works as before with no clientId, and when the guard table is missing", async () => {
    expect((await post(entry)).status).toBe(201);
    db.table = false;
    expect((await post({ ...entry, clientId: "cintake003" })).status).toBe(201);
    expect(db.intakes).toHaveLength(2);
  });
});
