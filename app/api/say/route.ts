// 🔊 Spoken answers: turn a chat reply into short Kannada or Hindi for the phone to read aloud.
import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/registerServer";
import { runAi } from "@/lib/aiProvider";

export const dynamic = "force-dynamic";
export const maxDuration = 30;
const NAME: Record<string, string> = { kn: "Kannada (ಕನ್ನಡ)", hi: "Hindi (हिन्दी)" };

export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const b = await req.json().catch(() => ({}));
  const text = typeof b.text === "string" ? b.text.replace(/\*\*/g, "").slice(0, 1500) : "";
  const lang = NAME[b.lang as string];
  if (!text || !lang) return NextResponse.json({ data: { text } });
  const r = await runAi(`Translate the shop message into simple spoken ${lang} for reading aloud. Keep numbers as digits, ₹ as rupees, names as they are. Reply with only the translation.`, text);
  return NextResponse.json({ data: { text: r.ok && r.text ? r.text.trim() : text } });
}
