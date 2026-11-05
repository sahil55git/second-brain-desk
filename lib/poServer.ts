// Purchase orders on the server: the reminder lines for the chat's "needs attention" list.
// Loads purchases from the oldest open order so part-received orders are not shown as untouched.
import { prisma } from "@/lib/db";
import { loadHubData } from "@/lib/hubData";
import type { BizData } from "@/lib/bizReports";
import { poProgress, type PoLine, type PurchaseOrderLite } from "@/lib/ops";
import { poAlerts } from "@/lib/po";

export async function poAlertLines(today: string): Promise<string[]> {
  const rows = await prisma.purchaseOrder.findMany({ where: { status: { in: ["draft", "open"] } }, orderBy: { date: "asc" }, take: 100 });
  if (!rows.length) return [];
  const orders: PurchaseOrderLite[] = rows.map((o) => ({ id: o.id, no: o.no, date: o.date, supplier: o.supplier, dueDate: o.dueDate, status: o.status, lines: o.lines as unknown as PoLine[] }));
  const biz = (await loadHubData(orders[0].date, today)) as unknown as BizData;
  return poAlerts(poProgress(orders, biz, today), today, 1);
}
