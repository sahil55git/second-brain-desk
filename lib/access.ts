// Users, profiles and access. A profile says which PAGES a user can open, which
// Quick Register FUNCTIONS they can use, which WINDOWS they see and which DATA is
// hidden from them. Pure helpers (no React, no Prisma) so the server, the
// middleware and the screens all use the same rules.
import type { RegisterKind } from "./register";

export const PAGE_DEFS = [
  { key: "register", label: "Quick Register" },
  { key: "stock", label: "Stock" },
  { key: "sales", label: "Sales" },
  { key: "parties", label: "Parties" },
  { key: "jobwork", label: "Job-work" },
  { key: "reports", label: "Reports" },
  { key: "mfg", label: "Manufacturing" },
  { key: "settings", label: "Settings" },
] as const;
export const FN_DEFS = [
  { key: "sale", label: "Sale", icon: "💰" },
  { key: "purchase", label: "Purchase", icon: "🛒" },
  { key: "expense", label: "Expense", icon: "🧾" },
  { key: "udhaar", label: "Udhaar in", icon: "🤝" },
  { key: "payment", label: "Payment out", icon: "💸" },
  { key: "pigmee", label: "Pigmee", icon: "🏦" },
  { key: "draw", label: "Owner draw", icon: "🧔" },
  { key: "count", label: "Count cash", icon: "💵" },
  { key: "stock", label: "Stock count", icon: "📦" },
  { key: "jobwork", label: "Job-work", icon: "🌾" },
  { key: "reports", label: "Reports", icon: "🖨️" },
] as const;
export const WIN_DEFS = [
  { key: "form", label: "Entry form" },
  { key: "work", label: "Workspace" },
  { key: "entries", label: "Today's entries" },
  { key: "summary", label: "Summary strip" },
] as const;
export const HIDE_DEFS = [
  { key: "totals", label: "Cash balance and totals" },
  { key: "profit", label: "Profit and margins" },
  { key: "udhaar", label: "Udhaar / party balances" },
  { key: "others", label: "Other users' entries" },
  { key: "rates", label: "Rates and costs" },
] as const;

export type PageKey = (typeof PAGE_DEFS)[number]["key"];
export type FnKey = (typeof FN_DEFS)[number]["key"];
export type WinKey = (typeof WIN_DEFS)[number]["key"];
export type HideKey = (typeof HIDE_DEFS)[number]["key"];

export interface Perms {
  pg: Record<PageKey, boolean>;
  fn: Record<FnKey, boolean>;
  win: Record<WinKey, boolean>;
  hide: Record<HideKey, boolean>;
}

const fill = <K extends string>(defs: readonly { key: K }[], v: boolean, over: Partial<Record<K, boolean>> = {}): Record<K, boolean> =>
  Object.fromEntries(defs.map((d) => [d.key, over[d.key] ?? v])) as Record<K, boolean>;

export const OWNER_PERMS: Perms = {
  pg: fill(PAGE_DEFS, true),
  fn: fill(FN_DEFS, true),
  win: fill(WIN_DEFS, true),
  hide: fill(HIDE_DEFS, false),
};

export interface ProfileDef { id: string; name: string; who: string; perms: Perms }

export const BUILTIN_PROFILES: ProfileDef[] = [
  { id: "owner", name: "Owner", who: "sees everything", perms: OWNER_PERMS },
  {
    id: "manager",
    name: "Manager",
    who: "no owner draw, reports or settings",
    perms: {
      pg: fill(PAGE_DEFS, true, { reports: false, settings: false }),
      fn: fill(FN_DEFS, true, { draw: false, reports: false }),
      win: fill(WIN_DEFS, true),
      hide: fill(HIDE_DEFS, false, { profit: true }),
    },
  },
  {
    id: "counter",
    name: "Counter staff",
    who: "sale, expense, udhaar and cash count",
    perms: {
      pg: fill(PAGE_DEFS, false, { register: true, sales: true }),
      fn: fill(FN_DEFS, false, { sale: true, expense: true, udhaar: true, count: true }),
      win: fill(WIN_DEFS, true),
      hide: fill(HIDE_DEFS, true),
    },
  },
  {
    id: "godown",
    name: "Godown",
    who: "purchase and stock only",
    perms: {
      pg: fill(PAGE_DEFS, false, { stock: true, mfg: true, register: true }),
      fn: fill(FN_DEFS, false, { purchase: true, stock: true }),
      win: fill(WIN_DEFS, true, { work: false, entries: false, summary: false }),
      hide: fill(HIDE_DEFS, true),
    },
  },
];
export const BUILTIN_IDS = BUILTIN_PROFILES.map((p) => p.id);
/** A staff login that was made before profiles existed keeps working like a manager. */
export const LEGACY_STAFF_PROFILE = "manager";

const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));

/** Keeps only known keys with real booleans; anything missing comes from `base`. */
export function normalizePerms(raw: unknown, base: Perms = OWNER_PERMS): Perms {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, Record<string, unknown> | undefined>;
  const pick = <K extends string>(defs: readonly { key: K }[], group: string, b: Record<K, boolean>): Record<K, boolean> =>
    Object.fromEntries(defs.map((d) => [d.key, typeof r[group]?.[d.key] === "boolean" ? (r[group]![d.key] as boolean) : b[d.key]])) as Record<K, boolean>;
  return { pg: pick(PAGE_DEFS, "pg", base.pg), fn: pick(FN_DEFS, "fn", base.fn), win: pick(WIN_DEFS, "win", base.win), hide: pick(HIDE_DEFS, "hide", base.hide) };
}

/** The owner always sees everything: nothing a profile row says can lock the owner out. */
export function effectivePerms(isOwner: boolean, perms: Perms): Perms {
  if (isOwner) return clone(OWNER_PERMS);
  // Settings is the owner's alone, whatever a profile says.
  return { ...clone(perms), pg: { ...perms.pg, settings: false } };
}

export function canPage(p: Perms, k: PageKey) { return !!p.pg[k]; }
export function canFn(p: Perms, k: FnKey) { return !!p.fn[k]; }

/** Which Quick Register function each entry kind needs. */
export function kindToFn(kind: RegisterKind): FnKey {
  switch (kind) {
    case "SALE": case "FRESH_CRUSH": return "sale";
    case "UDHAAR_IN": return "udhaar";
    case "PURCHASE": return "purchase";
    case "EXPENSE": return "expense";
    case "PAYMENT": return "payment";
    case "PIGMEE": return "pigmee";
    case "OWNER_DRAW": return "draw";
  }
}

/**
 * The page a URL belongs to (pages and their APIs), or null when it is open to
 * every signed-in user. Several keys mean "any of these opens it".
 */
export function pagesForPath(pathname: string): PageKey[] | null {
  const p = pathname.replace(/\/+$/, "") || "/";
  const under = (base: string) => p === base || p.startsWith(base + "/");
  // Lookups that the Quick Register forms use (party picker, stock figures, bills)
  // open for anyone who can use the register, as well as for their own page.
  if (under("/api/register/stock")) return ["register", "stock"];
  if (under("/register") || under("/api/register") || under("/cash") || under("/api/expenses") || under("/api/daily-closing")) return ["register"];
  if (under("/stock") || under("/tallies")) return ["stock"];
  if (under("/api/tallies") || under("/api/stock-adjustments") || under("/api/tank")) return ["stock", "register"];
  if (under("/sales")) return ["sales"];
  if (under("/api/sales") || under("/api/held-bills")) return ["sales", "register"];
  if (under("/api/parties") || under("/api/udhaar")) return ["parties", "register", "sales", "jobwork"];
  if (under("/api/job-work")) return ["jobwork", "register"];
  if (under("/api/purchases")) return ["register", "stock", "mfg"];
  if (under("/reports") || under("/api/reports") || under("/records")) return ["reports"];
  if (under("/mfg") || under("/api/manufacturing") || under("/barrels") || under("/api/barrels") || under("/api/barrel-fleet") || under("/api/print-jobs") || under("/api/label-templates") || under("/labels")) return ["mfg", "stock"];
  if (under("/settings") || under("/api/settings") || under("/api/import") || under("/api/users") || under("/api/access/profiles")) return ["settings"];
  return null;
}

export function pathAllowed(p: Perms, pathname: string): boolean {
  const need = pagesForPath(pathname);
  return !need || need.some((k) => canPage(p, k));
}

export const MASK = "••••";

/** Minimal shape of a day's register entries for masking. */
export interface MaskableEntry {
  rateInr?: number | null;
  createdByName?: string | null;
  [k: string]: unknown;
}
/** Entries the user may see: with "other users' entries" hidden, only their own. */
export function visibleEntries<T extends MaskableEntry>(entries: T[], perms: Perms, userName: string): T[] {
  const mine = (userName || "").trim().toLowerCase();
  const list = perms.hide.others ? entries.filter((e) => (e.createdByName || "").trim().toLowerCase() === mine) : entries;
  return perms.hide.rates ? list.map((e) => ({ ...e, rateInr: null })) : list;
}
