// 🔄 Tally Prime XML of vouchers (owner). GET ?from=&to= → file to import in Tally (Import → Data).
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getUser, isValidDate } from "@/lib/registerServer";
import { loadHubData } from "@/lib/hubData";
import { DEFAULT_LEDGERS, tallyVouchers, tallyXml, unbalanced, type TallyLedgers } from "@/lib/tally";
import type { BizData } from "@/lib/bizReports";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user?.isOwner) return NextResponse.json({ error: "Owner access required." }, { status: 403 });
  const from = req.nextUrl.searchParams.get("from"), to = req.nextUrl.searchParams.get("to");
  if (!isValidDate(from) || !isValidDate(to)) return NextResponse.json({ error: "from and to dates needed." }, { status: 400 });
  const d = (await loadHubData(from!, to!)) as unknown as BizData;
  const s = await prisma.appSetting.findUnique({ where: { key: "backup" } }).catch(() => null);
  const L: TallyLedgers = { ...DEFAULT_LEDGERS, ...(((s?.data as { tally?: Partial<TallyLedgers> } | null)?.tally) || {}) };
  const v = tallyVouchers(d, { from: from!, to: to! }, L);
  if (req.nextUrl.searchParams.get("check")) return NextResponse.json({ data: { vouchers: v.length, unbalanced: unbalanced(v), byType: v.reduce<Record<string, number>>((a, x) => ({ ...a, [x.type]: (a[x.type] || 0) + 1 }), {}) } });
  return new NextResponse(tallyXml(v, L.company), { headers: { "Content-Type": "application/xml; charset=utf-8", "Content-Disposition": `attachment; filename="tally_${from}_${to}.xml"` } });
}
