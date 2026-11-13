// The owner's OK (or refusal) for a register entry that staff saved above their limit
// (lib/approval.ts). Owner only. The entry is never deleted here: the cash already left the
// drawer, so a refused entry stays in the register, marked, for the owner to follow up.
import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma, safeDbCall } from "@/lib/db";
import { getUser } from "@/lib/registerServer";
import { approvalOf, decide } from "@/lib/approval";
import { rupees, writeAudit } from "@/lib/auditServer";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (!user.isOwner) return NextResponse.json({ error: "Only the owner can give the OK." }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const decision = body.decision === "approve" ? "approve" : body.decision === "reject" ? "reject" : null;
  if (!decision) return NextResponse.json({ error: "decision must be approve or reject." }, { status: 400 });
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";

  const result = await safeDbCall<{ status: number; error?: string }>(() =>
    prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const e = await tx.registerEntry.findUnique({ where: { id: params.id } });
      if (!e) return { status: 404, error: "Entry not found." };
      if (approvalOf(e.details) !== "pending") return { status: 409, error: "This entry is not waiting for an OK." };
      const details = decide(e.details, decision, user.name || user.username || "owner", new Date().toISOString(), reason);
      await tx.registerEntry.update({ where: { id: e.id }, data: { details: details as Prisma.InputJsonValue } });
      await writeAudit(tx, user, decision === "approve" ? "APPROVE" : "REJECT", "RegisterEntry", e.id, `${e.kind} ${rupees(e.amountInr)}${e.partyName ? " " + e.partyName : ""} by ${e.createdByName || "staff"}`, e, { ...e, details });
      return { status: 200 };
    })
  );
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 503 });
  if (result.data.status !== 200) return NextResponse.json({ error: result.data.error }, { status: result.data.status });
  return NextResponse.json({ ok: true });
}
