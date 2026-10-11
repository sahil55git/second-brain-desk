// AI terminal — ask / check on a desk. ANSWER ONLY: it reads the desk's recent
// records and the form being filled, and explains. Nothing is saved or changed.
//
//   POST { desk, promptId?  | question?, form?: string, date?: YYYY-MM-DD, lang?: en|kn|both }
import { NextRequest, NextResponse } from "next/server";
import { prisma, safeDbCall } from "@/lib/db";
import { getUser, isValidDate, loadDay } from "@/lib/registerServer";
import { businessDate } from "@/lib/register";
import { registerContext, type RegisterRow } from "@/lib/registerSmart";
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

// The Quick Register is used by a manager who reads little: answer short, in the language asked.
const LANG_NOTE: Record<string, string> = {
  en: "Reply in very simple English, short lines.",
  kn: "Reply in very simple Kannada (ಕನ್ನಡ), short lines. Keep numbers, ₹ and names as they are.",
  both: "Reply in very simple English first, then the same answer in simple Kannada (ಕನ್ನಡ) underneath. Keep both short.",
};

async function registerCtx(date: string): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  const r = await safeDbCall(async () => {
    const day = await loadDay(date);
    const from = businessDate(Date.parse(`${date}T12:00:00+05:30`) - 30 * 86_400_000);
    const recent = await prisma.registerEntry.findMany({ where: { date: { gte: from, lte: date } }, orderBy: { createdAt: "asc" }, take: 2000 });
    return { day, recent };
  });
  if (!r.ok) return { ok: false, error: r.error };
  const toRow = (e: (typeof r.data.recent)[number]): RegisterRow => ({
    date: e.date, createdAt: e.createdAt, kind: e.kind as RegisterRow["kind"], item: e.item, itemLabel: e.itemLabel, qty: e.qty, unit: e.unit,
    rateInr: e.rateInr, amountInr: e.amountInr, paymentMode: e.paymentMode as RegisterRow["paymentMode"], partyName: e.partyName, notes: e.notes, details: e.details,
  });
  const { day } = r.data;
  const tallies = (["AFTERNOON", "NIGHT"] as const).flatMap((s) => {
    const t = day.tallies[s];
    return t ? [{ session: s === "AFTERNOON" ? "midday" : "closing", counted: t.counterCashInr, system: t.systemCashInr, diff: t.cashDiffInr }] : [];
  });
  return {
    ok: true,
    text: registerContext({
      date,
      today: day.entries.map(toRow),
      recent: r.data.recent.map(toRow),
      openingInr: day.opening.value,
      systemCashNowInr: day.systemCashNow,
      tallies,
      jobWork: day.jobWork.filter((j) => !j.settled),
      nowMs: Date.now(),
    }),
  };
}

async function contextFor(desk: AskDesk, isOwner: boolean, date: string): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  if (desk === "register") return registerCtx(date);
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

  const date = isValidDate(body.date) ? body.date : businessDate(Date.now());
  const ctx = await contextFor(desk, user.isOwner, date);
  if (!ctx.ok) return NextResponse.json({ error: ctx.error }, { status: 503 });

  const task = preset ? preset.instruction : `Question: ${question}`;
  const prompt = `${task}\n\nFORM (what is being entered right now, not yet saved):\n${form || "(empty)"}\n\nRECORDS:\n${cap(ctx.text)}`;
  const langNote = LANG_NOTE[String(body.lang)];
  const r = await runAi(langNote ? `${SYSTEM}\n\n${langNote}` : SYSTEM, prompt);
  if (!r.ok) return NextResponse.json({ error: r.error, notConfigured: r.notConfigured || false }, { status: r.notConfigured ? 200 : 502 });
  return NextResponse.json({ answer: r.text, provider: r.provider });
}
