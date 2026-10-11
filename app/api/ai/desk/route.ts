// AI terminal — ask / check on a desk. ANSWER ONLY: it reads the desk's recent
// records and the form being filled, and explains. Nothing is saved or changed.
//
//   POST { desk, promptId?  | question?, form?: string }
import { NextRequest, NextResponse } from "next/server";
import { prisma, safeDbCall } from "@/lib/db";
import { getUser } from "@/lib/registerServer";
import { runAi } from "@/lib/aiProvider";
import { ASK_DESKS, deskPrompt, type AskDesk } from "@/lib/aiPrompts";
import { barrelLotsContext, cap, expenseContext, purchaseContext, salesContext } from "@/lib/deskContext";
import { buildBusinessContext, type ReportData } from "@/lib/reports";
import { receiptSummary } from "@/lib/barrels";
import type { DailyClosingDTO, ExpenseDTO, JobWorkIntakeDTO, MfgBatchDTO, PurchaseBillDTO, SalesInvoiceDTO } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const SYSTEM = `You are the AI terminal inside "Second Brain Desk" for Mahadev Traders, an edible-oil business in Bidar, Karnataka (oil purchase in barrels, crushing, job-work, retail and wholesale sales). Answer ONLY from the records and the FORM given. Be short and specific: name the item, party, date, kg and ₹. Use plain English a shop owner understands; short bullet points are fine. If the data does not answer the question, say so plainly. Never invent a figure, never soften a real problem. You cannot save or change anything — if something should be changed, say what the person should change in the form. Amounts are Indian rupees (₹).`;

const json = (v: unknown) => JSON.parse(JSON.stringify(v));

async function contextFor(desk: AskDesk, isOwner: boolean): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  const include = { lineItems: true, party: { select: { name: true } } } as const;
  if (desk === "purchase" || desk === "sales") {
    const r = await safeDbCall(async () => {
      const bills = await prisma.purchaseBill.findMany({ include, orderBy: [{ date: "desc" }, { createdAt: "desc" }], take: 80 });
      const invoices = desk === "sales" ? await prisma.salesInvoice.findMany({ include, orderBy: [{ date: "desc" }, { createdAt: "desc" }], take: 80 }) : [];
      const lots =
        desk === "purchase" && isOwner
          ? await prisma.oilReceipt.findMany({ include: { barrels: true }, orderBy: { createdAt: "desc" }, take: 25 }).catch(() => [])
          : [];
      return { bills, invoices, lots };
    });
    if (!r.ok) return { ok: false, error: r.error };
    const bills = json(r.data.bills) as PurchaseBillDTO[];
    if (desk === "sales") return { ok: true, text: salesContext(json(r.data.invoices) as SalesInvoiceDTO[], bills) };
    const now = Date.now();
    const lots = r.data.lots.map((l) => {
      const s = receiptSummary(l, l.barrels, now);
      return { lotNo: l.lotNo, date: l.date, supplierName: l.supplierName, product: l.product, barrels: s.barrels, done: s.done, measuredNetKg: s.measuredNetKg, declaredNetKg: s.declaredNetKg, diffKg: s.diffKg };
    });
    return { ok: true, text: purchaseContext(bills) + (lots.length ? "\n\n" + barrelLotsContext(lots) : "") };
  }
  if (desk === "expense") {
    const r = await safeDbCall(() => prisma.expense.findMany({ include: { party: { select: { name: true } } }, orderBy: [{ date: "desc" }, { createdAt: "desc" }], take: 200 }));
    if (!r.ok) return { ok: false, error: r.error };
    return { ok: true, text: expenseContext(json(r.data) as ExpenseDTO[]) };
  }
  const [jw, cl, mf] = await Promise.all([
    safeDbCall(() => prisma.jobWorkIntake.findMany({ orderBy: { createdAt: "desc" }, take: 60 })),
    safeDbCall(() => prisma.dailyClosing.findMany({ orderBy: { createdAt: "desc" }, take: 60 })),
    safeDbCall(() => prisma.mfgBatch.findMany({ orderBy: { createdAt: "desc" }, take: 60 })),
  ]);
  if (!jw.ok || !cl.ok || !mf.ok) return { ok: false, error: (!jw.ok && jw.error) || (!cl.ok && cl.error) || (!mf.ok && mf.error) || "Database not connected" };
  const data: ReportData = { jobWork: json(jw.data) as JobWorkIntakeDTO[], closing: json(cl.data) as DailyClosingDTO[], mfg: json(mf.data) as MfgBatchDTO[] };
  return { ok: true, text: buildBusinessContext(data) };
}

export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const desk = ASK_DESKS.find((d) => d === body.desk);
  if (!desk) return NextResponse.json({ error: "Unknown desk." }, { status: 400 });
  const preset = typeof body.promptId === "string" ? deskPrompt(desk, body.promptId) : null;
  if (preset?.id === "barrels" && !user.isOwner) return NextResponse.json({ error: "Only the owner can see barrel figures." }, { status: 403 });
  const question = typeof body.question === "string" ? body.question.trim().slice(0, 600) : "";
  if (!preset && !question) return NextResponse.json({ error: "Ask a question or pick one of the ready questions." }, { status: 400 });
  const form = typeof body.form === "string" ? body.form.slice(0, 3000) : "";

  const ctx = await contextFor(desk, user.isOwner);
  if (!ctx.ok) return NextResponse.json({ error: ctx.error }, { status: 503 });

  const task = preset ? preset.instruction : `Question: ${question}`;
  const prompt = `${task}\n\nFORM (what is being entered right now, not yet saved):\n${form || "(empty)"}\n\nRECORDS:\n${cap(ctx.text)}`;
  const r = await runAi(SYSTEM, prompt);
  if (!r.ok) return NextResponse.json({ error: r.error, notConfigured: r.notConfigured || false }, { status: r.notConfigured ? 200 : 502 });
  return NextResponse.json({ answer: r.text, provider: r.provider });
}
