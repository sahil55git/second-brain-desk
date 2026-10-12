// Held bills — drafts parked at the counter. Listing and holding never touch
// stock or the invoice counter; only saving a sale does.
import { NextRequest, NextResponse } from "next/server";
import { prisma, safeDbCall } from "@/lib/db";
import { holdLabel, parseHeldDraft } from "@/lib/billDraft";

export async function GET() {
  const result = await safeDbCall(() => prisma.heldBill.findMany({ orderBy: { createdAt: "asc" } }));
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 503 });
  return NextResponse.json({ data: result.data });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const draft = parseHeldDraft(body?.draft);
  if (!draft) {
    return NextResponse.json({ error: "Add at least one line before holding a bill." }, { status: 400 });
  }
  const partyName = draft.partyId
    ? await safeDbCall(() => prisma.party.findUnique({ where: { id: draft.partyId }, select: { name: true } }))
    : null;
  const label = holdLabel(partyName && partyName.ok ? partyName.data?.name : null);
  const heldBy = typeof body?.heldBy === "string" ? body.heldBy.slice(0, 80) : null;
  const result = await safeDbCall(() =>
    prisma.heldBill.create({
      data: { label, partyId: draft.partyId || null, draft: draft as unknown as object, heldBy },
    })
  );
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 503 });
  return NextResponse.json({ data: result.data }, { status: 201 });
}
