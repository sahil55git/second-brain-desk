// Where the chat apps' keys live: Vercel env variables win (TELEGRAM_BOT_TOKEN, DISCORD_APP_ID,
// DISCORD_PUBLIC_KEY, DISCORD_BOT_TOKEN); otherwise what the owner pasted on the 💬 Chat → Connect
// page (BotConfig row). Server only — tokens are never sent to the browser.
import { prisma } from "@/lib/db";

export interface BotKeys {
  telegramToken: string | null;
  telegramSecret: string | null;
  telegramName: string | null;
  telegramFromEnv: boolean;
  discordAppId: string | null;
  discordPublicKey: string | null;
  discordToken: string | null;
  discordFromEnv: boolean;
  digestOn: boolean;
  lastDigestDay: string | null;
}

export async function botKeys(): Promise<BotKeys> {
  const row = await prisma.botConfig.findUnique({ where: { id: "singleton" } }).catch(() => null);
  const env = process.env;
  return {
    telegramToken: env.TELEGRAM_BOT_TOKEN || row?.telegramToken || null,
    telegramSecret: row?.telegramSecret || null,
    telegramName: row?.telegramName || null,
    telegramFromEnv: !!env.TELEGRAM_BOT_TOKEN,
    discordAppId: env.DISCORD_APP_ID || row?.discordAppId || null,
    discordPublicKey: env.DISCORD_PUBLIC_KEY || row?.discordPublicKey || null,
    discordToken: env.DISCORD_BOT_TOKEN || row?.discordToken || null,
    discordFromEnv: !!(env.DISCORD_APP_ID && env.DISCORD_PUBLIC_KEY),
    digestOn: row ? row.digestOn : true,
    lastDigestDay: row?.lastDigestDay || null,
  };
}

export async function saveBotConfig(data: Partial<{ telegramToken: string | null; telegramSecret: string | null; telegramName: string | null; discordAppId: string | null; discordPublicKey: string | null; discordToken: string | null; digestOn: boolean; lastDigestDay: string | null }>) {
  await prisma.botConfig.upsert({ where: { id: "singleton" }, create: { id: "singleton", ...data }, update: data });
}

/** The site's public address for webhooks: the production URL when known. */
export function publicBase(reqOrigin: string): string {
  const u = process.env.NEXTAUTH_URL;
  return (u && u.startsWith("https://") ? u : reqOrigin).replace(/\/+$/, "");
}

export const TELEGRAM_TOKEN_RE = /^\d{6,12}:[A-Za-z0-9_-]{30,50}$/;
