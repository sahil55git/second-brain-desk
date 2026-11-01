// 9 pm summary to the owner's linked chats (Vercel Cron, vercel.json). Sends once a day at most,
// whoever calls it; with CRON_SECRET set in Vercel only the cron itself can call it.
import { NextRequest, NextResponse } from "next/server";
import { prisma, safeDbCall } from "@/lib/db";
import { businessDate } from "@/lib/register";
import { botKeys } from "@/lib/bot/config";
import { digestText } from "@/lib/bot/engine";
import { sendToOwners } from "@/lib/bot/push";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret ? req.headers.get("authorization") !== `Bearer ${secret}` : !/vercel-cron/i.test(req.headers.get("user-agent") || "")) {
    return NextResponse.json({ error: "Only the scheduled job can call this." }, { status: 401 });
  }
  const r = await safeDbCall(async () => {
    const k = await botKeys();
    if (!k.digestOn) return { skipped: "summary is off" };
    const today = businessDate(Date.now());
    // claim today's send first, so two calls never send it twice
    await prisma.botConfig.upsert({ where: { id: "singleton" }, create: { id: "singleton" }, update: {} });
    const claim = await prisma.botConfig.updateMany({ where: { id: "singleton", OR: [{ lastDigestDay: null }, { lastDigestDay: { not: today } }] }, data: { lastDigestDay: today } });
    if (!claim.count) return { skipped: "already sent today" };
    return sendToOwners({ text: await digestText(), buttons: [{ label: "📄 Today PDF", data: "cmd:report today pdf" }, { label: "🙌 Udhaar", data: "cmd:udhaar" }] });
  });
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 503 });
  return NextResponse.json({ data: r.data });
}
