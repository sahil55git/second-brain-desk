// Server-only helpers for the Quick Register API routes.
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/db";
import { KHALI_SPLIT } from "@/lib/calculations";
import {
  jobWorkCashEvents,
  normalizeConfig,
  openingFor,
  systemCash,
  entryCashEffect,
  type CashEvent,
  type RegisterConfigData,
  type RegisterEntryLike,
} from "@/lib/register";

export const BUSINESS_TZ_OFFSET = "+05:30"; // IST — the shop's business day

export function isValidDate(d: unknown): d is string {
  return typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(`${d}T00:00:00Z`));
}

/** UTC [start, end) instants of an IST business date. */
export function dayRange(date: string): { start: Date; end: Date } {
  const start = new Date(`${date}T00:00:00${BUSINESS_TZ_OFFSET}`);
  return { start, end: new Date(start.getTime() + 24 * 60 * 60 * 1000) };
}

export async function getUser(req: NextRequest) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token) return null;
  return {
    name: (token.name as string) || (token.username as string) || "",
    role: (token.role as string) || "STAFF",
    isOwner: token.role === "OWNER",
  };
}

export async function loadConfig(): Promise<RegisterConfigData> {
  const row = await prisma.registerConfig.findUnique({ where: { id: "singleton" } });
  return normalizeConfig(row?.data);
}

export async function saveConfig(cfg: RegisterConfigData) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = cfg as any;
  await prisma.registerConfig.upsert({
    where: { id: "singleton" },
    create: { id: "singleton", data },
    update: { data },
  });
}

/** Register entries + job-work cash events for one business date. */
export async function movementsFor(date: string) {
  const { start, end } = dayRange(date);
  const [entries, intakes] = await Promise.all([
    prisma.registerEntry.findMany({ where: { date }, orderBy: { createdAt: "asc" } }),
    prisma.jobWorkIntake.findMany({
      where: { OR: [{ createdAt: { gte: start, lt: end } }, { settledAt: { gte: start, lt: end } }] },
    }),
  ]);
  const s = start.getTime();
  const e = end.getTime();
  const jwEvents: CashEvent[] = intakes
    .flatMap((j) =>
      jobWorkCashEvents({
        cakeOwnership: j.cakeOwnership,
        advanceCustomerInr: j.advanceCustomerInr,
        advanceAutoInr: j.advanceAutoInr,
        settled: j.settled,
        settlementAmountInr: j.settlementAmountInr,
        settledAt: j.settledAt,
        createdAt: j.createdAt,
      })
    )
    .filter((ev) => ev.at >= s && ev.at < e);
  return { entries, jwEvents };
}

export async function computeOpening(date: string, cfg: RegisterConfigData) {
  const closings = await prisma.dailyClosing.findMany({
    // Stock-only rows (no cash counted) never set the opening cash.
    where: { session: "NIGHT", date: { lt: date }, OR: [{ source: null }, { source: { not: "register-stock" } }] },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    take: 1,
  });
  let later = 0;
  const prev = closings[0];
  if (prev && typeof cfg.openings[date] !== "number") {
    const m = await movementsFor(prev.date);
    const after = prev.createdAt.getTime();
    const asLike = m.entries as unknown as RegisterEntryLike[];
    later =
      asLike.filter((x) => +new Date(x.createdAt) > after).reduce((a, x) => a + entryCashEffect(x), 0) +
      m.jwEvents.filter((ev) => ev.at > after).reduce((a, ev) => a + ev.amount, 0);
  }
  return openingFor(
    date,
    cfg.openings,
    closings.map((c) => ({ date: c.date, session: c.session, counterCashInr: c.counterCashInr, createdAt: c.createdAt })),
    () => later
  );
}

/** Everything the Quick Register screen needs for one day, in one call. */
export async function loadDay(date: string) {
  const cfg = await loadConfig();
  const [{ entries, jwEvents }, opening, closings, recentJw, unsettledJw, khaliAgg, partyCounts, parties] =
    await Promise.all([
      movementsFor(date),
      computeOpening(date, cfg),
      prisma.dailyClosing.findMany({
        where: { date, OR: [{ source: null }, { source: { not: "register-stock" } }] },
        orderBy: { createdAt: "asc" },
      }),
      prisma.jobWorkIntake.findMany({ orderBy: { createdAt: "desc" }, take: 30 }),
      prisma.jobWorkIntake.findMany({ where: { settled: false }, orderBy: { createdAt: "desc" } }),
      prisma.jobWorkIntake.aggregate({ where: { cakeOwnership: "SHOP" }, _sum: { seedKg: true } }),
      prisma.registerEntry.groupBy({
        by: ["partyName"],
        where: { partyName: { not: null } },
        _count: { partyName: true },
        orderBy: { _count: { partyName: "desc" } },
        take: 8,
      }),
      prisma.party.findMany({ where: { active: true }, select: { name: true }, orderBy: { name: "asc" }, take: 500 }),
    ]);

  const jwMap = new Map<string, (typeof recentJw)[number]>();
  for (const j of [...unsettledJw, ...recentJw]) jwMap.set(j.id, j);

  const latest = (session: "AFTERNOON" | "NIGHT") =>
    closings.filter((c) => c.session === session).slice(-1)[0] || null;

  // Which of today's entries carry a proof (✍️ / 🤳 / 👍 badge). Wrapped so the
  // register keeps working even before `prisma db push` adds the table.
  const proofs: Record<string, string[]> = {};
  try {
    const ids = entries.map((e) => e.id);
    if (ids.length) {
      const rows = await prisma.attachment.findMany({
        where: { registerEntryId: { in: ids } },
        select: { registerEntryId: true, kind: true },
      });
      for (const r of rows) if (r.registerEntryId) (proofs[r.registerEntryId] ||= []).push(r.kind);
    }
  } catch {
    /* proofs table not created yet */
  }

  return {
    date,
    config: cfg,
    opening,
    entries,
    jwEvents,
    systemCashNow: systemCash(opening.value, entries as unknown as RegisterEntryLike[], jwEvents),
    tallies: { AFTERNOON: latest("AFTERNOON"), NIGHT: latest("NIGHT") },
    jobWork: Array.from(jwMap.values()).sort((a, b) => +b.createdAt - +a.createdAt),
    khaliKg: ((khaliAgg._sum.seedKg || 0) * KHALI_SPLIT.khaliPct) / 100,
    topParties: partyCounts.map((p) => p.partyName as string).filter(Boolean),
    allParties: parties.map((p) => p.name),
    proofs,
  };
}
