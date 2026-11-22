export type StockMaterial = "seed" | "khali" | "oil";

export function bagEquivalent(kg: number, kgPerBag: number) {
  const remainder = Math.round((kg % kgPerBag) * 1000) / 1000;
  return { bags: Math.floor(kg / kgPerBag), remainder };
}

export interface StockCount {
  material: StockMaterial;
  item: string;
  kg: number;
  bags: number | null;
  looseKg: number | null;
  kgPerBag: number | null;
}

export function readStockCount(input: unknown): StockCount | null {
  if (!input || typeof input !== "object") return null;
  const c = input as Partial<StockCount>;
  if (c.material !== "seed" && c.material !== "khali" && c.material !== "oil") return null;
  if (typeof c.item !== "string" || !c.item.trim() || c.item.trim().length > 80) return null;
  const item = c.item.trim().replace(/\s+/g, " ");
  if (typeof c.kg !== "number" || !Number.isFinite(c.kg) || c.kg < 0) return null;
  if (c.material === "oil") return { material: c.material, item, kg: c.kg, bags: null, looseKg: null, kgPerBag: null };
  if (typeof c.bags !== "number" || !Number.isSafeInteger(c.bags) || c.bags < 0) return null;
  if (c.looseKg !== null && (typeof c.looseKg !== "number" || !Number.isFinite(c.looseKg) || c.looseKg < 0 || c.looseKg > c.kg)) return null;
  if (c.kgPerBag !== 40 && !(c.material === "khali" && c.kgPerBag === 45)) return null;
  return { material: c.material, item, kg: c.kg, bags: c.bags, looseKg: c.looseKg, kgPerBag: c.kgPerBag };
}
