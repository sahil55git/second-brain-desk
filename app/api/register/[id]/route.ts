// Quick Register — delete a mistaken entry. Staff may delete only today's
// entries (fixing a typo at the counter); the Owner may delete any entry.
import { NextRequest, NextResponse } from "next/server";
import { prisma, safeDbCall } from "@/lib/db";
import { getUser } from "@/lib/registerServer";
import { businessDate } from "@/lib/register";

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const found = await safeDbCall(() => prisma.registerEntry.findUnique({ where: { id: params.id } }));
  if (!found.ok) return NextResponse.json({ error: found.error }, { status: 503 });
  if (!found.data) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (!user.isOwner && found.data.date !== businessDate(Date.now())) {
    return NextResponse.json(
      { error: "Only the owner can delete entries from earlier days." },
      { status: 403 }
    );
  }
  const result = await safeDbCall(() => prisma.registerEntry.delete({ where: { id: params.id } }));
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 503 });
  return NextResponse.json({ ok: true });
}
