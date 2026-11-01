// Fetch today's mandi prices from data.gov.in (Agmarknet) and keep them in AppSetting "mandi".
// Set DATA_GOV_API_KEY in Vercel (free: https://data.gov.in → sign up → My account → API key);
// without it the public sample key is tried, which returns only a few rows.
import { prisma } from "@/lib/db";
import { businessDate } from "@/lib/register";
import { COMMODITIES, MANDI_RESOURCE, STATES, mergeHistory, parseMandi, type MandiRow } from "@/lib/mandi";

const SAMPLE_KEY = "579b464db66ec23bdd000001cdd3946e44ce4aad7209ff7b23ac571b";
export interface MandiStore { rows: MandiRow[]; updatedAt: string | null; lastError?: string | null }

export async function loadMandi(): Promise<MandiStore> {
  const r = await prisma.appSetting.findUnique({ where: { key: "mandi" } });
  const d = (r?.data as unknown as MandiStore | null) || null;
  return { rows: Array.isArray(d?.rows) ? d!.rows : [], updatedAt: d?.updatedAt || null, lastError: d?.lastError || null };
}
async function save(s: MandiStore) {
  const data = JSON.parse(JSON.stringify(s));
  await prisma.appSetting.upsert({ where: { key: "mandi" }, create: { key: "mandi", data }, update: { data } });
}

export async function refreshMandi(): Promise<{ added: number; error: string | null }> {
  const key = process.env.DATA_GOV_API_KEY || SAMPLE_KEY;
  const jobs = COMMODITIES.flatMap((c) => STATES.map((s) => ({ c, s })));
  const got: MandiRow[] = [];
  const errors: string[] = [];
  await Promise.all(jobs.map(async ({ c, s }) => {
    const u = new URL(`https://api.data.gov.in/resource/${MANDI_RESOURCE}`);
    u.searchParams.set("api-key", key);
    u.searchParams.set("format", "json");
    u.searchParams.set("limit", "200");
    u.searchParams.set("filters[commodity]", c);
    u.searchParams.set("filters[state]", s);
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 15000);
    try {
      const res = await fetch(u.toString(), { signal: ctrl.signal, cache: "no-store" });
      if (!res.ok) { errors.push(`${c}/${s}: ${res.status}`); return; }
      got.push(...parseMandi(await res.json()));
    } catch (e) {
      errors.push(`${c}/${s}: ${e instanceof Error ? e.message : "failed"}`);
    } finally {
      clearTimeout(t);
    }
  }));
  const cur = await loadMandi();
  const today = businessDate(Date.now());
  const rows = mergeHistory(cur.rows, got, today);
  const error = got.length ? null : errors[0] || "No prices in the feed today.";
  await save({ rows, updatedAt: new Date().toISOString(), lastError: error });
  return { added: got.length, error };
}

/** Your own rate from a local trader / APMC, kept with the feed (market "My rate"). */
export async function addManualRate(commodity: string, modalQtl: number, market: string) {
  const cur = await loadMandi();
  const today = businessDate(Date.now());
  const row: MandiRow = { date: today, commodity, market: market || "My rate", district: "", state: "", variety: "manual", minQtl: modalQtl, maxQtl: modalQtl, modalQtl };
  await save({ ...cur, rows: mergeHistory(cur.rows, [row], today) });
}
