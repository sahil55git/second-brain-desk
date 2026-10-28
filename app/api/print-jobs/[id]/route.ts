// One queued job: cancel it while it waits, or queue it again.  POST { action: "cancel" | "reprint" }
import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma, safeDbCall } from "@/lib/db";
import { getUser } from "@/lib/registerServer";
import { TABLE_HINT, missingTable } from "@/lib/attachmentServer";
import { canCancel, canReprint } from "@/lib/printQueue";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const action = body?.action;
  if (action !== "cancel" && action !== "reprint") return NextResponse.json({ error: "Unknown action." }, { status: 400 });

  const result = await safeDbCall(async () => {
    const job = await prisma.printJob.findUnique({ where: { id: params.id } });
    if (!job) return { code: 404 as const, error: "No such print job." };
    if (action === "cancel") {
      if (!canCancel(job.status)) return { code: 409 as const, error: "It has already started printing." };
      const r = await prisma.printJob.updateMany({ where: { id: job.id, status: "QUEUED" }, data: { status: "CANCELLED", doneAt: new Date() } });
      return r.count ? { code: 200 as const, id: job.id } : { code: 409 as const, error: "It has already started printing." };
    }
    if (!canReprint(job.status)) return { code: 409 as const, error: "Wait until it has finished." };
    const again = await prisma.printJob.create({
      data: { createdBy: user.name || user.username, kind: job.kind, title: job.title, widthMm: job.widthMm, heightMm: job.heightMm, copies: job.copies, items: (job.items ?? []) as Prisma.InputJsonValue },
      select: { id: true },
    });
    return { code: 201 as const, id: again.id };
  });
  if (!result.ok) return NextResponse.json({ error: missingTable(result.error) ? TABLE_HINT : result.error }, { status: 503 });
  const r = result.data;
  if ("error" in r) return NextResponse.json({ error: r.error }, { status: r.code });
  return NextResponse.json({ ok: true, id: r.id }, { status: r.code });
}
