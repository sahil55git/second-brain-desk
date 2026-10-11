// Quick Register smart entry, server side: the "register" fill desk is tidied to its own
// fields, and the register ask desk answers from the day's book in the language asked.
import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const st = vi.hoisted(() => ({ user: { name: "Nilkant", role: "STAFF", isOwner: false } as Row | null, prompts: [] as string[], systems: [] as string[], reply: "" }));

vi.mock("@/lib/aiProvider", () => ({
  runAi: async (system: string, user: string) => {
    st.systems.push(system);
    st.prompts.push(user);
    return { ok: true, text: st.reply, provider: "test" };
  },
}));
vi.mock("@/lib/registerServer", () => ({
  getUser: async () => st.user,
  isValidDate: (d: unknown) => typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d),
  loadDay: async () => ({
    entries: [
      { date: "2026-10-11", createdAt: "2026-10-11T05:00:00.000Z", kind: "SALE", item: "sunflower", itemLabel: null, qty: 10, unit: "kg", rateInr: 140, amountInr: 1400, paymentMode: "CASH", partyName: "Ramesh", notes: null, details: null },
    ],
    opening: { value: 5000 },
    systemCashNow: 6400,
    tallies: {},
    jobWork: [],
  }),
}));
vi.mock("@/lib/db", () => ({
  prisma: { registerEntry: { findMany: async () => [] } },
  safeDbCall: async (fn: () => Promise<unknown>) => ({ ok: true, data: await fn() }),
}));

import { NextRequest } from "next/server";
import { POST as ask } from "@/app/api/ai/desk/route";
import { POST as fill } from "@/app/api/ai-fill/route";

const post = (url: string, body: unknown) => new NextRequest(`http://localhost${url}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

beforeEach(() => {
  st.user = { name: "Nilkant", role: "STAFF", isOwner: false };
  st.prompts = [];
  st.systems = [];
  st.reply = "";
  delete process.env.GEMINI_API_KEY;
});

describe("register AI fill", () => {
  it("keeps only the register's own fields and fixes the enums", async () => {
    st.reply = JSON.stringify({ kind: "sale", item: "sunflower oil", qty: "10", unit: "kg", rateInr: 140, paymentMode: "credit", partyName: "Ramesh", hacker: "drop me" });
    const j = await (await fill(post("/api/ai-fill", { desk: "register", text: "sold 10 kg sunflower to Ramesh on udhaar" }))).json();
    expect(j.fields).toMatchObject({ kind: "SALE", item: "sunflower oil", qty: 10, unit: "kg", rateInr: 140, paymentMode: "CREDIT", partyName: "Ramesh" });
    expect(j.fields.hacker).toBeUndefined();
  });
  it("refuses anonymous callers", async () => {
    st.user = null;
    expect((await fill(post("/api/ai-fill", { desk: "register", text: "x" }))).status).toBe(401);
  });
});

describe("register AI ask", () => {
  it("answers from the day's book, for staff too, in the language asked", async () => {
    st.reply = "All fine.";
    const res = await ask(post("/api/ai/desk", { desk: "register", promptId: "today", date: "2026-10-11", lang: "kn" }));
    expect(res.status).toBe(200);
    expect((await res.json()).answer).toBe("All fine.");
    expect(st.prompts[0]).toContain("SALE sunflower 10 kg @140 = ₹1400 CASH — Ramesh");
    expect(st.systems[0]).toMatch(/Kannada/);
  });
  it("takes a free question and needs a sign-in", async () => {
    await ask(post("/api/ai/desk", { desk: "register", question: "who owes us?" }));
    expect(st.prompts[0]).toContain("Question: who owes us?");
    st.user = null;
    expect((await ask(post("/api/ai/desk", { desk: "register", question: "x" }))).status).toBe(401);
  });
});
