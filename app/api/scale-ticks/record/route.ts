// A settled weight from a signed-in phone or computer that reads a Bluetooth scale itself
// (lib/scaleBt.ts). The bridge's own route (/ingest) uses a shared secret instead of a login.
// The nonce makes a retry harmless: the same weighing is never saved twice.
import { NextRequest, NextResponse } from "next/server";
import { prisma, safeDbCall } from "@/lib/db";
import { getUser } from "@/lib/registerServer";
import { TABLE_HINT, missingTable } from "@/lib/attachmentServer";
import { checkTickInput } from "@/lib/scaleTickInput";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const input = checkTickInput(await req.json().catch(() => ({})));
  if (!input.ok) return NextResponse.json({ error: input.error }, { status: 400 });
  // The server clock decides "when"; the device may only say how long ago the weight settled.
  const settledAt = new Date(Date.now() - input.ageSec * 1000);
  const result = await safeDbCall(async () => {
    const existing = await prisma.scaleTick.findUnique({ where: { nonce: input.nonce }, select: { id: true } });
    if (existing) return { id: existing.id, duplicate: true };
    const t = await prisma.scaleTick.create({ data: { source: input.source, weightKg: input.weightKg, nonce: input.nonce, settledAt } });
    return { id: t.id, duplicate: false };
  });
  if (!result.ok) return NextResponse.json({ error: missingTable(result.error) ? TABLE_HINT : result.error }, { status: 503 });
  return NextResponse.json({ ok: true, ...result.data }, { status: result.data.duplicate ? 200 : 201 });
}
