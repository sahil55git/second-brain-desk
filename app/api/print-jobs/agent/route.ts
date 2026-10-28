// The print helper on the shop PC (tools/print_helper.py --queue-url ...). Not a browser route:
// protected by a shared secret, not a login. Set PRINT_QUEUE_SECRET (16+ characters) in Vercel and give
// the same value to the helper; SCALE_PUSH_SECRET is accepted too, so the scale bridge's secret can be reused.
//   POST { action: "claim", version, dryRun, labelPrinter, slipPrinter }  -> { job: null | { id, kind, title, copies, items } }
//   POST { action: "done", id, ok, error? }
import { createHash, timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma, safeDbCall } from "@/lib/db";
import { TABLE_HINT, missingTable } from "@/lib/attachmentServer";
import { PRINTING_STALE_MS } from "@/lib/printQueue";

export const dynamic = "force-dynamic";

const same = (a: string, b: string) => timingSafeEqual(createHash("sha256").update(a).digest(), createHash("sha256").update(b).digest());
const clean = (v: unknown, n = 200) => (typeof v === "string" ? v.slice(0, n) : "");

export async function POST(req: NextRequest) {
  const secrets = [process.env.PRINT_QUEUE_SECRET, process.env.SCALE_PUSH_SECRET].filter((s): s is string => !!s && s.length >= 16);
  if (!secrets.length) return NextResponse.json({ error: "PRINT_QUEUE_SECRET is not set on the server (16+ characters)." }, { status: 503 });
  const given = req.headers.get("x-print-secret") || "";
  if (!given || !secrets.some((s) => same(given, s))) return NextResponse.json({ error: "Wrong secret." }, { status: 401 });

  const body = await req.json().catch(() => ({}));

  if (body.action === "claim") {
    const result = await safeDbCall(async () => {
      const now = new Date();
      const info = { labelPrinter: clean(body.labelPrinter), slipPrinter: clean(body.slipPrinter) };
      await prisma.printAgent.upsert({
        where: { id: "shop" },
        create: { id: "shop", lastSeen: now, version: clean(body.version, 20), dryRun: !!body.dryRun, info },
        update: { lastSeen: now, version: clean(body.version, 20), dryRun: !!body.dryRun, info },
      });
      await prisma.printJob.updateMany({ where: { status: "PRINTING", claimedAt: { lt: new Date(now.getTime() - PRINTING_STALE_MS) } }, data: { status: "FAILED", error: "The printer did not answer.", doneAt: now } });
      // take the oldest waiting job; the updateMany guard means two helpers can never take the same one
      for (let tries = 0; tries < 3; tries++) {
        const next = await prisma.printJob.findFirst({ where: { status: "QUEUED" }, orderBy: { createdAt: "asc" }, select: { id: true } });
        if (!next) return null;
        const took = await prisma.printJob.updateMany({ where: { id: next.id, status: "QUEUED" }, data: { status: "PRINTING", claimedAt: now, agent: "shop" } });
        if (took.count) return prisma.printJob.findUnique({ where: { id: next.id }, select: { id: true, kind: true, title: true, copies: true, items: true } });
      }
      return null;
    });
    if (!result.ok) return NextResponse.json({ error: missingTable(result.error) ? TABLE_HINT : result.error }, { status: 503 });
    return NextResponse.json({ ok: true, job: result.data });
  }

  if (body.action === "done") {
    const id = clean(body.id, 64);
    if (!id) return NextResponse.json({ error: "Missing job id." }, { status: 400 });
    const ok = body.ok === true;
    const result = await safeDbCall(() =>
      prisma.printJob.updateMany({
        where: { id, status: "PRINTING" },
        data: { status: ok ? "DONE" : "FAILED", error: ok ? null : clean(body.error, 300) || "The printer refused the job.", doneAt: new Date() },
      })
    );
    if (!result.ok) return NextResponse.json({ error: missingTable(result.error) ? TABLE_HINT : result.error }, { status: 503 });
    return NextResponse.json({ ok: true, updated: result.data.count });
  }

  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}
