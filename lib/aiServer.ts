// Shared server helpers for the AI features (Ask, CFO, rules, backups).
import { loadHubData } from "@/lib/hubData";
import { businessDate } from "@/lib/register";
import type { BizData } from "@/lib/bizReports";

const shift = (d: string, n: number) => new Date(new Date(`${d}T00:00:00Z`).getTime() + n * 86400000).toISOString().slice(0, 10);
/** About 13 months of rows (expenses from then; the rest up to today). */
export async function loadYear(nowMs = Date.now()): Promise<{ d: BizData; today: string }> {
  const today = businessDate(nowMs);
  const d = (await loadHubData(shift(today, -400), today)) as unknown as BizData;
  return { d, today };
}
