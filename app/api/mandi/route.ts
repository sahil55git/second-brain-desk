// 🌾 Mandi prices (owner). GET → { rows, signals, updatedAt }; POST { refresh: true } pulls today's
// feed; POST { commodity, modalQtl, market? } adds your own rate (₹ per quintal).
import { NextRequest, NextResponse } from "next/server";
import { safeDbCall } from "@/lib/db";
import { getUser } from "@/lib/registerServer";
import { COMMODITIES, mandiSignals } from "@/lib/mandi";
import { addManualRate, loadMandi, refreshMandi } from "@/lib/mandiServer";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user?.isOwner) return NextResponse.json({ error: "Owner access required." }, { status: 403 });
  const r = await safeDbCall(loadMandi);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 503 });
  return NextResponse.json({ data: { ...r.data, signals: mandiSignals(r.data.rows, COMMODITIES), keySet: !!process.env.DATA_GOV_API_KEY } });
}

export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user?.isOwner) return NextResponse.json({ error: "Owner access required." }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  if (b.refresh) {
    const r = await safeDbCall(refreshMandi);
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 503 });
    return NextResponse.json({ data: r.data });
  }
  const commodity = typeof b.commodity === "string" ? b.commodity.trim().slice(0, 60) : "";
  const modal = Number(b.modalQtl);
  if (!commodity || !(modal > 0)) return NextResponse.json({ error: "Seed and ₹ per quintal are needed." }, { status: 400 });
  const r = await safeDbCall(() => addManualRate(commodity, modal, typeof b.market === "string" ? b.market.slice(0, 60) : ""));
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 503 });
  return NextResponse.json({ ok: true });
}
