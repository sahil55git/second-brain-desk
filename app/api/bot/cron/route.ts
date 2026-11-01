// 9 pm summary to the owner's linked chats, and each person's tasks in the morning (7 – 11 am). Called every evening by the GitHub Actions schedule
// (.github/workflows/bot-digest.yml). Whoever calls it, it sends at most once a day and only
// between 8 pm and midnight (India time), so an outside call can do no harm; with CRON_SECRET
// set (in Vercel and as a GitHub secret) only the schedule can call it at all.
import { NextRequest, NextResponse } from "next/server";
import { prisma, safeDbCall } from "@/lib/db";
import { businessDate } from "@/lib/register";
import { botKeys } from "@/lib/bot/config";
import { digestText, openTasks, reviewText, taskLines } from "@/lib/bot/engine";
import { sendToOwners, sendToUsers } from "@/lib/bot/push";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Only the scheduled job can call this." }, { status: 401 });
  }
  const hourIst = Number(new Date().toLocaleString("en-GB", { hour: "2-digit", hour12: false, timeZone: "Asia/Kolkata" }));
  // morning: each person's tasks due today (or overdue), once a day, 7 – 11 am
  if (hourIst >= 7 && hourIst < 11) {
    const m = await safeDbCall(async () => {
      const today = businessDate(Date.now());
      const cur = await prisma.appSetting.findUnique({ where: { key: "cron" } });
      const last = (cur?.data as { morning?: string } | null)?.morning;
      if (last === today) return { skipped: "already sent this morning" };
      await prisma.appSetting.upsert({ where: { key: "cron" }, create: { key: "cron", data: { morning: today } }, update: { data: { ...((cur?.data as object) || {}), morning: today } } });
      const users = await prisma.botLink.findMany({ where: { revokedAt: null }, select: { username: true }, distinct: ["username"] });
      let sent = 0;
      for (const u of users) {
        const due = (await openTasks(u.username)).filter((t) => t.due && t.due <= today);
        if (!due.length) continue;
        const r = await sendToUsers([u.username], { text: [`☀️ **Good morning — today's tasks**`, ...taskLines(due, today)].join("\n"), buttons: due.slice(0, 4).map((t, i) => ({ label: `✓ ${i + 1}`, data: `task:${t.id}` })) });
        sent += r.sent;
      }
      // Sunday: the weekly review to the owner
      let weekly = false;
      if (new Date(`${today}T00:00:00Z`).getUTCDay() === 0) {
        const r = await sendToOwners({ text: await reviewText(Date.now()), buttons: [{ label: "👀 Watch", data: "cmd:watch" }, { label: "🙌 Udhaar", data: "cmd:udhaar" }] });
        weekly = r.sent > 0;
      }
      return { morning: true, sent, weekly };
    });
    return NextResponse.json(m.ok ? { data: m.data } : { error: m.error }, { status: m.ok ? 200 : 503 });
  }
  if (hourIst < 20) return NextResponse.json({ data: { skipped: "the summary goes out after 8 pm" } });
  const r = await safeDbCall(async () => {
    const k = await botKeys();
    if (!k.digestOn) return { skipped: "summary is off" };
    const today = businessDate(Date.now());
    // claim today's send first, so two calls never send it twice
    await prisma.botConfig.upsert({ where: { id: "singleton" }, create: { id: "singleton" }, update: {} });
    const claim = await prisma.botConfig.updateMany({ where: { id: "singleton", OR: [{ lastDigestDay: null }, { lastDigestDay: { not: today } }] }, data: { lastDigestDay: today } });
    if (!claim.count) return { skipped: "already sent today" };
    // the owner's own tasks for tomorrow go at the end of the summary
    const owners = await prisma.user.findMany({ where: { role: "OWNER", active: true }, select: { username: true } });
    const tomorrow = new Date(Date.parse(`${today}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);
    const tasks = (await Promise.all(owners.map((o) => openTasks(o.username)))).flat().filter((t) => t.due && t.due <= tomorrow);
    const text = (await digestText()) + (tasks.length ? `\n\n**📌 Tasks for tomorrow**\n${taskLines(tasks, today).join("\n")}` : "");
    return sendToOwners({ text, buttons: [{ label: "📄 Today PDF", data: "cmd:report today pdf" }, { label: "🙌 Udhaar", data: "cmd:udhaar" }, { label: "📋 Tasks", data: "cmd:tasks" }] });
  });
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 503 });
  return NextResponse.json({ data: r.data });
}
