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

// Auth / roles (erp-architecture-plan.md, Phase 1).
export type UserRole = "OWNER" | "STAFF";

export interface UserDTO {
  id: string;
  username: string;
  name: string;
  role: UserRole;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

// Unified customer/supplier master (erp-architecture-plan.md, Phase 1).
export type PartyType = "CUSTOMER" | "SUPPLIER" | "BOTH";

export interface PartyDTO {
  id: string;
  type: PartyType;
  name: string;
  phone: string | null;
  email: string | null;
  gstin: string | null;
  address: string | null;
  state: string | null;
  openingBalanceInr: number;
  notes: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

// Inventory / SKU master (erp-architecture-plan.md, Phase 1).
export interface ItemDTO {
  id: string;
  name: string;
  sku: string | null;
  unit: string;
  hsnCode: string | null;
  gstRatePct: number | null;
  barcode: string | null;
  openingStockQty: number;
  reorderLevelQty: number | null;
  notes: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

// Singleton business profile + GST settings (erp-architecture-plan.md, Phase 1).
export interface BusinessSettingsDTO {
  id: string;
  businessName: string;
  gstin: string | null;
  address: string | null;
  state: string | null;
  phone: string | null;
  email: string | null;
  defaultGstRatePct: number;
  invoicePrefix: string;
  invoiceCounter: number;
  updatedAt: string;
}

// Phase 2 — core ledgers (erp-architecture-plan.md).
export type PaymentMode = "CASH" | "UPI" | "BANK" | "CREDIT" | "OTHER";

export interface SalesLineItemDTO {
  id: string;
  invoiceId: string;
  itemId: string | null;
  name: string;
  hsnCode: string | null;
  qty: number;
  unit: string;
  rateInr: number;
  gstRatePct: number;
  lineSubtotalInr: number;
  lineTaxInr: number;
  lineTotalInr: number;
}

export interface SalesInvoiceDTO {
  id: string;
  invoiceNo: string;
  date: string;
  partyId: string;
  partyStateSnapshot: string | null;
  businessStateSnapshot: string | null;
  interState: boolean;
  subtotalInr: number;
  cgstInr: number;
  sgstInr: number;
  igstInr: number;
  totalInr: number;
  paymentMode: PaymentMode;
  notes: string | null;
  lineItems: SalesLineItemDTO[];
  // Convenience join (present when the API includes the party relation).
  party?: { id: string; name: string } | null;
  createdAt: string;
  updatedAt: string;
}

export interface PurchaseLineItemDTO {
  id: string;
  billId: string;
  itemId: string | null;
  name: string;
  hsnCode: string | null;
  qty: number;
  unit: string;
  rateInr: number;
  gstRatePct: number;
  lineSubtotalInr: number;
  lineTaxInr: number;
  lineTotalInr: number;
}

export interface PurchaseBillDTO {
  id: string;
  billNo: string;
  date: string;
  partyId: string;
  partyStateSnapshot: string | null;
  businessStateSnapshot: string | null;
  interState: boolean;
  subtotalInr: number;
  cgstInr: number;
  sgstInr: number;
  igstInr: number;
  totalInr: number;
  paymentMode: PaymentMode;
  notes: string | null;
  lineItems: PurchaseLineItemDTO[];
  party?: { id: string; name: string } | null;
  createdAt: string;
  updatedAt: string;
}

export interface ExpenseDTO {
  id: string;
  date: string;
  category: string;
  amountInr: number;
  partyId: string | null;
  paymentMode: PaymentMode;
  notes: string | null;
  party?: { id: string; name: string } | null;
  createdAt: string;
  updatedAt: string;
}

// Vyapar cross-check snapshot (erp-architecture-plan.md). The parsed figures
// from vyapar_reader.py go in `payload`. Every field is optional so a partial
// reader output still renders — the desk shows "—" for anything missing.
export interface VyaparTopItem {
  name: string;
  qty: number;
  unit?: string | null;
  stockValueInr?: number | null;
  change7d?: number | null; // qty change over the trailing 7 days, if known
}

export interface VyaparPartyBalance {
  name: string;
  balanceDueInr: number; // positive = they owe the business
}

export interface VyaparSnapshotPayload {
  entity?: string; // e.g. "Mahadev Oil Mill (Non-GST, complete book)"
  backupTakenAt?: string; // free-text, e.g. "14-09-2026 18:12"
  asOfDate?: string; // the "till today" date the figures represent, e.g. "12-09-2026"
  periodLabel?: string; // e.g. "trailing 90 days (14-06-2026 to 12-09-2026)"

  sales90dInr?: number;
  purchases90dInr?: number;
  stockValueInr?: number;
  activeItems?: number;
  receivableInr?: number; // sum of positive customer balances (customers owe)
  payableInr?: number; // sum of what the business owes suppliers, if tracked

  topItems?: VyaparTopItem[];
  topCustomerBalances?: VyaparPartyBalance[];

  notes?: string; // any data-quality note the reader wants to surface
}

export interface VyaparSnapshotDTO {
  id: string;
  payload: VyaparSnapshotPayload;
  updatedAt: string;
}
