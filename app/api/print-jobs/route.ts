// Print queue (browser side). A phone, tablet or PC queues a job here; the print helper on the shop PC prints it.
//   POST  { kind: "label"|"slip", title, copies, items: [{ png, widthMm, heightMm }] }  -> { id }
//   GET   ?limit=12   recent jobs (no pictures) + whether the shop printer is online
import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma, safeDbCall } from "@/lib/db";
import { getUser } from "@/lib/registerServer";
import { TABLE_HINT, missingTable } from "@/lib/attachmentServer";
import { QUEUED_STALE_MS, PRINTING_STALE_MS, agentOnline, checkQueueJob } from "@/lib/printQueue";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const checked = checkQueueJob(await req.json().catch(() => null));
  if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: 400 });
  const { job } = checked;
  const first = job.items[0];
  const result = await safeDbCall(() =>
    prisma.printJob.create({
      data: { createdBy: user.name || user.username, kind: job.kind, title: job.title, widthMm: first.widthMm, heightMm: first.heightMm, copies: job.copies, items: job.items as unknown as Prisma.InputJsonValue },
      select: { id: true },
    })
  );
  if (!result.ok) return NextResponse.json({ error: missingTable(result.error) ? TABLE_HINT : result.error }, { status: 503 });
  return NextResponse.json({ ok: true, id: result.data.id }, { status: 201 });
}

export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const limit = Math.min(50, Math.max(1, Number(req.nextUrl.searchParams.get("limit")) || 12));
  const now = Date.now();
  const result = await safeDbCall(async () => {
    // jobs the helper never finished or nobody collected are closed here, so the list never lies
    await prisma.printJob.updateMany({ where: { status: "PRINTING", claimedAt: { lt: new Date(now - PRINTING_STALE_MS) } }, data: { status: "FAILED", error: "The printer did not answer.", doneAt: new Date() } });
    await prisma.printJob.updateMany({ where: { status: "QUEUED", createdAt: { lt: new Date(now - QUEUED_STALE_MS) } }, data: { status: "CANCELLED", error: "Nobody printed it.", doneAt: new Date() } });
    const jobs = await prisma.printJob.findMany({
      orderBy: { createdAt: "desc" },
      take: limit,
      select: { id: true, createdAt: true, createdBy: true, kind: true, title: true, widthMm: true, heightMm: true, copies: true, status: true, error: true, doneAt: true },
    });
    const agent = await prisma.printAgent.findUnique({ where: { id: "shop" } });
    return { jobs, agent };
  });
  if (!result.ok) return NextResponse.json({ error: missingTable(result.error) ? TABLE_HINT : result.error }, { status: 503 });
  const { jobs, agent } = result.data;
  const info = (agent?.info ?? {}) as { labelPrinter?: string; slipPrinter?: string };
  return NextResponse.json({
    jobs,
    agent: { online: agentOnline(agent?.lastSeen, now), lastSeen: agent?.lastSeen ?? null, version: agent?.version ?? "", dryRun: !!agent?.dryRun, labelPrinter: info.labelPrinter ?? "", slipPrinter: info.slipPrinter ?? "" },
  });
}
