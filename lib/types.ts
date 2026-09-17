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
