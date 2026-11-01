// The in-app chat box: the same commands as Telegram / Discord, as the signed-in login.
import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/registerServer";
import { safeDbCall } from "@/lib/db";
import { handle, whoFor } from "@/lib/bot/engine";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const text = typeof body.text === "string" ? body.text.slice(0, 500) : "";
  const button = typeof body.button === "string" ? body.button.slice(0, 120) : "";
  if (!text && !button) return NextResponse.json({ error: "Type something." }, { status: 400 });
  const r = await safeDbCall(async () => {
    const who = await whoFor(user.username);
    if (!who) return null;
    return handle(button ? { button } : { text }, who, { channel: "app" });
  });
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 503 });
  if (!r.data) return NextResponse.json({ error: "This login has been switched off." }, { status: 403 });
  return NextResponse.json({ data: r.data });
}
