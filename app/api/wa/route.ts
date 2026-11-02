// 🛒 WhatsApp ordering webhook (Meta WhatsApp Cloud API). Customers message the shop's WhatsApp
// Business number: "5 L mustard, 2 tin groundnut" → priced from the rate cards → Confirm / Cancel
// buttons → the order lands in /orders and the owner gets a Telegram / Discord message.
// GET = Meta's one-time webhook check (hub.verify_token must equal WHATSAPP_VERIFY_TOKEN).
// POST = messages; every call must carry Meta's X-Hub-Signature-256 (WHATSAPP_APP_SECRET).
import { NextRequest, NextResponse } from "next/server";
import { prisma, safeDbCall } from "@/lib/db";
import { verifyWa, waButtons, waReady, waText } from "@/lib/wa";
import { WA_HELP, catalog, menuText, orderSummary, parseOrder, priceOrder, type OrderLine } from "@/lib/waOrder";
import { upiPay, validVpa, type RateCards } from "@/lib/money";
import { sendToOwners } from "@/lib/bot/push";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const want = process.env.WHATSAPP_VERIFY_TOKEN;
  if (want && p.get("hub.mode") === "subscribe" && p.get("hub.verify_token") === want) return new NextResponse(p.get("hub.challenge") || "", { status: 200 });
  return NextResponse.json({ error: "Not verified." }, { status: 403 });
}

interface WaMsg { from: string; type: string; text?: { body: string }; interactive?: { button_reply?: { id: string } } }

const setting = async <T,>(key: string) => ((await prisma.appSetting.findUnique({ where: { key } }))?.data as T | null) ?? null;
const last10 = (p: string) => p.replace(/\D/g, "").slice(-10);

async function handle(m: WaMsg, profile: string | null) {
  const to = m.from;
  const [cards, shop] = await Promise.all([setting<RateCards>("rates"), setting<{ name?: string; upi?: string }>("shop")]);
  const shopName = shop?.name || "Mahadev Traders";
  // a known customer (party with this phone) gets their own price list
  const parties = await prisma.party.findMany({ where: { phone: { not: null }, active: true }, select: { name: true, phone: true } });
  const party = parties.find((p) => p.phone && last10(p.phone) === last10(to));
  const who = party?.name || profile || null;

  const btn = m.interactive?.button_reply?.id || "";
  if (btn) {
    const [act, id] = btn.split(":");
    const o = await prisma.customerOrder.findUnique({ where: { id } });
    if (!o || last10(o.phone || "") !== last10(to)) return waText(to, "That order was not found. Please send it again.");
    if (o.status !== "draft") return waText(to, `Order ${o.no} is already ${o.status}.`);
    if (act === "no") { await prisma.customerOrder.update({ where: { id }, data: { status: "cancelled" } }); return waText(to, `Order ${o.no} cancelled. 🙏`); }
    await prisma.customerOrder.update({ where: { id }, data: { status: "new" } });
    const lines = o.lines as unknown as OrderLine[];
    await sendToOwners({ text: [`**🛒 WhatsApp order ${o.no}** — ${o.name || ""} (+${to})`, orderSummary(lines, o.totalInr)].join("\n"), open: { path: "/orders", label: "Open orders" } }).catch(() => null);
    const pay = o.totalInr && validVpa(shop?.upi) ? `\n\nPay by UPI: ${upiPay(shop!.upi!, shopName, o.totalInr, o.no)}` : "";
    return waText(to, `✅ Order ${o.no} confirmed. We will message you when it is ready. 🙏${pay}`);
  }

  const text = (m.text?.body || "").trim();
  if (!text) return waText(to, WA_HELP(shopName, catalog(cards)));
  if (/^(hi|hello|hey|namaste|namaskar|start|help)\b/i.test(text)) return waText(to, WA_HELP(shopName, catalog(cards)));
  if (/^(menu|price|prices|rate|rates|list|bhav)\b/i.test(text)) return waText(to, menuText(cards, who));
  if (/^(status|order status|my order)\b/i.test(text)) {
    const o = await prisma.customerOrder.findFirst({ where: { phone: to, status: { not: "draft" } }, orderBy: { createdAt: "desc" } });
    return waText(to, o ? `Order ${o.no}: *${o.status}*` : "No order yet. Send e.g. *5 L groundnut*.");
  }
  const parsed = parseOrder(text, catalog(cards));
  if (!parsed.lines.length) return waText(to, `Sorry, I could not read an order in that.\n\n${WA_HELP(shopName, catalog(cards))}`);
  const priced = priceOrder(parsed.lines, cards, who);
  const n = await prisma.customerOrder.count();
  const o = await prisma.customerOrder.create({ data: { no: `SO-${n + 1}`, channel: "whatsapp", phone: to, name: who, lines: JSON.parse(JSON.stringify(priced.lines)), totalInr: priced.total, status: "draft" } });
  const extra = parsed.unknown.length ? `\n\n(Could not read: ${parsed.unknown.join(", ")})` : "";
  return waButtons(to, `*Your order ${o.no}*\n${orderSummary(priced.lines, priced.total)}${extra}`, [{ id: `ok:${o.id}`, title: "✅ Confirm" }, { id: `no:${o.id}`, title: "✕ Cancel" }]);
}

export async function POST(req: NextRequest) {
  const raw = await req.text();
  if (!waReady() || !verifyWa(raw, req.headers.get("x-hub-signature-256"))) return NextResponse.json({ error: "Bad signature." }, { status: 401 });
  const body = JSON.parse(raw || "{}");
  const value = body?.entry?.[0]?.changes?.[0]?.value;
  const msgs: WaMsg[] = value?.messages || [];
  const profile: string | null = value?.contacts?.[0]?.profile?.name || null;
  for (const m of msgs.slice(0, 5)) {
    await safeDbCall(() => handle(m, profile)).catch(() => null);
  }
  // Meta wants a quick 200, or it retries
  return NextResponse.json({ ok: true });
}
