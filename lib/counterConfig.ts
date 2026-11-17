// Weigh & Bill counter set-up, shared by every device (app setting "counter", owner edits):
// the item keys (PLU number, English + Kannada name, unit, own rate) and what staff may not do.
import type { CatalogItem } from "./register";

export interface CounterItem {
  /** register catalogue key; "new:<name>" for an item made here (saved as an "Other" item with its name) */
  key: string;
  plu: number;
  en: string;
  kn: string;
  icon: string;
  unit: "kg" | "L" | "pcs";
  /** counter's own rate; 0 = use the register's last rate */
  rate: number;
  hidden?: boolean;
}

export const STAFF_LOCKS = {
  rate: ["Change a rate", "ದರ ಬದಲಾಯಿಸುವುದು"],
  discount: ["Give a discount", "ರಿಯಾಯಿತಿ ಕೊಡುವುದು"],
  typedWeight: ["Type a weight by hand", "ತೂಕವನ್ನು ಕೈಯಿಂದ ಟೈಪ್ ಮಾಡುವುದು"],
  udhaar: ["Udhaar (credit) bills", "ಉದ್ರಿ ಬಿಲ್"],
  cancel: ["Cancel or edit a saved bill", "ಉಳಿಸಿದ ಬಿಲ್ ರದ್ದು / ತಿದ್ದುಪಡಿ"],
  dropHold: ["Delete a held bill", "ಹಿಡಿದ ಬಿಲ್ ಅಳಿಸುವುದು"],
  settings: ["Open counter settings", "ಕೌಂಟರ್ ಸೆಟ್ಟಿಂಗ್ಸ್ ತೆರೆಯುವುದು"],
} as const;
export type StaffLock = keyof typeof STAFF_LOCKS;

export interface CounterConfig {
  items: CounterItem[];
  /** things staff may NOT do at the counter (the owner always can) */
  staffLocks: StaffLock[];
}

const UNITS = ["kg", "L", "pcs"] as const;

/** First set-up: the register's sale items, numbered 1, 2, 3 … */
export function defaultItems(catalog: CatalogItem[]): CounterItem[] {
  return catalog
    .filter((c) => c.key !== "other")
    .map((c, i) => ({ key: c.key, plu: i + 1, en: c.en, kn: c.kn, icon: c.icon, unit: "kg" as const, rate: 0 }));
}

/** Clean whatever was stored (or sent by the owner) into a valid set-up. */
export function parseCounterConfig(raw: unknown, catalog: CatalogItem[]): CounterConfig {
  const o = (raw || {}) as Record<string, unknown>;
  const items: CounterItem[] = [];
  const usedPlu = new Set<number>();
  const usedKey = new Set<string>();
  if (Array.isArray(o.items)) {
    for (const r of o.items.slice(0, 200)) {
      const x = (r || {}) as Record<string, unknown>;
      const en = typeof x.en === "string" ? x.en.trim().slice(0, 40) : "";
      let key = typeof x.key === "string" ? x.key.trim().slice(0, 60) : "";
      if (!en) continue;
      if (!key) key = `new:${en.toLowerCase()}`;
      if (usedKey.has(key)) continue;
      let plu = Math.floor(Number(x.plu));
      if (!(plu > 0 && plu < 10000) || usedPlu.has(plu)) plu = nextPlu(usedPlu);
      usedPlu.add(plu);
      usedKey.add(key);
      const rate = Number(x.rate);
      items.push({
        key,
        plu,
        en,
        kn: typeof x.kn === "string" ? x.kn.trim().slice(0, 40) : "",
        icon: typeof x.icon === "string" && x.icon.trim() ? x.icon.trim().slice(0, 4) : "🛢️",
        unit: UNITS.includes(x.unit as (typeof UNITS)[number]) ? (x.unit as CounterItem["unit"]) : "kg",
        rate: Number.isFinite(rate) && rate > 0 ? Math.round(rate * 100) / 100 : 0,
        ...(x.hidden === true ? { hidden: true } : {}),
      });
    }
  }
  const staffLocks = Array.isArray(o.staffLocks) ? (o.staffLocks.filter((k) => typeof k === "string" && k in STAFF_LOCKS) as StaffLock[]) : [];
  return { items: items.length ? items.sort((a, b) => a.plu - b.plu) : defaultItems(catalog), staffLocks: Array.from(new Set(staffLocks)) };
}

export function nextPlu(used: Set<number> | number[]): number {
  const s = used instanceof Set ? used : new Set(used);
  let n = 1;
  while (s.has(n)) n++;
  return n;
}

export const findPlu = (items: CounterItem[], plu: number) => items.find((i) => i.plu === plu && !i.hidden);

/** Is this action allowed for this user? The owner always may. */
export const allowed = (cfg: CounterConfig, isOwner: boolean, lock: StaffLock) => isOwner || !cfg.staffLocks.includes(lock);

/** Register fields for a counter item: catalogue items keep their key; items made here go in as "Other" with their name. */
export function registerItem(i: Pick<CounterItem, "key" | "en">): { item: string; label: string } {
  return i.key.startsWith("new:") ? { item: "other", label: i.en } : { item: i.key, label: i.en };
}
