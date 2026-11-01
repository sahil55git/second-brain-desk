// Owner: connect / disconnect Telegram and Discord, the 9 pm summary, every linked chat
// account and the latest bot messages. Tokens go in, never come back out.
import { randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/registerServer";
import { prisma, safeDbCall } from "@/lib/db";
import { TELEGRAM_TOKEN_RE, botKeys, publicBase, saveBotConfig } from "@/lib/bot/config";
import { TELEGRAM_COMMANDS, tg } from "@/lib/bot/telegram";
import { discordApp, discordInviteUrl, registerDiscordCommands } from "@/lib/bot/discord";
import { digestText } from "@/lib/bot/engine";
import { sendToOwners } from "@/lib/bot/push";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function status(origin: string) {
  const k = await botKeys();
  const base = publicBase(origin);
  const [links, log] = await Promise.all([
    prisma.botLink.findMany({ where: { revokedAt: null }, orderBy: { createdAt: "desc" }, select: { id: true, channel: true, label: true, username: true, createdAt: true, lastUsedAt: true } }),
    prisma.botLog.findMany({ orderBy: { at: "desc" }, take: 25, select: { id: true, at: true, channel: true, username: true, text: true, ok: true } }),
  ]);
  return {
    telegram: { on: !!(k.telegramToken && k.telegramSecret), name: k.telegramName, fromEnv: k.telegramFromEnv, tokenSet: !!k.telegramToken },
    discord: {
      on: !!(k.discordAppId && k.discordPublicKey && k.discordToken),
      appId: k.discordAppId,
      fromEnv: k.discordFromEnv,
      endpoint: `${base}/api/bot/discord`,
      invite: k.discordAppId ? discordInviteUrl(k.discordAppId) : null,
    },
    digestOn: k.digestOn,
    lastDigestDay: k.lastDigestDay,
    links,
    log,
  };
}

export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user?.isOwner) return NextResponse.json({ error: "Owner access required." }, { status: 403 });
  const r = await safeDbCall(() => status(req.nextUrl.origin));
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 503 });
  return NextResponse.json({ data: r.data });
}

const fail = (error: string, code = 400) => NextResponse.json({ error }, { status: code });

export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user?.isOwner) return fail("Owner access required.", 403);
  const body = await req.json().catch(() => ({}));
  const action = String(body.action || "");
  const base = publicBase(req.nextUrl.origin);
  try {
    const k = await botKeys();
    if (action === "telegram") {
      const token = typeof body.token === "string" && body.token.trim() ? body.token.trim() : k.telegramToken;
      if (!token || !TELEGRAM_TOKEN_RE.test(token)) return fail("That does not look like a bot token. Copy the whole line BotFather sent (numbers:letters).");
      const me = await tg<{ username: string }>(token, "getMe").catch(() => null);
      if (!me) return fail("Telegram did not accept that token. Check it in @BotFather → /mybots → API Token.");
      const secret = randomBytes(24).toString("hex");
      await tg(token, "setWebhook", { url: `${base}/api/bot/telegram`, secret_token: secret, allowed_updates: ["message", "callback_query"], drop_pending_updates: true });
      await tg(token, "setMyCommands", { commands: TELEGRAM_COMMANDS }).catch(() => {});
      await tg(token, "setMyDescription", { description: "Mahadev Traders, Bidar — the shop desk in a chat: today's figures, udhaar, stock, entries, PDF reports. Link with the code from the app." }).catch(() => {});
      await saveBotConfig({ telegramToken: k.telegramFromEnv ? null : token, telegramSecret: secret, telegramName: me.username });
    } else if (action === "telegram-off") {
      if (k.telegramToken) await tg(k.telegramToken, "deleteWebhook").catch(() => {});
      await saveBotConfig({ telegramToken: null, telegramSecret: null, telegramName: null });
    } else if (action === "discord") {
      const pick = (v: unknown, cur: string | null) => (typeof v === "string" && v.trim() ? v.trim() : cur);
      const appId = pick(body.appId, k.discordAppId);
      const publicKey = pick(body.publicKey, k.discordPublicKey);
      const token = pick(body.token, k.discordToken);
      if (!appId || !/^\d{15,22}$/.test(appId)) return fail("Application ID: the long number on the Discord app's General Information page.");
      if (!publicKey || !/^[0-9a-f]{64}$/i.test(publicKey)) return fail("Public key: the 64-letter key on the same page.");
      if (!token || token.length < 50) return fail("Bot token: Discord app → Bot → Reset Token → copy.");
      const app = await discordApp(token).catch(() => null);
      if (!app || app.id !== appId) return fail("Discord did not accept that bot token for this application.");
      await registerDiscordCommands(appId, token);
      await saveBotConfig({ discordAppId: appId, discordPublicKey: publicKey.toLowerCase(), discordToken: token });
    } else if (action === "discord-off") {
      await saveBotConfig({ discordAppId: null, discordPublicKey: null, discordToken: null });
    } else if (action === "digest") {
      await saveBotConfig({ digestOn: !!body.on });
    } else if (action === "digest-now") {
      const r = await sendToOwners({ text: await digestText() });
      if (!r.sent) return fail(r.failed.length ? r.failed.join(" | ") : "No owner chat is linked yet. Link your Telegram or Discord first.");
    } else if (action === "revoke") {
      await prisma.botLink.updateMany({ where: { id: String(body.id || "") }, data: { revokedAt: new Date() } });
    } else return fail("Unknown action.");
    return NextResponse.json({ data: await status(req.nextUrl.origin) });
  } catch (e) {
    return fail(e instanceof Error ? e.message : "That did not work.", 502);
  }
}
