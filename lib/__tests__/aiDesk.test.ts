// The AI terminal's server side: fills are tidied to the desk's own fields, and
// "ask" is answer-only, signed-in only, and never shows staff the barrel figures.
import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const st = vi.hoisted(() => ({ user: { name: "Sahil", role: "OWNER", isOwner: true } as Row | null, prompts: [] as string[], reply: "" }));

vi.mock("@/lib/registerServer", () => ({ getUser: async () => st.user }));
vi.mock("@/lib/aiProvider", () => ({
  runAi: async (_system: string, user: string) => {
    st.prompts.push(user);
    return { ok: true, text: st.reply, provider: "test" };
  },
}));
vi.mock("@/lib/db", () => {
  const bill = { billNo: "SIV-649", date: "2026-10-05", partyId: "p1", paymentMode: "CREDIT", totalInr: 358722, party: { name: "Pawan Refineries" }, lineItems: [{ itemId: "i1", name: "Refined Sunflower", qty: 2190, unit: "kg", rateInr: 156, gstRatePct: 5 }] };
  const lot = { lotNo: "R261006-1", date: "2026-10-06", supplierName: "Sri Balaji", product: "Sunflower oil", declaredNetKg: 720, declaredBarrels: 4, rateInrPerKg: 130, barrels: [{ id: "b1", seq: 1, code: "R261006-1-01", declaredNetKg: null, grossKg: 192, grossAt: new Date(), grossSource: "SCALE", emptyKg: 12, emptyAt: new Date(), emptySource: "SCALE" }] };
  const prisma = {
    purchaseBill: { findMany: async () => [bill] },
    salesInvoice: { findMany: async () => [] },
    oilReceipt: { findMany: async () => [lot] },
    expense: { findMany: async () => [] },
    jobWorkIntake: { findMany: async () => [] },
    dailyClosing: { findMany: async () => [] },
    mfgBatch: { findMany: async () => [] },
  };
  return { prisma, safeDbCall: async (fn: () => Promise<unknown>) => ({ ok: true, data: await fn() }) };
});

import { NextRequest } from "next/server";
import { POST as ask } from "@/app/api/ai/desk/route";
import { POST as fill } from "@/app/api/ai-fill/route";

const post = (url: string, body: unknown) => new NextRequest(`http://localhost${url}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

beforeEach(() => {
  st.user = { name: "Sahil", role: "OWNER", isOwner: true };
  st.prompts = [];
  st.reply = "";
  delete process.env.GEMINI_API_KEY;
});

describe("AI ask / check", () => {
  it("answers a ready question with the desk's records and the form being filled", async () => {
    st.reply = "Rate is normal.";
    const res = await ask(post("/api/ai/desk", { desk: "purchase", promptId: "check", form: "Supplier: Pawan; Bill no.: SIV-700" }));
    expect(res.status).toBe(200);
    expect((await res.json()).answer).toBe("Rate is normal.");
    expect(st.prompts[0]).toContain("Bill no.: SIV-700");
    expect(st.prompts[0]).toContain("bill SIV-649 Pawan Refineries [CREDIT]");
    expect(st.prompts[0]).toContain("BARREL LOTS"); // owner sees barrel figures
  });
  it("never gives staff the barrel lots or the barrel question", async () => {
    st.user = { name: "Nilkant", role: "STAFF", isOwner: false };
    await ask(post("/api/ai/desk", { desk: "purchase", question: "what did we buy?" }));
    expect(st.prompts[0]).not.toContain("BARREL LOTS");
    expect((await ask(post("/api/ai/desk", { desk: "purchase", promptId: "barrels" }))).status).toBe(403);
  });
  it("needs a sign-in, a known desk and a question", async () => {
    expect((await ask(post("/api/ai/desk", { desk: "nope", question: "x" }))).status).toBe(400);
    expect((await ask(post("/api/ai/desk", { desk: "sales" }))).status).toBe(400);
    st.user = null;
    expect((await ask(post("/api/ai/desk", { desk: "sales", question: "x" }))).status).toBe(401);
  });
});

describe("AI fill", () => {
  it("keeps only the desk's fields, cleans item lines and fixes enum case", async () => {
    st.reply = JSON.stringify({
      partyName: "PAWAN REFINER",
      billNo: "SIV-649",
      date: "05/10/2026",
      paymentMode: "credit",
      billTotalInr: "3,58,722",
      lines: [{ name: "Refined sunflower", qty: "2190", rateInr: 156, gstRatePct: 5 }, { foo: 1 }],
      hacker: "drop me",
    });
    const res = await fill(post("/api/ai-fill", { desk: "purchase", text: "Pawan bill" }));
    const j = await res.json();
    expect(j.fields).toEqual({
      partyName: "PAWAN REFINER",
      billNo: "SIV-649",
      paymentMode: "CREDIT",
      billTotalInr: 358722,
      lines: [{ name: "Refined sunflower", hsnCode: "", qty: 2190, unit: "kg", rateInr: 156, gstRatePct: 5 }],
    }); // the non-ISO date is dropped rather than guessed
  });
  it("fills a spoken stock count by product", async () => {
    st.reply = '{"stock_sf": 420, "stock_karadi1": "1310", "stock_unknown": 5}';
    const j = await (await fill(post("/api/ai-fill", { desk: "stock", text: "sunflower 420 karadi 1310" }))).json();
    expect(j.fields).toEqual({ stock_sf: 420, stock_karadi1: 1310 });
  });
  it("refuses anonymous callers", async () => {
    st.user = null;
    expect((await fill(post("/api/ai-fill", { desk: "sales", text: "x" }))).status).toBe(401);
  });
});
