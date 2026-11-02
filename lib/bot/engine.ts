// The chat bot's brain: one place that answers a command, whichever chat it came from
// (in-app chat box, Telegram, Discord). Server only. The words are parsed by lib/bot/parse.ts;
// replies are plain text with **bold** (lib/bot/format.ts turns that into each app's format).
//
// Rules:
//  - a chat account acts with the rights of the login it is linked to (owner / staff profile);
//  - money figures, udhaar, reports and files are for the owner only;
//  - an entry is never saved straight away: the bot shows it with ✅ Save / ❌ Cancel, and after
//    saving offers ↩️ Undo for 30 minutes;
//  - entries that the shop's rule says need a signature / photo proof must be made in the app;
//  - every message is logged (BotLog) with who sent it and from where.
import { createHash, randomBytes, randomInt } from "crypto";
import { prisma } from "@/lib/db";
import { loadHubData } from "@/lib/hubData";
import { homeSummary, rangeSummary } from "@/lib/homeSummary";
import {
  attentionList, cashReport, expenseReport, jobWorkReport, salesReport, udhaarReport, type BizData,
} from "@/lib/bizReports";
import { barrelCounts, widgetAlerts, type BarrelCounts } from "@/lib/deviceToken";
import { businessDate, KIND_SIDE, learnItem, type RegisterKind } from "@/lib/register";
import { loadConfig, saveConfig } from "@/lib/registerServer";
import { canFn, kindToFn, type Perms } from "@/lib/access";
import { accessFor } from "@/lib/accessServer";
import { proofNeeded } from "@/lib/proofs";
import { matchParty, normName, similarity, MATCH_MIN } from "@/lib/smartEntry";
import { excelBlob, pdfBlob } from "@/lib/exporters";
import { runAi } from "@/lib/aiProvider";
import { HELP_TEXT, parseCommand, type Cmd, type EntryCmd } from "@/lib/bot/parse";
import { parseVoice } from "@/lib/voice";
import { dmy, kg, pct, rs, type BotButton, type BotReply } from "@/lib/bot/format";
import { KIND_NAME, describeEntry } from "@/lib/bot/entryText";
import { WHAT_NAME, reportFileName, reportTables, spanFor, spanName } from "@/lib/bot/reports";

export type BotChannel = "app" | "telegram" | "discord";
export interface BotWho {
  username: string;
  name: string;
  isOwner: boolean;
  perms: Perms;
}
export interface BotCtx {
  channel: BotChannel;
  /** the chat app's user id (not for the app) */
  externalId?: string;
  chatId?: string;
  label?: string;
}

const CHANNEL_NAME: Record<BotChannel, string> = { app: "app chat", telegram: "Telegram", discord: "Discord" };
const PENDING_MIN = 15;
const UNDO_MIN = 30;
const shift = (d: string, days: number) => new Date(new Date(`${d}T00:00:00Z`).getTime() + days * 86400000).toISOString().slice(0, 10);
const OWNER_ONLY = "That is for the owner's login only.";

// ------------------------------------------------------------------ who is asking
export async function whoFor(username: string): Promise<BotWho | null> {
  const a = await accessFor(username);
  if (!a || !a.active) return null;
  return { username: a.username, name: a.name, isOwner: a.isOwner, perms: a.perms };
}

/** The login a chat account is linked to (null: not linked, switched off, or the login is off). */
export async function linkedWho(channel: BotChannel, externalId: string) {
  const link = await prisma.botLink.findUnique({ where: { channel_externalId: { channel, externalId } } });
  if (!link || link.revokedAt) return { link: null, who: null };
  const who = await whoFor(link.username);
  if (who && (!link.lastUsedAt || Date.now() - link.lastUsedAt.getTime() > 10 * 60_000)) {
    await prisma.botLink.update({ where: { id: link.id }, data: { lastUsedAt: new Date() } }).catch(() => {});
  }
  return { link, who };
}

// ------------------------------------------------------------------ linking
const hashCode = (c: string) => createHash("sha256").update(`mahadev-bot:${c}`).digest("hex");

/** A 6-digit code, valid 10 minutes, that links one chat account to this login. */
export async function makeLinkCode(username: string): Promise<{ code: string; expiresAt: Date }> {
  await prisma.botCode.deleteMany({ where: { OR: [{ username }, { expiresAt: { lt: new Date() } }] } });
  const code = String(randomInt(100000, 1000000));
  const expiresAt = new Date(Date.now() + 10 * 60_000);
  await prisma.botCode.create({ data: { codeHash: hashCode(code), username, expiresAt } });
  return { code, expiresAt };
}

export async function linkWithCode(code: string, ctx: BotCtx): Promise<BotReply> {
  if (ctx.channel === "app" || !ctx.externalId) return { text: "You are already signed in here." };
  // at most 5 wrong codes an hour from one chat account
  const fails = await prisma.botLog.count({ where: { channel: ctx.channel, externalId: ctx.externalId, ok: false, text: { startsWith: "link" }, at: { gt: new Date(Date.now() - 3600_000) } } });
  if (fails >= 5) return { text: "Too many wrong codes. Wait an hour and make a new code in the app." };
  const row = await prisma.botCode.findUnique({ where: { codeHash: hashCode(code) } });
  if (!row || row.usedAt || row.expiresAt < new Date()) throw new BotRefusal("That code is wrong or too old. In the app open 💬 Chat → Connect and make a new one.");
  const who = await whoFor(row.username);
  if (!who) throw new BotRefusal("That login is switched off.");
  await prisma.botCode.update({ where: { id: row.id }, data: { usedAt: new Date() } });
  await prisma.botLink.upsert({
    where: { channel_externalId: { channel: ctx.channel, externalId: ctx.externalId } },
    create: { channel: ctx.channel, externalId: ctx.externalId, chatId: ctx.chatId ?? null, label: ctx.label ?? null, username: who.username },
    update: { chatId: ctx.chatId ?? null, label: ctx.label ?? null, username: who.username, revokedAt: null },
  });
  return {
    text: `✅ Linked to **${who.name}** (${who.isOwner ? "owner" : "staff"}).\n\n${who.isOwner ? "You will also get the 9 pm summary here.\n\n" : ""}${helpFor(who)}`,
    buttons: who.isOwner ? [{ label: "📊 Today", data: "cmd:today" }, { label: "🙌 Udhaar", data: "cmd:udhaar" }, { label: "🔔 Alerts", data: "cmd:alerts" }] : [{ label: "🛢️ Barrels", data: "cmd:barrels" }],
  };
}

/** A friendly "no" that is logged as a failed command. */
export class BotRefusal extends Error {}

// ------------------------------------------------------------------ data
async function loadBiz(nowMs: number) {
  const today = businessDate(nowMs);
  const lastMonthStart = `${shift(`${today.slice(0, 7)}-01`, -1).slice(0, 7)}-01`;
  const from = lastMonthStart < shift(today, -8) ? lastMonthStart : shift(today, -8);
  const data = (await loadHubData(from, today)) as unknown as BizData;
  return { biz: data, today };
}

async function barrelsNow(nowMs: number): Promise<BarrelCounts> {
  const rows = await prisma.barrel.findMany({ where: { receipt: { status: "OPEN" } }, select: { grossKg: true, emptyKg: true, grossAt: true } });
  return barrelCounts(rows, nowMs);
}

const pg = (who: BotWho, k: string) => who.isOwner || !!(who.perms.pg as Record<string, boolean>)[k];

// ------------------------------------------------------------------ answers
function helpFor(who: BotWho): string {
  if (who.isOwner) return HELP_TEXT;
  const kinds: [RegisterKind, string][] = [["SALE", "sale 500 upi suresh"], ["UDHAAR_IN", "got 1000 ramesh"], ["EXPENSE", "expense 200 diesel"], ["PURCHASE", "purchase 5000 seed"], ["PAYMENT", "paid 3000 salary raju"]];
  const can = kinds.filter(([k]) => canFn(who.perms, kindToFn(k))).map(([, ex]) => ex);
  return ["**You can ask**", ["barrels", "alerts", pg(who, "stock") ? "stock" : ""].filter(Boolean).join(" · "), ...(can.length ? ["", "**Enter** (✅ Save / ❌ Cancel first)", ...can] : [])].join("\n");
}

async function summary(span: "today" | "yesterday" | "week" | "month", who: BotWho, nowMs: number): Promise<BotReply> {
  const b = await barrelsNow(nowMs);
  const barrelLine = `🛢️ Barrels: ${b.toWeighFull} to weigh full · ${b.waitingEmpty} waiting to empty${b.waitingLong ? ` (${b.waitingLong} for 7+ days)` : ""}`;
  if (!who.isOwner) return { text: `${barrelLine}\n\nMoney figures are for the owner.` };
  const { biz } = await loadBiz(nowMs);
  const s = spanFor(span, nowMs);
  const sa = salesReport(biz, s);
  const ex = expenseReport(biz, s);
  const c = cashReport(biz, s);
  const h = homeSummary(biz, nowMs);
  const rr = span === "yesterday" ? null : rangeSummary(biz, span, nowMs);
  const title = span === "today" ? "Today" : span === "yesterday" ? "Yesterday" : span === "week" ? "Last 7 days" : "This month";
  const items = sa.byItem.slice(0, 3).map((x) => `${x.key} ${rs(x.amount)}`).join(" · ");
  const L = [
    `**📊 ${title}** · ${spanName(s)}`,
    `Sales **${rs(sa.total)}** ${rr ? pct(rr.changePct) : ""}${rr ? ` · ${rr.bills} bills` : ""}`.trim(),
    `💵 Cash in ${rs(c.cashIn)} · out ${rs(c.cashOut)}`,
    `📱 UPI ${rs(c.upiIn)} · 🙌 Udhaar given ${rs(c.creditGiven)}`,
    `🧾 Spent ${rs(ex.total)}`,
  ];
  if (items) L.push(`Top: ${items}`);
  L.push("", `Udhaar to collect **${rs(h.udhaarOutstanding)}** (${h.udhaarCustomers} people)`, `🌾 Job-work waiting ${h.jobWork.waiting}${h.jobWork.overdue ? ` · ${h.jobWork.overdue} overdue` : ""}`, barrelLine);
  if (span === "today" && h.lastCount) L.push(h.lastCount.mismatch ? `⚠️ Cash count off by ${rs(Math.abs(h.lastCount.diff))}` : "✓ Cash count matches");
  return {
    text: L.join("\n"),
    buttons: [
      { label: "📄 PDF", data: `cmd:report ${span} pdf` },
      { label: "💵 Cash", data: "cmd:cash" },
      { label: "🙌 Udhaar", data: "cmd:udhaar" },
      { label: "🔔 Alerts", data: "cmd:alerts" },
    ],
  };
}

async function cash(who: BotWho, nowMs: number): Promise<BotReply> {
  if (!who.isOwner) throw new BotRefusal(OWNER_ONLY);
  const { biz, today } = await loadBiz(nowMs);
  const c = cashReport(biz, { from: today, to: today });
  const h = homeSummary(biz, nowMs);
  const L = [`**💵 Cash today** · ${dmy(today)}`, `In ${rs(c.cashIn)} · Out ${rs(c.cashOut)} · Net **${rs(c.cashIn - c.cashOut)}**`, `UPI in ${rs(c.upiIn)} · out ${rs(c.upiOut)}`];
  if (c.pigmee || c.ownerDraw) L.push(`Pigmee ${rs(c.pigmee)} · Owner took ${rs(c.ownerDraw)}`);
  const last = c.counts[0];
  if (last) L.push(`Last count (${last.session}): counted ${rs(last.counter)} vs system ${rs(last.system)}${Math.abs(last.diff) >= 1 ? ` · ${last.diff > 0 ? "short" : "extra"} ${rs(Math.abs(last.diff))}` : " · matches"}`);
  else L.push(h.lastCount ? "" : "Not counted yet today.");
  return { text: L.filter(Boolean).join("\n"), buttons: [{ label: "📄 Cash PDF", data: "cmd:cash today pdf" }] };
}

/** Udhaar rows whose name is like the one asked, best first. */
function findPeople<T extends { name: string }>(rows: T[], name: string): T[] {
  const n = normName(name);
  return rows
    .map((r) => ({ r, s: normName(r.name).includes(n) ? 0.95 : similarity(name, r.name) }))
    .filter((x) => x.s >= MATCH_MIN)
    .sort((a, b) => b.s - a.s)
    .map((x) => x.r);
}

async function udhaar(name: string | null, who: BotWho, nowMs: number): Promise<BotReply> {
  if (!who.isOwner) throw new BotRefusal(OWNER_ONLY);
  const { biz, today } = await loadBiz(nowMs);
  const u = udhaarReport(biz, today);
  const owing = u.rows.filter((r) => r.balance >= 1).sort((a, b) => b.balance - a.balance);
  if (!name) {
    return {
      text: [`**🙌 Udhaar to collect: ${rs(u.outstanding)}** (${owing.length} people)`, ...owing.slice(0, 12).map((r, i) => `${i + 1}. ${r.name} — ${rs(r.balance)} · last ${dmy(r.last)}`), owing.length > 12 ? `…and ${owing.length - 12} more (udhaar pdf for all)` : ""].filter(Boolean).join("\n"),
      buttons: [{ label: "📄 Udhaar PDF", data: "cmd:udhaar pdf" }, ...owing.slice(0, 2).map((r) => ({ label: `📤 Remind ${r.name.split(" ")[0]}`, data: `cmd:remind ${r.name}`.slice(0, 60) }))],
    };
  }
  const hits = findPeople(u.rows, name);
  if (!hits.length) return { text: `No udhaar found for "${name}".` };
  const p = hits[0];
  const moves = biz.register
    .filter((e) => (e.partyName || "").trim().toLowerCase() === p.name.toLowerCase() && ((e.kind === "UDHAAR_IN") || ((e.kind === "SALE" || e.kind === "FRESH_CRUSH") && e.paymentMode === "CREDIT")))
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .slice(0, 5)
    .map((e) => `${dmy(e.date)} · ${e.kind === "UDHAAR_IN" ? "paid" : "took"} ${rs(e.amountInr)}`);
  const L = [`**${p.name}**`, `Balance **${rs(p.balance)}** · given ${rs(p.given)} · received ${rs(p.received)}`, `Last activity ${dmy(p.last)}`];
  if (moves.length) L.push("", ...moves);
  if (hits.length > 1) L.push("", `Also: ${hits.slice(1, 4).map((h) => `${h.name} ${rs(h.balance)}`).join(" · ")}`);
  return { text: L.join("\n"), buttons: p.balance >= 1 ? [{ label: "📤 Reminder message", data: `cmd:remind ${p.name}`.slice(0, 60) }] : undefined };
}

async function remind(name: string, who: BotWho, nowMs: number): Promise<BotReply> {
  if (!who.isOwner) throw new BotRefusal(OWNER_ONLY);
  const { biz, today } = await loadBiz(nowMs);
  const p = findPeople(udhaarReport(biz, today).rows, name)[0];
  if (!p || p.balance < 1) return { text: `${p ? p.name : `"${name}"`} has nothing to pay.` };
  const msg = `Namaskara ${p.name} ji,\nYour balance at Mahadev Traders, Bidar is ${rs(p.balance)} (as on ${dmy(today)}).\nPlease pay when convenient — cash, UPI or at the shop.\nThank you 🙏`;
  return { text: `Forward this to ${p.name}:\n\n${msg}` };
}

async function stock(who: BotWho, nowMs: number): Promise<BotReply> {
  if (!pg(who, "stock")) throw new BotRefusal("Your login does not include stock.");
  const { biz } = await loadBiz(nowMs);
  const st = homeSummary(biz, nowMs).stock;
  if (!st.length) return { text: "No stock figures yet." };
  return {
    text: [`**📦 Oil stock**`, ...st.slice(0, 15).map((i) => `${i.low ? "⚠️ " : ""}${i.name} — ${Math.round(i.qty * 10) / 10} ${i.unit}`)].join("\n"),
    buttons: who.isOwner ? [{ label: "📄 Stock PDF", data: "cmd:stock pdf" }] : undefined,
  };
}

async function jobwork(who: BotWho, nowMs: number): Promise<BotReply> {
  if (!pg(who, "jobwork")) throw new BotRefusal("Your login does not include job-work.");
  const { biz, today } = await loadBiz(nowMs);
  const r = jobWorkReport(biz, { from: today, to: today }, nowMs);
  const out = [...r.outstanding].sort((a, b) => b.ageDays - a.ageDays);
  return {
    text: [`**🌾 Job-work waiting: ${out.length} lots · ${kg(out.reduce((a, x) => a + x.seedKg, 0))}**`, ...out.slice(0, 10).map((o) => `${o.ageDays >= 7 ? "⚠️ " : ""}${o.customer} — ${kg(o.seedKg)} · ${o.ageDays}d${who.isOwner && o.due ? ` · due ${rs(o.due)}` : ""}`)].join("\n"),
    buttons: who.isOwner ? [{ label: "📄 Job-work PDF", data: "cmd:jobwork pdf" }] : undefined,
  };
}

async function barrels(nowMs: number): Promise<BotReply> {
  const b = await barrelsNow(nowMs);
  return { text: [`**🛢️ Barrels**`, `${b.toWeighFull} to weigh full`, `${b.waitingEmpty} waiting to be emptied${b.waitingLong ? ` · ⚠️ ${b.waitingLong} for 7+ days (oldest ${b.oldestDays} days)` : ""}`, "", "Weigh in the app: /barrels?weigh=full"].join("\n") };
}

export async function alertsText(who: BotWho, nowMs: number): Promise<string[]> {
  const b = await barrelsNow(nowMs);
  const today = businessDate(nowMs);
  const out = widgetAlerts(b, null, 0, today).map((a) => `${a.title}: ${a.text}`);
  if (who.isOwner) {
    const { biz } = await loadBiz(nowMs);
    out.push(...attentionList(biz, today, nowMs).filter((a) => a.severity !== "info").slice(0, 10).map((a) => `${a.severity === "critical" ? "🔴" : "🟠"} ${a.area}: ${a.message}`));
  }
  return out;
}

async function alerts(who: BotWho, nowMs: number): Promise<BotReply> {
  const list = await alertsText(who, nowMs);
  return { text: list.length ? [`**🔔 Needs attention (${list.length})**`, ...list].join("\n") : "✓ All good — nothing needs attention." };
}

async function report(cmd: Extract<Cmd, { t: "report" }>, who: BotWho, nowMs: number): Promise<BotReply> {
  if (!who.isOwner) throw new BotRefusal(OWNER_ONLY);
  const { biz } = await loadBiz(nowMs);
  const s = spanFor(cmd.span, nowMs);
  const tables = reportTables(biz, cmd.what, s, nowMs);
  const title = `Mahadev Traders - ${WHAT_NAME[cmd.what]}`;
  if (cmd.format === "text") {
    const t = tables[0];
    const label = t.cols[0].key;
    const amt = t.cols.find((c) => c.money)?.key;
    return { text: [`**${WHAT_NAME[cmd.what]} · ${spanName(s)}**`, ...t.rows.slice(0, 12).map((r) => `${String(r[label] ?? "")}${amt ? ` — ${rs(Number(r[amt]) || 0)}` : ""}`)].join("\n"), buttons: [{ label: "📄 PDF", data: `cmd:${cmd.what === "day" ? "report" : cmd.what} ${cmd.span} pdf` }] };
  }
  const blob = cmd.format === "pdf" ? await pdfBlob(title, `${spanName(s)} - made ${new Date(nowMs).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}`, tables) : await excelBlob(tables);
  const ext = cmd.format === "pdf" ? "pdf" : "xlsx";
  return {
    text: `📄 ${WHAT_NAME[cmd.what]} · ${spanName(s)}`,
    file: {
      name: reportFileName(cmd.what, s, ext),
      mime: ext === "pdf" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      base64: Buffer.from(await blob.arrayBuffer()).toString("base64"),
    },
  };
}

// ------------------------------------------------------------------ entries
async function previewEntry(e: EntryCmd, who: BotWho, ctx: BotCtx, nowMs: number): Promise<BotReply> {
  if (!who.isOwner && !canFn(who.perms, kindToFn(e.kind))) throw new BotRefusal(`Your login cannot add ${KIND_NAME[e.kind].toLowerCase()} entries.`);
  const cfg = await loadConfig();
  if ((e.kind === "PAYMENT" || e.kind === "PURCHASE" || e.kind === "EXPENSE") && proofNeeded(cfg.proofRequired, e.kind, e.amount, cfg.proofMinInr)) {
    throw new BotRefusal(`This ${KIND_NAME[e.kind].toLowerCase()} needs a signature or photo proof (shop rule). Please enter it in the app.`);
  }
  const notes: string[] = [];
  const entry = { ...e };
  if (entry.party) {
    const parties = await prisma.party.findMany({ select: { id: true, name: true, active: true } });
    const m = matchParty(entry.party, null, parties);
    if (m && m.party.name.toLowerCase() !== entry.party.toLowerCase()) {
      notes.push(`Matched the saved name **${m.party.name}** (you typed ${entry.party}).`);
      entry.party = m.party.name;
    } else if (!m) notes.push(`🆕 ${entry.party} is a new name — it will be added to the party list.`);
  }
  const date = businessDate(nowMs);
  const id = randomBytes(8).toString("base64url");
  await prisma.botPending.create({ data: { id, username: who.username, channel: ctx.channel, payload: entry as unknown as object, expiresAt: new Date(nowMs + PENDING_MIN * 60_000) } });
  return {
    text: ["Save this?", "", describeEntry(entry, date), ...(notes.length ? ["", ...notes] : [])].join("\n"),
    buttons: [{ label: "✅ Save", data: `ok:${id}` }, { label: "❌ Cancel", data: `no:${id}` }],
  };
}

async function saveEntry(e: EntryCmd, who: BotWho, ctx: BotCtx, date: string): Promise<string> {
  let cfg = await loadConfig();
  let item = e.item;
  if (item === "other" && e.itemLabel) {
    const learned = learnItem(cfg, e.kind, e.itemLabel);
    if (learned.cfg !== cfg) {
      cfg = learned.cfg;
      await saveConfig(cfg);
    }
    item = learned.key;
  }
  const side = KIND_SIDE[e.kind];
  let partyId: string | null = null;
  if (e.party) {
    const existing = await prisma.party.findFirst({ where: { name: { equals: e.party, mode: "insensitive" } }, select: { id: true } });
    partyId = existing?.id ?? (await prisma.party.create({ data: { name: e.party, type: side === "in" ? "CUSTOMER" : side === "out" ? "SUPPLIER" : "BOTH", notes: `Added from the ${CHANNEL_NAME[ctx.channel]}` }, select: { id: true } })).id;
  }
  const row = await prisma.registerEntry.create({
    data: {
      date,
      kind: e.kind,
      item,
      itemLabel: e.itemLabel,
      qty: e.qty && e.qty > 0 ? e.qty : null,
      unit: e.qty && e.qty > 0 ? e.unit || "kg" : null,
      rateInr: e.rate && e.rate > 0 ? e.rate : null,
      amountInr: e.amount,
      paymentMode: e.mode,
      totalSale: false,
      partyName: e.party,
      partyId,
      notes: [e.note, `via ${CHANNEL_NAME[ctx.channel]}`].filter(Boolean).join(" · "),
      createdByName: who.name || who.username,
    },
    select: { id: true },
  });
  return row.id;
}

/** ✅ Save / ❌ Cancel / ↩️ Undo / a command button. */
export async function runButton(data: string, who: BotWho, ctx: BotCtx, nowMs = Date.now()): Promise<BotReply> {
  const [act, ...rest] = data.split(":");
  const id = rest.join(":");
  if (act === "cmd") return runCommand(id, who, ctx, nowMs);
  const p = await prisma.botPending.findUnique({ where: { id } });
  if (!p || p.username !== who.username) return { text: "That entry is not here any more." };
  const e = p.payload as unknown as EntryCmd;
  if (act === "no") {
    const n = await prisma.botPending.updateMany({ where: { id, doneAt: null }, data: { doneAt: new Date(nowMs), result: "cancelled" } });
    return { text: n.count ? "❌ Cancelled. Nothing was saved." : "Already done." };
  }
  if (act === "ok") {
    if (p.expiresAt.getTime() < nowMs) return { text: `That was more than ${PENDING_MIN} minutes ago. Send it again.` };
    // re-check the login's rights at the moment of saving
    if (!who.isOwner && !canFn(who.perms, kindToFn(e.kind))) throw new BotRefusal("Your login cannot add this entry any more.");
    const n = await prisma.botPending.updateMany({ where: { id, doneAt: null }, data: { doneAt: new Date(nowMs), result: "saving" } });
    if (!n.count) return { text: p.result === "cancelled" ? "That was cancelled." : "Already saved ✓" };
    const date = businessDate(p.createdAt);
    try {
      const entryId = await saveEntry(e, who, ctx, date);
      await prisma.botPending.update({ where: { id }, data: { result: `entry:${entryId}` } });
    } catch (err) {
      await prisma.botPending.update({ where: { id }, data: { doneAt: null, result: null } });
      throw err;
    }
    return { text: `✅ Saved\n\n${describeEntry(e, date)}`, buttons: [{ label: "↩️ Undo", data: `undo:${id}` }] };
  }
  if (act === "undo") {
    const entryId = p.result?.startsWith("entry:") ? p.result.slice(6) : null;
    if (!entryId || !p.doneAt) return { text: "Nothing to undo." };
    if (nowMs - p.doneAt.getTime() > UNDO_MIN * 60_000) return { text: `Undo works for ${UNDO_MIN} minutes. Delete it in the app's register.` };
    await prisma.registerEntry.deleteMany({ where: { id: entryId } });
    await prisma.botPending.update({ where: { id }, data: { result: "undone" } });
    return { text: `↩️ Removed: ${KIND_NAME[e.kind]} ${rs(e.amount)}${e.party ? ` · ${e.party}` : ""}` };
  }
  return { text: "?" };
}

// ------------------------------------------------------------------ anything else: ask the AI (owner)
async function askAi(text: string, who: BotWho, nowMs: number): Promise<BotReply | null> {
  if (!who.isOwner) return null;
  const { biz, today } = await loadBiz(nowMs);
  const h = homeSummary(biz, nowMs);
  const week = rangeSummary(biz, "week", nowMs);
  const month = rangeSummary(biz, "month", nowMs);
  const u = udhaarReport(biz, today).rows.filter((r) => r.balance >= 1).sort((a, b) => b.balance - a.balance).slice(0, 25);
  const ctxText = [
    `Today ${today}. Sales today ${h.soldToday}, cash in ${h.cashInToday}, cash out ${h.cashOutToday}, UPI ${h.upiInToday}, spent ${h.spentToday}.`,
    `Last 7 days sales ${week.sold} (${week.bills} bills). This month sales ${month.sold}, spent ${month.spent}.`,
    `Daily sales last 7 days: ${h.week.map((w) => `${w.date} ${w.total}`).join(", ")}.`,
    `Udhaar outstanding ${h.udhaarOutstanding}: ${u.map((r) => `${r.name} ${r.balance} (last ${r.last})`).join("; ")}.`,
    `Stock: ${h.stock.map((s) => `${s.name} ${s.qty} ${s.unit}${s.low ? " LOW" : ""}`).join("; ")}.`,
    `Job-work waiting ${h.jobWork.waiting} lots (${h.jobWork.waitingKg} kg), overdue ${h.jobWork.overdue}: ${h.jobWork.list.slice(0, 10).map((j) => `${j.customer} ${j.seedKg}kg ${j.ageDays}d`).join("; ")}.`,
  ].join("\n");
  const r = await runAi(
    "You answer the shop owner's question in a chat, in 2-6 short lines, using ONLY the figures given. Rupees as ₹ with Indian commas. If the figures do not answer it, say so and suggest one of these commands: today, week, month, cash, udhaar <name>, stock, jobwork, alerts, report today pdf.",
    `Shop figures (Mahadev Traders, edible oil, Bidar):\n${ctxText}\n\nQuestion: ${text}`,
  );
  if (!r.ok) return null;
  const answer = (r as { text?: string }).text ?? "";
  return answer ? { text: `${answer.trim()}\n\n(AI answer from the shop figures — check before acting)` } : null;
}

// ------------------------------------------------------------------ open a form filled with what was said
function fillForm(kind: RegisterKind, text: string, who: BotWho, why?: string): BotReply {
  if (!who.isOwner && !canFn(who.perms, kindToFn(kind))) throw new BotRefusal(`Your login cannot add ${KIND_NAME[kind].toLowerCase()} entries.`);
  const path = `/register?say=${encodeURIComponent(text.slice(0, 200))}`;
  return {
    text: [`📝 Opening the **${KIND_NAME[kind]}** form with what you said.`, why ? `Still needed: ${why.replace(/^How much\?.*$/, "the amount").replace(/^Who.*$/, "the name")}` : "Check it and tap Save."].join("\n"),
    open: { path, label: `${KIND_NAME[kind]} form` },
  };
}

// ------------------------------------------------------------------ the one entry point
export async function runCommand(text: string, who: BotWho, ctx: BotCtx, nowMs = Date.now()): Promise<BotReply> {
  const cmd = parseCommand(text);
  switch (cmd.t) {
    case "start":
    case "help":
      return { text: helpFor(who) };
    case "whoami":
      return { text: `Linked to **${who.name}** (${who.isOwner ? "owner" : "staff"}) via ${CHANNEL_NAME[ctx.channel]}.` };
    case "link":
      return linkWithCode(cmd.code, ctx);
    case "unlink":
      if (ctx.channel === "app" || !ctx.externalId) return { text: "Sign out from the app menu instead." };
      await prisma.botLink.updateMany({ where: { channel: ctx.channel, externalId: ctx.externalId }, data: { revokedAt: new Date() } });
      return { text: "Unlinked. This chat can no longer see or enter anything." };
    case "summary":
      return summary(cmd.span, who, nowMs);
    case "cash":
      return cash(who, nowMs);
    case "udhaar":
      return udhaar(cmd.name, who, nowMs);
    case "remind":
      return remind(cmd.name, who, nowMs);
    case "stock":
      return stock(who, nowMs);
    case "barrels":
      return barrels(nowMs);
    case "jobwork":
      return jobwork(who, nowMs);
    case "alerts":
      return alerts(who, nowMs);
    case "report":
      return report(cmd, who, nowMs);
    case "entry":
      return previewEntry(cmd, who, ctx, nowMs);
    case "open":
      return { text: `↗ Opening **${cmd.label}**`, open: { path: cmd.path, label: cmd.label } };
    case "fill":
      return fillForm(cmd.kind, cmd.text, who, cmd.why);
    case "bad":
      throw new BotRefusal(cmd.why);
    default: {
      // said like a sentence ("purchased sunflower oil 180 kg from digwal"): the register's voice
      // parser understands more ways of saying it — open that form filled in
      const v = parseVoice(cmd.text);
      if (v.type === "entry") return fillForm(v.kind, cmd.text, who);
      const ai = await askAi(cmd.text, who, nowMs).catch(() => null);
      if (ai) return ai;
      throw new BotRefusal(`I did not get "${cmd.text.slice(0, 60)}". Send **help** for the list.`);
    }
  }
}

/** Run a message or a button and log it; refusals come back as a normal reply. */
export async function handle(input: { text?: string; button?: string }, who: BotWho, ctx: BotCtx): Promise<BotReply> {
  const said = input.button ? `[button] ${input.button}` : (input.text || "").replace(/^(\/?link\s+)\d+/i, "$1******");
  let reply: BotReply;
  let ok = true;
  try {
    reply = input.button ? await runButton(input.button, who, ctx) : await runCommand(input.text || "", who, ctx);
  } catch (e) {
    ok = false;
    reply = { text: e instanceof BotRefusal ? e.message : "Something went wrong. Try again in a minute." };
    if (!(e instanceof BotRefusal)) console.error("bot", e);
  }
  await logBot(ctx, who.username, said, reply.text, ok);
  if (reply.open && ctx.channel !== "app") {
    const base = (process.env.NEXTAUTH_URL || "https://mahadev-second-brain.vercel.app").replace(/\/+$/, "");
    reply = { ...reply, text: `${reply.text}\n\n🔗 ${base}${reply.open.path}` };
  }
  return reply;
}

export async function logBot(ctx: BotCtx, username: string | null, text: string, reply: string, ok: boolean) {
  await prisma.botLog
    .create({ data: { channel: ctx.channel, username, externalId: ctx.externalId ?? null, text: text.slice(0, 500), reply: reply.slice(0, 500), ok } })
    .catch(() => {});
}

/** For a chat account that is not linked: only /start, help and link work. */
export async function handleUnlinked(text: string, ctx: BotCtx, botName = "the bot"): Promise<BotReply> {
  const cmd = parseCommand(text);
  let reply: BotReply;
  let ok = true;
  if (cmd.t === "link") {
    try {
      reply = await linkWithCode(cmd.code, ctx);
    } catch (e) {
      ok = false;
      reply = { text: e instanceof BotRefusal ? e.message : "Could not link. Try again." };
    }
  } else {
    reply = {
      text: [
        `🙏 Namaskara! This is **Mahadev Desk** — ${botName}.`,
        "",
        "This chat is not linked to a login yet. To link it:",
        "1. Open the Mahadev Desk app or website",
        "2. 💬 Chat → Connect → **Make a link code**",
        "3. Send here: **link 123456** (your 6-digit code)",
      ].join("\n"),
    };
  }
  await logBot(ctx, null, cmd.t === "link" ? `link ******` : text, reply.text, ok);
  return reply;
}

// ------------------------------------------------------------------ nightly summary
export async function digestText(nowMs = Date.now()): Promise<string> {
  const owner: BotWho = { username: "", name: "", isOwner: true, perms: { pg: {}, fn: {}, win: {}, hide: {} } as unknown as Perms };
  const s = await summary("today", owner, nowMs);
  const al = await alertsText(owner, nowMs);
  return [`🌙 **Good evening — today at Mahadev Traders**`, "", s.text, ...(al.length ? ["", `**🔔 Needs attention**`, ...al.slice(0, 6)] : ["", "✓ Nothing needs attention."])].join("\n");
}

export const isBotButton = (b: BotButton) => /^(ok|no|undo|cmd):/.test(b.data);
