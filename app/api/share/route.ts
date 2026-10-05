// Send a report to Discord / Telegram / any webhook (Zapier, Make, n8n,
// Google Sheets via Zapier…). Owner only. Secrets live in Vercel
// environment variables — never in the database or the browser:
//   DISCORD_WEBHOOK_URL   – Discord channel → Integrations → Webhooks
//   TELEGRAM_BOT_TOKEN    – from @BotFather
//   TELEGRAM_CHAT_ID      – the group / person the bot posts to
//   REPORT_WEBHOOK_URL    – any HTTPS endpoint that accepts JSON
import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/registerServer";

export const dynamic = "force-dynamic";

const status = () => ({
  discord: !!process.env.DISCORD_WEBHOOK_URL,
  telegram: !!(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID),
  webhook: !!process.env.REPORT_WEBHOOK_URL,
});

export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user?.isOwner) return NextResponse.json({ error: "Owner access required." }, { status: 403 });
  return NextResponse.json({ data: status() });
}

export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user?.isOwner) return NextResponse.json({ error: "Owner access required." }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const channel = body.channel as "discord" | "telegram" | "webhook";
  const text = typeof body.text === "string" ? body.text.slice(0, 3800) : "";
  const fileName = typeof body.fileName === "string" ? body.fileName.replace(/[^\w.\- ]/g, "").slice(0, 80) : "report.pdf";
  const fileB64 = typeof body.fileBase64 === "string" && body.fileBase64.length < 12_000_000 ? body.fileBase64 : null;
  if (!text) return NextResponse.json({ error: "Nothing to send." }, { status: 400 });
  const s = status();
  if (!["discord", "telegram", "webhook"].includes(channel) || !s[channel]) {
    return NextResponse.json({ error: `${channel} is not set up yet — add its environment variable in Vercel.` }, { status: 400 });
  }
  const file = fileB64 ? new Blob([Buffer.from(fileB64, "base64")], { type: fileName.endsWith(".xlsx") ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" : "application/pdf" }) : null;
  try {
    let res: Response;
    if (channel === "discord") {
      const url = process.env.DISCORD_WEBHOOK_URL!;
      if (file) {
        const fd = new FormData();
        fd.append("payload_json", JSON.stringify({ content: text.slice(0, 1900) }));
        fd.append("files[0]", file, fileName);
        res = await fetch(url, { method: "POST", body: fd });
      } else res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content: text.slice(0, 1900) }) });
    } else if (channel === "telegram") {
      const base = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}`;
      const chat = process.env.TELEGRAM_CHAT_ID!;
      if (file) {
        const fd = new FormData();
        fd.append("chat_id", chat);
        fd.append("caption", text.slice(0, 1000));
        fd.append("document", file, fileName);
        res = await fetch(`${base}/sendDocument`, { method: "POST", body: fd });
      } else res = await fetch(`${base}/sendMessage`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chat_id: chat, text }) });
    } else {
      res = await fetch(process.env.REPORT_WEBHOOK_URL!, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: "second-brain-desk", text, report: body.report ?? null, sentAt: new Date().toISOString() }),
      });
    }
    if (!res.ok) return NextResponse.json({ error: `${channel} refused the message (HTTP ${res.status}).` }, { status: 502 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: `Could not reach ${channel}: ${e instanceof Error ? e.message : e}` }, { status: 502 });
  }
}
