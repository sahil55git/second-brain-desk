import { describe, expect, it } from "vitest";
import { bagEquivalent, readStockCount } from "@/lib/mill/millOperations";

describe("mill stock counts", () => {
  const count = { material: "seed", item: "Karadi seed", kg: 1000, bags: 24, looseKg: 40, kgPerBag: 40 };

  it("keeps counted bags separate from bag equivalents", () => {
    expect(readStockCount(count)).toEqual(count);
    expect(bagEquivalent(count.kg, 40)).toEqual({ bags: 25, remainder: 0 });
    expect(bagEquivalent(count.kg, 45)).toEqual({ bags: 22, remainder: 10 });
  });

  it("uses 45 kg only for khali and rejects inconsistent counts", () => {
    expect(readStockCount({ ...count, kgPerBag: 45 })).toBeNull();
    expect(readStockCount({ ...count, material: "khali", kgPerBag: 45 })?.kgPerBag).toBe(45);
    expect(readStockCount({ ...count, looseKg: 1001 })).toBeNull();
    expect(readStockCount({ ...count, bags: 10.5 })).toBeNull();
  });
});
