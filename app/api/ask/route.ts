// 💡 Ask your business (owner): a question in plain words → answered from a digest of a year of records.
import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/registerServer";
import { runAi } from "@/lib/aiProvider";
import { ASK_SYSTEM, businessDigest } from "@/lib/askContext";
import { loadYear } from "@/lib/aiServer";
import { featureOn } from "@/lib/featuresServer";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user?.isOwner) return NextResponse.json({ error: "Owner access required." }, { status: 403 });
  if (!(await featureOn("askBusiness"))) return NextResponse.json({ error: "Ask your business is switched off." }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const q = typeof b.question === "string" ? b.question.trim().slice(0, 600) : "";
  if (!q) return NextResponse.json({ error: "Type a question." }, { status: 400 });
  try {
    const { d, today } = await loadYear();
    const r = await runAi(ASK_SYSTEM, `DATA\n${businessDigest(d, today)}\n\nQUESTION\n${q}`);
    if (!r.ok || !r.text) return NextResponse.json({ error: r.error || "AI is not set up (add GEMINI_API_KEY in Vercel)." }, { status: 503 });
    return NextResponse.json({ data: { answer: r.text, provider: r.provider } });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Could not answer." }, { status: 503 });
  }
}
