// 🧑‍💼 The AI CFO report: month pack (P&L vs last month / last year, budgets, cash forecast, watch
// list, cost per kg) → AI → plain-English report. Used by /api/cfo and the 1st-of-month cron.
import { prisma } from "@/lib/db";
import { runAi } from "@/lib/aiProvider";
import { CFO_SYSTEM, cfoPack } from "@/lib/askContext";
import { loadYear } from "@/lib/aiServer";
import { budgetRows, cashForecast, type Budgets } from "@/lib/money";
import { anomalies } from "@/lib/ops";
import { varianceSummary } from "@/lib/stockOps";

export async function cfoReport(nowMs = Date.now()): Promise<{ text: string | null; pack: string; error?: string }> {
  const { d, today } = await loadYear(nowMs);
  const setting = async <T,>(key: string) => ((await prisma.appSetting.findUnique({ where: { key } }).catch(() => null))?.data as T | null) ?? null;
  const [budgets, plan] = await Promise.all([setting<Budgets>("budgets"), setting<{ openingInr?: number; collectPct?: number; fixed?: { name: string; amountInr: number; day: number }[] }>("cashplan")]);
  const b = budgetRows(budgets, d, today);
  const f = cashForecast(d, { openingInr: plan?.openingInr || 0, today, collectPct: plan?.collectPct ?? 40, fixed: plan?.fixed || [] });
  const w = anomalies(d, today, { budgets, days: 30 });
  const v = varianceSummary(d, { from: `${today.slice(0, 8)}01`, to: today });
  const extra = [
    `BUDGETS: ${b.map((x) => `${x.name} ${Math.round(x.spent)}/${x.limit} (${x.level})`).join("; ") || "none set"}`,
    `CASH 30-DAY FORECAST: ${plan ? `ends ₹${Math.round(f.end)}, lowest ₹${Math.round(f.low.inr)} on ${f.low.date}${f.firstNegative ? `, negative from ${f.firstNegative}` : ""}` : "opening cash not set"}; udhaar pending ₹${Math.round(f.udhaarPending)}`,
    `UNUSUAL THIS MONTH: ${w.slice(0, 10).map((x) => x.text).join("; ") || "none"}`,
    `STOCK GAPS THIS MONTH: ${v.rows.slice(0, 6).map((r) => `${r.product} net ${r.netGap} kg`).join("; ") || "no counts"}`,
  ];
  const pack = cfoPack(d, today, extra);
  const r = await runAi(CFO_SYSTEM, pack);
  return { text: r.ok && r.text ? r.text : null, pack, error: r.ok ? undefined : r.error };
}
