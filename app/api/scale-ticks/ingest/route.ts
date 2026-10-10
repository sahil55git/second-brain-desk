// The scale bridge (tools/scale_bridge.py) posts each SETTLED weight here.
// Not a browser route: it is protected by a shared secret, not a login.
// Set SCALE_PUSH_SECRET in Vercel and give the same value to the bridge.
import { createHash, timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma, safeDbCall } from "@/lib/db";
import { TABLE_HINT, missingTable } from "@/lib/attachmentServer";
import { WEIGH_MAX_KG } from "@/lib/barrels";

export const dynamic = "force-dynamic";

function sameSecret(given: string, wanted: string) {
  const a = createHash("sha256").update(given).digest();
  const b = createHash("sha256").update(wanted).digest();
  return timingSafeEqual(a, b);
}

export async function POST(req: NextRequest) {
  const wanted = process.env.SCALE_PUSH_SECRET;
  if (!wanted || wanted.length < 16) return NextResponse.json({ error: "SCALE_PUSH_SECRET is not set on the server (16+ characters)." }, { status: 503 });
  const given = req.headers.get("x-scale-secret") || "";
  if (!given || !sameSecret(given, wanted)) return NextResponse.json({ error: "Wrong secret." }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const source = typeof body.source === "string" ? body.source : "";
  const nonce = typeof body.nonce === "string" ? body.nonce : "";
  const weightKg = Number(body.weightKg);
  if (!/^[A-Za-z0-9_-]{2,64}$/.test(source)) return NextResponse.json({ error: "Bad source name." }, { status: 400 });
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(nonce)) return NextResponse.json({ error: "Bad nonce." }, { status: 400 });
  if (!Number.isFinite(weightKg) || weightKg < 0.5 || weightKg > WEIGH_MAX_KG) return NextResponse.json({ error: "Weight out of range." }, { status: 400 });
  // The server clock decides "when"; the bridge may only say how many seconds ago it settled.
  const ageSec = Math.min(30, Math.max(0, Number(body.ageSec) || 0));
  const settledAt = new Date(Date.now() - ageSec * 1000);

  const result = await safeDbCall(async () => {
    const existing = await prisma.scaleTick.findUnique({ where: { nonce }, select: { id: true } });
    if (existing) return { id: existing.id, duplicate: true };
    const t = await prisma.scaleTick.create({ data: { source, weightKg: Math.round(weightKg * 100) / 100, nonce, settledAt } });
    return { id: t.id, duplicate: false };
  });
  if (!result.ok) return NextResponse.json({ error: missingTable(result.error) ? TABLE_HINT : result.error }, { status: 503 });
  return NextResponse.json({ ok: true, ...result.data }, { status: result.data.duplicate ? 200 : 201 });
}
