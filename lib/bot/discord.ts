// Discord (free): checking that a request really comes from Discord (Ed25519 signature),
// registering the /m command, answering an interaction later, and direct messages.
import { createPublicKey, verify } from "crypto";
import { discordComponents, toDiscord, type BotReply } from "@/lib/bot/format";

const API = "https://discord.com/api/v10";
const ED25519_SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");

/** Discord signs every call to the interactions endpoint; anything else must get 401. */
export function verifyDiscord(publicKeyHex: string, signatureHex: string | null, timestamp: string | null, body: string): boolean {
  if (!signatureHex || !timestamp || !/^[0-9a-f]{64}$/i.test(publicKeyHex) || !/^[0-9a-f]{128}$/i.test(signatureHex)) return false;
  try {
    const key = createPublicKey({ key: Buffer.concat([ED25519_SPKI_PREFIX, Buffer.from(publicKeyHex, "hex")]), format: "der", type: "spki" });
    return verify(null, Buffer.from(timestamp + body), key, Buffer.from(signatureHex, "hex"));
  } catch {
    return false;
  }
}

export const DISCORD_COMMANDS = [
  {
    name: "m",
    description: "Mahadev Desk: today · udhaar ramesh · sale 500 upi suresh · report today pdf · help",
    options: [{ type: 3, name: "command", description: "What to ask or enter (help for the list)", required: true }],
    integration_types: [0, 1],
    contexts: [0, 1, 2],
  },
  { name: "today", description: "Mahadev Desk: today's figures", integration_types: [0, 1], contexts: [0, 1, 2] },
  { name: "udhaar", description: "Mahadev Desk: udhaar to collect", integration_types: [0, 1], contexts: [0, 1, 2] },
];

async function discordFetch(path: string, init: RequestInit & { botToken?: string }) {
  const headers: Record<string, string> = { ...(init.headers as Record<string, string>) };
  if (init.botToken) headers.Authorization = `Bot ${init.botToken}`;
  const r = await fetch(`${API}${path}`, { ...init, headers });
  if (!r.ok) throw new Error(`Discord said ${r.status}: ${(await r.text().catch(() => "")).slice(0, 200)}`);
  return r.status === 204 ? null : r.json().catch(() => null);
}

export async function registerDiscordCommands(appId: string, botToken: string) {
  await discordFetch(`/applications/${appId}/commands`, { method: "PUT", botToken, headers: { "Content-Type": "application/json" }, body: JSON.stringify(DISCORD_COMMANDS) });
}

export async function discordApp(botToken: string): Promise<{ id: string; name: string }> {
  return (await discordFetch("/applications/@me", { method: "GET", botToken })) as { id: string; name: string };
}

function messageBody(reply: BotReply, ephemeral: boolean): { body: BodyInit; headers: Record<string, string> } {
  const payload = { content: toDiscord(reply.text), components: discordComponents(reply.buttons), ...(ephemeral ? { flags: 64 } : {}), ...(reply.file ? { attachments: [{ id: 0, filename: reply.file.name }] } : { attachments: [] }) };
  if (!reply.file) return { body: JSON.stringify(payload), headers: { "Content-Type": "application/json" } };
  const fd = new FormData();
  fd.append("payload_json", JSON.stringify(payload));
  fd.append("files[0]", new Blob([Buffer.from(reply.file.base64, "base64")], { type: reply.file.mime }), reply.file.name);
  return { body: fd, headers: {} };
}

/** Fill in the "thinking…" message of an interaction. */
export async function discordEditOriginal(appId: string, interactionToken: string, reply: BotReply) {
  const m = messageBody(reply, false);
  await discordFetch(`/webhooks/${appId}/${interactionToken}/messages/@original`, { method: "PATCH", ...m });
}

/** A new message after a button press (private to the person who pressed). */
export async function discordFollowup(appId: string, interactionToken: string, reply: BotReply) {
  const m = messageBody(reply, true);
  await discordFetch(`/webhooks/${appId}/${interactionToken}`, { method: "POST", ...m });
}

export async function discordDM(botToken: string, userId: string, reply: BotReply) {
  const ch = (await discordFetch("/users/@me/channels", { method: "POST", botToken, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ recipient_id: userId }) })) as { id: string };
  const m = messageBody(reply, false);
  await discordFetch(`/channels/${ch.id}/messages`, { method: "POST", botToken, ...m });
}

export const discordInviteUrl = (appId: string) => `https://discord.com/oauth2/authorize?client_id=${appId}&scope=applications.commands+bot&permissions=0`;
