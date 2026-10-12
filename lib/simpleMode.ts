// Quick Register "Simple mode": the owner picks a few big buttons, a letter
// size and a language, saves that as a NAMED setting, and decides which setting
// opens by itself when each person signs in (one person ↔ one setting).
import type { LangMode } from "./register";

/** Buttons the owner can put in a simple setting (key = Quick Register tile id). */
export const SIMPLE_TILE_CHOICES: { key: string; icon: string; en: string }[] = [
  { key: "SALE", icon: "💰", en: "Sale" },
  { key: "EXPENSE", icon: "🧾", en: "Expense" },
  { key: "UDHAAR_IN", icon: "🙌", en: "Udhaar received" },
  { key: "count", icon: "💵", en: "Count cash" },
  { key: "cashtally", icon: "🧮", en: "Cash tally" },
  { key: "reports", icon: "🖨️", en: "Day totals" },
  { key: "stock", icon: "📦", en: "Stock tally" },
  { key: "PURCHASE", icon: "🛒", en: "Purchase" },
];
export const SIMPLE_KEYS = SIMPLE_TILE_CHOICES.map((t) => t.key);
export type SimpleSize = "S" | "M" | "L";

export interface SimpleMode {
  id: string;
  name: string;
  tiles: string[];
  size: SimpleSize;
  lang: LangMode;
}

/** Used when someone switches Simple mode on and no setting is assigned to them. */
export const BUILTIN_SIMPLE: SimpleMode = {
  id: "builtin",
  name: "Simple",
  tiles: ["SALE", "EXPENSE", "UDHAAR_IN", "count", "cashtally"],
  size: "L",
  lang: "both",
};

export function normalizeSimpleModes(raw: unknown): SimpleMode[] {
  if (!Array.isArray(raw)) return [];
  const out: SimpleMode[] = [];
  const ids = new Set<string>();
  for (const it of raw.slice(0, 20)) {
    const r = (it && typeof it === "object" ? it : {}) as Record<string, unknown>;
    const id = typeof r.id === "string" && /^[a-z0-9_-]{1,40}$/i.test(r.id) ? r.id : "";
    const name = String(r.name ?? "").trim().slice(0, 40);
    if (!id || !name || ids.has(id)) continue;
    ids.add(id);
    const tiles = Array.isArray(r.tiles) ? SIMPLE_KEYS.filter((k) => (r.tiles as unknown[]).includes(k)) : [];
    out.push({
      id,
      name,
      tiles: tiles.length ? tiles : [...BUILTIN_SIMPLE.tiles],
      size: r.size === "S" || r.size === "M" || r.size === "L" ? r.size : "L",
      lang: r.lang === "en" || r.lang === "kn" || r.lang === "both" ? r.lang : "both",
    });
  }
  return out;
}

/** username (lower case) -> setting id; unknown settings and blank names are dropped. One person, one setting. */
export function normalizeSimpleAssign(raw: unknown, modes: SimpleMode[]): Record<string, string> {
  const out: Record<string, string> = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [u, id] of Object.entries(raw as Record<string, unknown>)) {
    const user = u.trim().toLowerCase();
    if (user && typeof id === "string" && modes.some((m) => m.id === id)) out[user] = id;
  }
  return out;
}

/** The setting that opens for this person (assigned one, else null). */
export function assignedMode(username: string | null | undefined, modes: SimpleMode[], assign: Record<string, string>): SimpleMode | null {
  const id = assign[String(username || "").toLowerCase()];
  return (id && modes.find((m) => m.id === id)) || null;
}

/** Give a person a setting (or take it away with null). A person can only ever hold one. */
export function assignPerson(assign: Record<string, string>, username: string, modeId: string | null): Record<string, string> {
  const next = { ...assign };
  const u = username.trim().toLowerCase();
  if (!u) return next;
  if (modeId) next[u] = modeId;
  else delete next[u];
  return next;
}

/** Remove a setting and everyone who pointed at it. */
export function deleteMode(modes: SimpleMode[], assign: Record<string, string>, id: string) {
  return { modes: modes.filter((m) => m.id !== id), assign: Object.fromEntries(Object.entries(assign).filter(([, v]) => v !== id)) };
}
