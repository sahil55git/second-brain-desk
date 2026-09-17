import { NextRequest, NextResponse } from "next/server";
import { prisma, safeDbCall } from "@/lib/db";
import { buildBusinessContext, type ReportData } from "@/lib/reports";
import { runAi } from "@/lib/aiProvider";
import type { JobWorkIntakeDTO, DailyClosingDTO, MfgBatchDTO } from "@/lib/types";

const SYSTEM = `You are the assistant for "Second Brain Desk", an operations dashboard for
Mahadev Traders — an edible-oil business in India (job-work crushing, self-crushing
manufacturing, daily cash/stock closing). Answer ONLY from the data provided in the
user's message. Be concise and specific: name the actual customer, batch, date, or
figure involved. If the data does not contain the answer, say so plainly rather than
guessing. This is a GST/ITC-04-compliance-relevant tool, so never soften or invent a
flag — if nothing is flagged, say nothing is flagged. Amounts are in Indian rupees (₹).`;

// Advisor actions map to a specific instruction (plan doc, Version 18).
const ADVISOR_ACTIONS: Record<string, string> = {
  audit:
    "Audit for compliance risks: old unsettled job-work intakes, escalated cash mismatches, mass-balance/oil-cake/short-extra flags on manufacturing batches, and stock gaps. Name the customer/batch/date/amount for each real risk, or state plainly that nothing is flagged.",
  checklist:
    "Act as a mentor and give today's process checklist: what still needs doing today (manufacturing steps to log, cash counted, old pending settlements to follow up). Keep it short and actionable.",
  improvement:
    "Look for one real repeating pattern in the data and recommend exactly one concrete improvement. Not a generic list — one specific thing grounded in what you actually see.",
  selfdiag:
    "Self-diagnostic: point out what this dashboard is NOT yet tracking that would matter for this business, based only on gaps visible in the data (e.g. desks with no entries, missing figures). Do not invent capabilities.",
};

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const mode = body.mode === "advisor" ? "advisor" : "ask";
  const question = typeof body.question === "string" ? body.question.trim() : "";
  const action = typeof body.action === "string" ? body.action : "";

  if (mode === "ask" && !question) {
    return NextResponse.json({ error: "question is required" }, { status: 400 });
  }

  const [jwR, clR, mfR] = await Promise.all([
    safeDbCall(() => prisma.jobWorkIntake.findMany({ orderBy: { createdAt: "desc" }, take: 60 })),
    safeDbCall(() => prisma.dailyClosing.findMany({ orderBy: { createdAt: "desc" }, take: 60 })),
    safeDbCall(() => prisma.mfgBatch.findMany({ orderBy: { createdAt: "desc" }, take: 60 })),
  ]);

  if (!jwR.ok || !clR.ok || !mfR.ok) {
    const err = (!jwR.ok && jwR.error) || (!clR.ok && clR.error) || (!mfR.ok && mfR.error);
    return NextResponse.json({ error: err || "Database not connected" }, { status: 503 });
  }

  const data: ReportData = {
    jobWork: JSON.parse(JSON.stringify(jwR.data)) as JobWorkIntakeDTO[],
    closing: JSON.parse(JSON.stringify(clR.data)) as DailyClosingDTO[],
    mfg: JSON.parse(JSON.stringify(mfR.data)) as MfgBatchDTO[],
  };

  const context = buildBusinessContext(data);

  let userPrompt: string;
  if (mode === "advisor") {
    const instruction = ADVISOR_ACTIONS[action] || ADVISOR_ACTIONS.audit;
    userPrompt = `${instruction}\n\nHere is the current business data:\n\n${context}`;
  } else {
    userPrompt = `Question: ${question}\n\nHere is the current business data:\n\n${context}`;
  }

  const result = await runAi(SYSTEM, userPrompt);

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, notConfigured: result.notConfigured || false, provider: result.provider },
      { status: result.notConfigured ? 200 : 502 }
    );
  }

  return NextResponse.json({ answer: result.text, provider: result.provider });
}
