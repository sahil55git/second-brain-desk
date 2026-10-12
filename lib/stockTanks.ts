// Oil tanks and barrels on the Stock page: sizes (in kg, the way the shop weighs
// oil), fill level and status. Pure helpers — the screen is components/stock/TankView.tsx.

export type TankDef = { key: string; name: string; kn: string; capKg: number; color: string };

/** `key` is the product key in the daily stock tally (lib/calculations STOCK_PRODUCTS). */
export const TANKS: TankDef[] = [
  { key: "sf", name: "Sunflower tank", kn: "ಸೂರ್ಯಕಾಂತಿ", capKg: 2700, color: "#E9B31D" },
  { key: "soyabean", name: "Soyabean tank", kn: "ಸೋಯಾಬೀನ್", capKg: 2700, color: "#C8A84A" },
  { key: "karadi1", name: "Karadi tank", kn: "ಕರಡಿ", capKg: 580, color: "#EA7A2A" },
  { key: "groundnut", name: "Groundnut tank", kn: "ಶೇಂಗಾ", capKg: 580, color: "#B07A45" },
];

/** Barrels are filled to 180 kg as standard; they can physically take 10 kg more. */
export const BARREL = { standardKg: 180, maxKg: 190 };
/** A tank at or under this share of its size is shown as Low. */
export const LOW_PCT = 20;

export const CAPS_KEY = "sbd_tank_caps_v1";

const r1 = (n: number) => Math.round(n * 10) / 10;

export function fillPct(kg: number | null | undefined, capKg: number): number {
  if (kg == null || !Number.isFinite(kg) || !(capKg > 0)) return 0;
  return Math.max(0, Math.min(100, Math.round((kg / capKg) * 100)));
}

export type TankStatus = "uncounted" | "low" | "ok" | "full" | "over";
export function tankStatus(kg: number | null | undefined, capKg: number): TankStatus {
  if (kg == null || !Number.isFinite(kg)) return "uncounted";
  if (kg > capKg + 0.5) return "over";
  const pct = (kg / capKg) * 100;
  if (pct <= LOW_PCT) return "low";
  if (pct >= 97) return "full";
  return "ok";
}

export function freeKg(kg: number | null | undefined, capKg: number): number | null {
  if (kg == null || !Number.isFinite(kg)) return null;
  return r1(Math.max(0, capKg - kg));
}

export type BarrelStatus = "short" | "standard" | "top" | "over";
/** Where a barrel's oil sits against the 180 kg standard and the 190 kg limit. */
export function barrelStatus(kg: number): BarrelStatus {
  if (kg > BARREL.maxKg + 0.5) return "over";
  if (kg > BARREL.standardKg + 0.5) return "top";
  if (kg >= BARREL.standardKg - 5) return "standard";
  return "short";
}

/** Saved tank sizes: keep only sensible numbers, fall back to the shop's sizes. */
export function normalizeCaps(raw: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  const r = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  for (const t of TANKS) {
    const v = Number(r[t.key]);
    out[t.key] = Number.isFinite(v) && v >= 50 && v <= 100000 ? Math.round(v) : t.capKg;
  }
  return out;
}

export function parseCap(input: string): number | null {
  const v = Number(String(input).replace(/,/g, "").trim());
  return Number.isFinite(v) && v >= 50 && v <= 100000 ? Math.round(v) : null;
}

/** Seed and oil-cake bags are mostly 40 to 50 kg each. */
export const BAG = { minKg: 40, maxKg: 50 };

/** About how many bags a weight is: fewest (all 50 kg bags) to most (all 40 kg bags). */
export function bagRange(kg: number | null | undefined): { min: number; max: number } | null {
  if (kg == null || !Number.isFinite(kg) || kg <= 0) return null;
  return { min: Math.ceil(kg / BAG.maxKg), max: Math.ceil(kg / BAG.minKg) };
}
