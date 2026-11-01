// Telegram Bot API (free): sending replies, files and buttons; setting the webhook.
import { telegramKeyboard, toTelegramHtml, type BotReply } from "@/lib/bot/format";

const API = (token: string, method: string) => `https://api.telegram.org/bot${token}/${method}`;

export async function tg<T = unknown>(token: string, method: string, body: Record<string, unknown> = {}): Promise<T> {
  const r = await fetch(API(token, method), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = (await r.json().catch(() => ({}))) as { ok?: boolean; result?: T; description?: string };
  if (!j.ok) throw new Error(j.description || `Telegram ${method} failed (HTTP ${r.status})`);
  return j.result as T;
}

/** Send a reply; with editId, replace that message (the ✅ Save / ❌ Cancel one) instead. */
export async function tgSend(token: string, chatId: string, reply: BotReply, editId?: number): Promise<void> {
  const markup = telegramKeyboard(reply.buttons);
  if (reply.file) {
    const fd = new FormData();
    fd.append("chat_id", chatId);
    fd.append("caption", toTelegramHtml(reply.text).slice(0, 1000));
    fd.append("parse_mode", "HTML");
    fd.append("document", new Blob([Buffer.from(reply.file.base64, "base64")], { type: reply.file.mime }), reply.file.name);
    if (markup) fd.append("reply_markup", JSON.stringify(markup));
    const r = await fetch(API(token, "sendDocument"), { method: "POST", body: fd });
    if (!r.ok) throw new Error(`Telegram sendDocument failed (HTTP ${r.status})`);
    return;
  }
  const body = { chat_id: chatId, text: toTelegramHtml(reply.text), parse_mode: "HTML", disable_web_page_preview: true, ...(markup ? { reply_markup: markup } : {}) };
  if (editId) {
    try {
      await tg(token, "editMessageText", { ...body, message_id: editId });
      return;
    } catch {
      /* too old to edit: send it new */
    }
  }
  await tg(token, "sendMessage", body);
}

export const TELEGRAM_COMMANDS = [
  { command: "today", description: "Today's sales, cash, UPI, udhaar" },
  { command: "week", description: "Last 7 days" },
  { command: "month", description: "This month" },
  { command: "cash", description: "Cash in the counter today" },
  { command: "udhaar", description: "Udhaar to collect (udhaar ramesh for one person)" },
  { command: "stock", description: "Oil stock" },
  { command: "jobwork", description: "Job-work waiting" },
  { command: "barrels", description: "Barrels to weigh / waiting" },
  { command: "alerts", description: "What needs attention" },
  { command: "help", description: "Everything I can do" },
];
