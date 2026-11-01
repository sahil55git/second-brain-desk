// Discord interactions endpoint: /m, /today, /udhaar and button presses. Every call is signed
// by Discord (checked here). Discord wants an answer within 3 seconds, so we say "thinking…"
// at once and fill the message in afterwards (waitUntil keeps the function running).
import { NextRequest, NextResponse } from "next/server";
import { botKeys } from "@/lib/bot/config";
import { handle, handleUnlinked, linkedWho, type BotCtx } from "@/lib/bot/engine";
import { discordEditOriginal, discordFollowup, verifyDiscord } from "@/lib/bot/discord";
import type { BotReply } from "@/lib/bot/format";

export const dynamic = "force-dynamic";

// Keep the function alive after the answer is sent (what @vercel/functions' waitUntil does,
// without the extra package): Vercel puts a request context on globalThis.
function waitUntil(p: Promise<unknown>) {
  const holder = (globalThis as unknown as Record<symbol, { get?: () => { waitUntil?: (p: Promise<unknown>) => void } } | undefined>)[Symbol.for("@vercel/request-context")];
  holder?.get?.()?.waitUntil?.(p);
}
export const maxDuration = 60;

interface DUser { id: string; username?: string; global_name?: string }
interface Interaction {
  type: number;
  token: string;
  data?: { name?: string; options?: { name: string; value: string }[]; custom_id?: string };
  member?: { user: DUser };
  user?: DUser;
}

export async function POST(req: NextRequest) {
  const keys = await botKeys();
  if (!keys.discordPublicKey || !keys.discordAppId) return NextResponse.json({ error: "Discord is not connected." }, { status: 404 });
  const body = await req.text();
  if (!verifyDiscord(keys.discordPublicKey, req.headers.get("x-signature-ed25519"), req.headers.get("x-signature-timestamp"), body)) {
    return new NextResponse("invalid request signature", { status: 401 });
  }
  const i = JSON.parse(body) as Interaction;
  if (i.type === 1) return NextResponse.json({ type: 1 }); // PING
  const user = i.member?.user ?? i.user;
  if (!user) return NextResponse.json({ type: 4, data: { content: "?", flags: 64 } });
  const appId = keys.discordAppId;
  const ctx: BotCtx = { channel: "discord", externalId: user.id, label: user.global_name || user.username || user.id };

  const work = async (): Promise<BotReply> => {
    const { who } = await linkedWho("discord", user.id);
    if (i.type === 2) {
      const text = i.data?.name === "m" ? String(i.data.options?.[0]?.value ?? "help") : String(i.data?.name ?? "help");
      return who ? handle({ text }, who, ctx) : handleUnlinked(text, ctx, "the Discord bot");
    }
    if (!who) return { text: "This Discord account is not linked. Send /m link 123456 with the code from the app." };
    return handle({ button: String(i.data?.custom_id ?? "") }, who, ctx);
  };

  if (i.type === 2) {
    waitUntil(work().then((r) => discordEditOriginal(appId, i.token, r)).catch((e) => console.error("discord", e)));
    return NextResponse.json({ type: 5, data: { flags: 64 } }); // "thinking…", only they see it
  }
  if (i.type === 3) {
    const isCmd = String(i.data?.custom_id || "").startsWith("cmd:");
    waitUntil(work().then((r) => (isCmd ? discordFollowup(appId, i.token, r) : discordEditOriginal(appId, i.token, r))).catch((e) => console.error("discord", e)));
    return NextResponse.json({ type: 6 }); // the button was pressed; the message changes in a moment
  }
  return NextResponse.json({ type: 4, data: { content: "Not supported.", flags: 64 } });
}
