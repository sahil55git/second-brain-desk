// Shared client-side types (dates are ISO strings once serialized to JSON).

export type CakeOwnership = "SHOP" | "CUSTOMER";
export type ClosingSession = "AFTERNOON" | "NIGHT";

export interface JobWorkIntakeDTO {
  id: string;
  customer: string;
  vehicleNo: string | null;
  seedKg: number;
  cakeOwnership: CakeOwnership;
  advanceCustomerInr: number;
  advanceAutoInr: number;
  cans: Record<string, { qty: number; rate: number }> | null;
  notes: string | null;
  settled: boolean;
  settlementCustomerInr: number | null;
  settlementAutoInr: number | null;
  settlementRatePerKg: number | null;
  settlementAmountInr: number | null;
  settledAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface StockProductComputedDTO {
  today: number | null;
  yesterday: number | null;
  yesterdaySource: "auto" | "override" | "none";
  reportSale?: number | null;
  sale?: number | null;
  gap?: number | null;
  diff?: number | null;
}

export interface DailyClosingDTO {
  id: string;
  date: string;
  session: ClosingSession;
  cashInOpening: number;
  cashInSales: number;
  cashInOther: number;
  cashOutGrn: number;
  cashOutExpenses: number;
  cashOutSalary: number;
  cashOutUpi: number;
  cashOutDraw: number;
  cashOutOther: number;
  counterCashInr: number;
  systemCashInr: number;
  cashDiffInr: number;
  cashMismatch: boolean;
  stock: Record<string, StockProductComputedDTO> | null;
  createdAt: string;
  updatedAt: string;
}

// Manufacturing — barrel/batch (plan doc, Versions 19-20).
export interface BatchSupplierDTO {
  name: string;
  seedKg: number;
}

export interface MfgBatchDTO {
  id: string;
  mill: string | null;
  barrel: string;
  productItem: string;
  date: string;
  suppliers: BatchSupplierDTO[];
  step1Kg: number | null;
  step2Kg: number | null;
  step3Kg: number | null;
  step4Kg: number | null;
  step2Date: string | null;
  step2Time: string | null;
  step3Date: string | null;
  step3Time: string | null;
  step4Date: string | null;
  step4Time: string | null;
  refOilPct: number;
  moisturePct: number | null;
  systemOilKgOverride: number | null;
  seedQuality: string | null;
  notes: string | null;
  // Snapshotted computeBarrelYield() result (shape from lib/mfgCalculations.ts).
  yield: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}
