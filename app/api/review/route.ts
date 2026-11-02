// 🤖 AI advice on the week (owner): the weekly review numbers go to the AI provider set in
// Settings, which answers with 3–5 plain actions. Nothing is saved.
import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/registerServer";
import { reviewText } from "@/lib/bot/engine";
import { runAi } from "@/lib/aiProvider";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const SYSTEM = `You are the business adviser for Mahadev Traders, an edible-oil shop and mill in Bidar (crushing, job-work, retail and wholesale oil, own brand Ekatva). You get one week's numbers. Reply in short plain English a shop owner understands: first one line on how the week went, then 3 to 5 numbered actions for next week, each with the reason from the numbers. Use only the numbers given; never invent figures. Amounts are rupees.`;

export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user?.isOwner) return NextResponse.json({ error: "Owner access required." }, { status: 403 });
  try {
    const text = await reviewText(Date.now());
    const r = await runAi(SYSTEM, text);
    if (!r.ok || !r.text) return NextResponse.json({ data: { review: text, ai: null }, error: r.error || "AI is not set up (Settings → AI)." });
    return NextResponse.json({ data: { review: text, ai: r.text } });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Could not build the review." }, { status: 503 });
  }
}
