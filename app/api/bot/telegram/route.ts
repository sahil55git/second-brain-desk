// Telegram webhook: every message and button press sent to the bot arrives here. Telegram
// sends the secret we gave it when the bot was connected; anything without it is refused.
// Outside the sign-in check (middleware.ts): the chat account's link decides what it may do.
import { NextRequest, NextResponse } from "next/server";
import { botKeys } from "@/lib/bot/config";
import { handle, handleUnlinked, linkedWho, type BotCtx } from "@/lib/bot/engine";
import { tg, tgSend } from "@/lib/bot/telegram";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface TgUser { id: number; username?: string; first_name?: string }
interface TgMessage { message_id: number; text?: string; chat: { id: number }; from?: TgUser; photo?: unknown; voice?: unknown; document?: unknown }
interface TgUpdate { message?: TgMessage; callback_query?: { id: string; data?: string; from: TgUser; message?: TgMessage } }

export async function POST(req: NextRequest) {
  const keys = await botKeys();
  if (!keys.telegramToken || !keys.telegramSecret) return NextResponse.json({ error: "Telegram is not connected." }, { status: 404 });
  if (req.headers.get("x-telegram-bot-api-secret-token") !== keys.telegramSecret) return NextResponse.json({ error: "Wrong secret." }, { status: 401 });
  const token = keys.telegramToken;
  const u = (await req.json().catch(() => ({}))) as TgUpdate;
  try {
    if (u.message?.from) {
      const m = u.message;
      const from = m.from!;
      const ctx: BotCtx = { channel: "telegram", externalId: String(from.id), chatId: String(m.chat.id), label: from.username ? `@${from.username}` : from.first_name || String(from.id) };
      const text = (m.text || "").trim();
      const { who } = await linkedWho("telegram", ctx.externalId!);
      if (!text) {
        await tgSend(token, ctx.chatId!, { text: "I read text messages for now. Send **help** for the list." });
      } else if (!who) {
        await tgSend(token, ctx.chatId!, await handleUnlinked(text, ctx, keys.telegramName ? `@${keys.telegramName}` : "the shop bot"));
      } else {
        await tg(token, "sendChatAction", { chat_id: ctx.chatId, action: /pdf|excel|xlsx/i.test(text) ? "upload_document" : "typing" }).catch(() => {});
        await tgSend(token, ctx.chatId!, await handle({ text }, who, ctx));
      }
    } else if (u.callback_query) {
      const q = u.callback_query;
      const chatId = q.message ? String(q.message.chat.id) : String(q.from.id);
      const ctx: BotCtx = { channel: "telegram", externalId: String(q.from.id), chatId, label: q.from.username ? `@${q.from.username}` : q.from.first_name };
      const { who } = await linkedWho("telegram", ctx.externalId!);
      await tg(token, "answerCallbackQuery", { callback_query_id: q.id, ...(who ? {} : { text: "This chat is not linked.", show_alert: true }) }).catch(() => {});
      if (who && q.data) {
        const reply = await handle({ button: q.data }, who, ctx);
        // ✅ / ❌ / ↩️ replace the message they were on; other buttons answer below it
        await tgSend(token, chatId, reply, q.data.startsWith("cmd:") ? undefined : q.message?.message_id);
      }
    }
  } catch (e) {
    console.error("telegram webhook", e);
  }
  // always 200: otherwise Telegram sends the same update again and again
  return NextResponse.json({ ok: true });
}
