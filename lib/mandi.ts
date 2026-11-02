// 🌾 Mandi (APMC) seed prices: read the government's Agmarknet daily price feed (data.gov.in),
// keep a history, and say when a seed is cheap against its own last 30 days. Pure parts here —
// tested in lib/__tests__/mandi.test.ts; the fetch lives in app/api/mandi/route.ts.

export const MANDI_RESOURCE = "9ef84268-d588-465a-a308-a864a43d0070"; // "Current daily price of various commodities from various markets (Mandi)"
export const COMMODITIES = ["Mustard", "Groundnut", "Sunflower", "Safflower", "Soyabean", "Sesamum(Sesame,Gingelly,Til)", "Castor Seed"];
export const STATES = ["Karnataka", "Maharashtra", "Telangana"];

export interface MandiRow { date: string; commodity: string; market: string; district: string; state: string; variety: string; minQtl: number; maxQtl: number; modalQtl: number }

const toIso = (d: unknown) => {
  const m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(String(d || "").trim());
  return m ? `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}` : /^\d{4}-\d{2}-\d{2}$/.test(String(d)) ? String(d) : null;
};
const n = (v: unknown) => { const x = Number(String(v ?? "").replace(/,/g, "")); return Number.isFinite(x) && x > 0 ? x : null; };

/** data.gov.in JSON → clean rows (bad rows dropped). */
export function parseMandi(json: unknown): MandiRow[] {
  const recs = (json as { records?: Record<string, unknown>[] } | null)?.records;
  if (!Array.isArray(recs)) return [];
  const out: MandiRow[] = [];
  for (const r of recs) {
    const get = (k: string) => r[k] ?? r[k.charAt(0).toUpperCase() + k.slice(1)];
    const date = toIso(get("arrival_date"));
    const modal = n(get("modal_price"));
    if (!date || !modal) continue;
    out.push({ date, commodity: String(get("commodity") || ""), market: String(get("market") || ""), district: String(get("district") || ""), state: String(get("state") || ""), variety: String(get("variety") || ""), minQtl: n(get("min_price")) ?? modal, maxQtl: n(get("max_price")) ?? modal, modalQtl: modal });
  }
  return out;
}

export interface MandiSignal { commodity: string; latest: number; latestDate: string; markets: number; change7Pct: number | null; avg30: number | null; low30: number | null; high30: number | null; signal: "buy" | "wait" | "steady"; say: string; series: { date: string; modal: number }[] }
const addDays = (d: string, k: number) => new Date(new Date(`${d}T00:00:00Z`).getTime() + k * 86400000).toISOString().slice(0, 10);
const r0 = (x: number) => Math.round(x);

/** Per commodity: the day's average modal price across markets, its 7-day change, and a buy / wait hint. */
export function mandiSignals(rows: MandiRow[], prefer: string[] = []): MandiSignal[] {
  const by: Record<string, Record<string, number[]>> = {};
  for (const r of rows) ((by[r.commodity] ||= {})[r.date] ||= []).push(r.modalQtl);
  return Object.entries(by).map(([commodity, days]) => {
    const series = Object.keys(days).sort().map((date) => ({ date, modal: r0(days[date].reduce((a, b) => a + b, 0) / days[date].length) }));
    const last = series[series.length - 1];
    const back7 = [...series].reverse().find((p) => p.date <= addDays(last.date, -6));
    const win = series.filter((p) => p.date > addDays(last.date, -30));
    const avg30 = win.length >= 3 ? r0(win.reduce((a, p) => a + p.modal, 0) / win.length) : null;
    const change7Pct = back7 ? Math.round(((last.modal - back7.modal) / back7.modal) * 1000) / 10 : null;
    let signal: MandiSignal["signal"] = "steady";
    if (avg30 && last.modal <= avg30 * 0.97) signal = "buy";
    else if (change7Pct != null && change7Pct >= 3) signal = "wait";
    const perKg = (x: number) => `₹${(x / 100).toFixed(1)}/kg`;
    const say = signal === "buy" ? `${commodity} is ${Math.round((1 - last.modal / avg30!) * 100)}% below its 30-day average (${perKg(last.modal)} vs ${perKg(avg30!)}) — a good time to buy.`
      : signal === "wait" ? `${commodity} rose ${change7Pct}% this week — buy only what you need; it may settle.`
      : `${commodity} is steady around ${perKg(last.modal)}.`;
    return { commodity, latest: last.modal, latestDate: last.date, markets: days[last.date].length, change7Pct, avg30, low30: win.length ? Math.min(...win.map((p) => p.modal)) : null, high30: win.length ? Math.max(...win.map((p) => p.modal)) : null, signal, say, series };
  }).sort((a, b) => (prefer.indexOf(a.commodity) + 1 || 99) - (prefer.indexOf(b.commodity) + 1 || 99));
}

/** Merge new rows into the kept history (one row per date+commodity+market), keeping `days` days. */
export function mergeHistory(old: MandiRow[], add: MandiRow[], today: string, days = 120): MandiRow[] {
  const key = (r: MandiRow) => `${r.date}|${r.commodity}|${r.market}|${r.variety}`;
  const m = new Map<string, MandiRow>();
  for (const r of old.concat(add)) if (r.date >= addDays(today, -days)) m.set(key(r), r);
  return Array.from(m.values()).sort((a, b) => (a.date < b.date ? -1 : 1));
}
