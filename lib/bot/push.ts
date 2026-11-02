// Messages the bot sends by itself: the 9 pm summary and test messages, to every chat
// account linked to an owner login.
import { prisma } from "@/lib/db";
import { botKeys } from "@/lib/bot/config";
import { tgSend } from "@/lib/bot/telegram";
import { discordDM } from "@/lib/bot/discord";
import type { BotReply } from "@/lib/bot/format";

export async function sendToOwners(reply: BotReply): Promise<{ sent: number; failed: string[] }> {
  const owners = (await prisma.user.findMany({ where: { role: "OWNER", active: true }, select: { username: true } })).map((u) => u.username);
  return sendToUsers(owners, reply);
}

/** To every chat account linked to these logins. */
export async function sendToUsers(usernames: string[], reply: BotReply): Promise<{ sent: number; failed: string[] }> {
  const keys = await botKeys();
  const links = await prisma.botLink.findMany({ where: { revokedAt: null, username: { in: usernames } } });
  let sent = 0;
  const failed: string[] = [];
  for (const l of links) {
    try {
      if (l.channel === "telegram" && keys.telegramToken && l.chatId) await tgSend(keys.telegramToken, l.chatId, reply);
      else if (l.channel === "discord" && keys.discordToken) await discordDM(keys.discordToken, l.externalId, reply);
      else continue;
      sent++;
    } catch (e) {
      failed.push(`${l.channel} ${l.label || l.externalId}: ${e instanceof Error ? e.message : e}`);
    }
  }
  return { sent, failed };
}
