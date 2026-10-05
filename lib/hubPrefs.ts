// Per-device preferences for the Reports & Dashboard hub (same per-browser
// approach as lib/customize.tsx): which widgets, their order, the default
// date range and the live auto-refresh interval. Edited from the dashboard
// ("Arrange widgets") and from /settings.
export type Preset = "today" | "yesterday" | "7d" | "30d" | "month" | "lastMonth";
export type WidgetId = "kpis" | "monthTotals" | "attention" | "stockTally" | "sales7" | "expenses7" | "oil7" | "cashToday" | "topItems" | "recent";

export const WIDGETS: { id: WidgetId; label: string }[] = [
  { id: "kpis", label: "Key numbers (today)" },
  { id: "monthTotals", label: "Totals — this month" },
  { id: "attention", label: "Needs attention" },
  { id: "stockTally", label: "Stock tally (physical vs system)" },
  { id: "sales7", label: "Sales chart — 7 days" },
  { id: "cashToday", label: "Cash today" },
  { id: "expenses7", label: "Expenses chart — 7 days" },
  { id: "oil7", label: "Oil produced — 7 days" },
  { id: "topItems", label: "Top selling items" },
  { id: "recent", label: "Today's transactions" },
];

export type WidgetSize = "s" | "m" | "l" | "xl" | "full";
// Width in a 12-column grid (phones always use full width).
export const SIZE_SPAN: Record<WidgetSize, number> = { s: 3, m: 4, l: 6, xl: 8, full: 12 };
export const DEFAULT_SIZES: Record<WidgetId, WidgetSize> = {
  kpis: "full",
  monthTotals: "full",
  attention: "full",
  stockTally: "l",
  sales7: "m",
  cashToday: "m",
  expenses7: "m",
  oil7: "m",
  topItems: "m",
  recent: "full",
};

export interface HubPrefs {
  widgets: WidgetId[];
  hidden: WidgetId[];
  sizes: Partial<Record<WidgetId, WidgetSize>>;
  refreshSec: number; // 0 = off
  defaultRange: Preset;
}

export const HUB_PREFS_KEY = "hub-prefs";
export const DEFAULT_HUB_PREFS: HubPrefs = {
  widgets: WIDGETS.map((w) => w.id),
  hidden: [],
  sizes: {},
  refreshSec: 60,
  defaultRange: "7d",
};

export function loadHubPrefs(): HubPrefs {
  if (typeof window === "undefined") return DEFAULT_HUB_PREFS;
  try {
    const raw = JSON.parse(localStorage.getItem(HUB_PREFS_KEY) || "null");
    if (!raw || typeof raw !== "object") return DEFAULT_HUB_PREFS;
    const known = new Set(WIDGETS.map((w) => w.id));
    const order = (Array.isArray(raw.widgets) ? raw.widgets : []).filter((w: WidgetId) => known.has(w));
    for (const w of WIDGETS) if (!order.includes(w.id)) order.push(w.id); // new widgets appear
    return {
      widgets: order,
      hidden: (Array.isArray(raw.hidden) ? raw.hidden : []).filter((w: WidgetId) => known.has(w)),
      sizes: Object.fromEntries(
        Object.entries(raw.sizes && typeof raw.sizes === "object" ? raw.sizes : {}).filter(
          ([k, v]) => known.has(k as WidgetId) && ["s", "m", "l", "xl", "full"].includes(v as string)
        )
      ),
      refreshSec: [0, 30, 60, 300].includes(raw.refreshSec) ? raw.refreshSec : 60,
      defaultRange: ["today", "yesterday", "7d", "30d", "month", "lastMonth"].includes(raw.defaultRange) ? raw.defaultRange : "7d",
    };
  } catch {
    return DEFAULT_HUB_PREFS;
  }
}

export function saveHubPrefs(p: HubPrefs) {
  try {
    localStorage.setItem(HUB_PREFS_KEY, JSON.stringify(p));
  } catch {
    /* storage blocked */
  }
}
