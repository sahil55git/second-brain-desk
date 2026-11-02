// "What to do next" suggestions for the Smart tips widget and the app: the most useful few,
// from stock run-out, udhaar, barrels, cash count, job-work and tasks. Pure; tested in tips.test.ts.
import type { RunOut } from "@/lib/insights";

export interface Tip { icon: string; text: string; path: string; weight: number }

export function tips(i: {
  runout: RunOut[];
  udhaar: { name: string; balance: number; days: number }[];
  barrels: { toWeighFull: number; waitingLong: number; oldestDays: number } | null;
  cashCounted: boolean | null;
  hourIst: number;
  jobWorkOverdue: number;
  tasksDue: { text: string }[];
}): Tip[] {
  const out: Tip[] = [];
  for (const r of i.runout) {
    if (r.level === "out") out.push({ icon: "⛔", text: `${r.name} is out${r.lastBuy?.party ? ` — order from ${r.lastBuy.party}` : ""}`, path: "/insights#stock", weight: 100 });
    else if (r.level === "low" && r.daysLeft != null) out.push({ icon: "📦", text: `${r.name}: ${r.daysLeft} day${r.daysLeft === 1 ? "" : "s"} left${r.lastBuy?.party ? ` · last from ${r.lastBuy.party}${r.lastBuy.rate ? ` ₹${r.lastBuy.rate}` : ""}` : ""}`, path: "/insights#stock", weight: 80 - r.daysLeft });
  }
  for (const t of i.tasksDue.slice(0, 2)) out.push({ icon: "📌", text: t.text, path: "/chat", weight: 90 });
  if (i.cashCounted === false && i.hourIst >= 19) out.push({ icon: "💵", text: "Count the cash before closing", path: "/register?open=cash", weight: 85 });
  if (i.barrels && i.barrels.waitingLong > 0) out.push({ icon: "🛢️", text: `${i.barrels.waitingLong} full barrel(s) waiting ${i.barrels.oldestDays}+ days — empty them`, path: "/barrels?weigh=empty", weight: 70 });
  if (i.barrels && i.barrels.toWeighFull > 0) out.push({ icon: "⚖️", text: `${i.barrels.toWeighFull} barrel(s) to weigh full`, path: "/barrels?weigh=full", weight: 50 });
  if (i.jobWorkOverdue > 0) out.push({ icon: "🌾", text: `${i.jobWorkOverdue} job-work lot(s) overdue — settle`, path: "/register?open=jwsettle", weight: 65 });
  const old = i.udhaar.filter((u) => u.days >= 30).sort((a, b) => b.balance * b.days - a.balance * a.days);
  for (const u of old.slice(0, 2)) out.push({ icon: "🙌", text: `Remind ${u.name}: ₹${Math.round(u.balance).toLocaleString("en-IN")} for ${u.days} days`, path: "/insights#udhaar", weight: 60 + Math.min(20, u.days / 10) });
  return out.sort((a, b) => b.weight - a.weight).slice(0, 5);
}
