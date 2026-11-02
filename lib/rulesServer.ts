// ⚡ Run the owner's rules: load rules (OpsRecord kind "rule"), evaluate, send what is new to the
// owner's chats, make tasks, and remember what was sent (kind "rule_fired") so nothing repeats.
import { prisma } from "@/lib/db";
import { evaluateRules, freshOnly, type Fired, type Rule } from "@/lib/rules";
import { loadYear } from "@/lib/aiServer";
import { loadMandi } from "@/lib/mandiServer";
import { COMMODITIES, mandiSignals } from "@/lib/mandi";
import { sendToOwners } from "@/lib/bot/push";

export async function loadRules(): Promise<Rule[]> {
  const rows = await prisma.opsRecord.findMany({ where: { kind: "rule" } });
  return rows.map((r) => ({ id: r.id, ...(r.data as unknown as Omit<Rule, "id">), on: r.status !== "off" }));
}
export async function runRules(o: { send: boolean; nowMs?: number }): Promise<{ fired: Fired[]; sent: number }> {
  const rules = await loadRules();
  if (!rules.length) return { fired: [], sent: 0 };
  const now = o.nowMs ?? Date.now();
  const [{ d, today }, mandi] = await Promise.all([loadYear(now), loadMandi().catch(() => ({ rows: [] }))]);
  const hourIst = Number(new Date(now).toLocaleString("en-GB", { hour: "2-digit", hour12: false, timeZone: "Asia/Kolkata" }));
  const fired = evaluateRules(rules, d, today, { mandi: mandiSignals(mandi.rows, COMMODITIES), nowMs: now, hourIst });
  if (!o.send) return { fired, sent: 0 };
  const sentRows = await prisma.opsRecord.findMany({ where: { kind: "rule_fired", date: { gte: new Date(now - 30 * 86400000).toISOString().slice(0, 10) } }, select: { ref: true } });
  const fresh = freshOnly(fired, sentRows.map((r) => r.ref || ""));
  if (!fresh.length) return { fired, sent: 0 };
  const byRule = new Map(rules.map((r) => [r.id, r]));
  const alerts = fresh.filter((f) => byRule.get(f.ruleId)?.then.alert);
  if (alerts.length) await sendToOwners({ text: [`**⚡ Rules (${alerts.length})**`, ...alerts.slice(0, 15).map((f) => `• ${f.name}: ${f.text}`)].join("\n"), open: { path: "/rules", label: "Open rules" } }).catch(() => null);
  const owners = await prisma.user.findMany({ where: { role: "OWNER", active: true }, select: { username: true } });
  for (const f of fresh.filter((x) => byRule.get(x.ruleId)?.then.task)) {
    for (const u of owners.slice(0, 1)) await prisma.task.create({ data: { text: `${f.name}: ${f.text}`.slice(0, 300), due: today, username: u.username, createdVia: "rule" } }).catch(() => null);
  }
  await prisma.opsRecord.createMany({ data: fresh.map((f) => ({ kind: "rule_fired", date: today, ref: f.key, data: { text: f.text, ruleId: f.ruleId } })) });
  return { fired, sent: fresh.length };
}
