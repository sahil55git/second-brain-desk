import { describe, it, expect } from "vitest";
import {
  PROOF_KINDS,
  PROOF_META,
  SCAN_FIELDS,
  SCAN_KINDS,
  buildScanPrompt,
  fileNameFor,
  folderPath,
  gstinChecksumOk,
  normalizeScan,
  parseDataUrl,
  phoneFileName,
  proofNeeded,
  safePart,
  scanEntryKind,
  scanSummary,
  scanWarnings,
} from "../proofs";
import { normalizeConfig } from "../register";

describe("folders and file names", () => {
  it("files each kind in its own folder by month", () => {
    expect(folderPath("SIGNATURE", "2026-10-10")).toEqual(["06_Scans_&_Proofs", "Payment_Signatures", "2026-10"]);
    expect(folderPath("WEIGHBRIDGE", "2026-01-31")).toEqual(["06_Scans_&_Proofs", "Weighbridge_Slips", "2026-01"]);
    const folders = PROOF_KINDS.map((k) => PROOF_META[k].folder);
    expect(new Set(folders).size).toBe(folders.length);
  });
  it("names files by date, IST time, kind, party, ref and amount", () => {
    // 09:02:03 UTC = 14:32:03 IST
    const n = fileNameFor({ kind: "SIGNATURE", date: "2026-10-10", at: Date.UTC(2026, 9, 10, 9, 2, 3), mime: "image/png", party: "Ramesh K.", amountInr: 5000.4 });
    expect(n).toBe("2026-10-10_14-32-03_Signature_Ramesh_K_Rs5000.png");
    const b = fileNameFor({ kind: "BILL", date: "2026-10-10", at: Date.UTC(2026, 9, 10, 9, 2, 3), mime: "image/jpeg", party: "Sri Balaji Traders / Bidar", ref: "INV-42" });
    expect(b).toBe("2026-10-10_14-32-03_Bill_invoice_Sri_Balaji_Traders_Bidar_NoINV_42.jpg");
    expect(phoneFileName("BILL", b)).toBe("Bills_&_Invoices__" + b);
  });
  it("keeps Kannada names and drops unsafe characters", () => {
    expect(safePart("ರಮೇಶ್ / ../etc")).toBe("ರಮೇಶ್_etc");
    expect(safePart(null)).toBe("");
  });
});

describe("data urls", () => {
  it("accepts png/jpeg/webp images only", () => {
    expect(parseDataUrl("data:image/png;base64,iVBORw0KGgo=")?.mime).toBe("image/png");
    expect(parseDataUrl("data:image/jpeg;base64,/9j/4AAQ")?.bytes).toBe(6);
    expect(parseDataUrl("data:text/html;base64,PGh0bWw+")).toBeNull();
    expect(parseDataUrl("data:image/svg+xml;base64,PHN2Zz4=")).toBeNull();
    expect(parseDataUrl(42)).toBeNull();
  });
});

describe("scanned fields", () => {
  it("every scan kind has a prompt that lists its keys", () => {
    for (const k of SCAN_KINDS) {
      const p = buildScanPrompt(k);
      for (const f of SCAN_FIELDS[k]) expect(p).toContain(`"${f.key}"`);
    }
  });
  it("normalizes numbers, dates, vehicle numbers and GSTIN", () => {
    const f = normalizeScan("WEIGHBRIDGE", {
      date: "05/10/2026",
      vehicleNo: "ka 38 a-1234",
      grossKg: "12,450 kg",
      tareKg: 4200,
      netKg: "8250",
      material: "  Safflower  ",
      junk: "ignored",
    });
    expect(f).toMatchObject({ date: "2026-10-05", vehicleNo: "KA38A1234", grossKg: 12450, tareKg: 4200, netKg: 8250, material: "Safflower", slipNo: null });
    expect("junk" in f).toBe(false);
    expect(normalizeScan("BILL", { gstin: "29 aabcu9603r1zm", totalInr: "₹1,05,000.50" })).toMatchObject({ gstin: "29AABCU9603R1ZM", totalInr: 105000.5 });
  });
  it("never invents a number from unreadable text", () => {
    expect(normalizeScan("RECEIPT", { amountInr: "abc" }).amountInr).toBeNull();
    expect(normalizeScan("RECEIPT", null).amountInr).toBeNull();
  });
});

describe("warnings", () => {
  it("flags gross − tare ≠ net on a weighbridge slip", () => {
    expect(scanWarnings("WEIGHBRIDGE", { grossKg: 12450, tareKg: 4200, netKg: 8250 })).toHaveLength(0);
    const w = scanWarnings("WEIGHBRIDGE", { grossKg: 12450, tareKg: 4200, netKg: 8520 });
    expect(w[0].key).toBe("netKg");
  });
  it("flags kg × rate ≠ amount on a weighing slip", () => {
    expect(scanWarnings("WEIGHING", { weightKg: 10, rateInr: 250, amountInr: 2500 })).toHaveLength(0);
    expect(scanWarnings("WEIGHING", { weightKg: 10, rateInr: 250, amountInr: 2800 })).toHaveLength(1);
  });
  it("checks the GSTIN check digit and bill totals", () => {
    expect(gstinChecksumOk("27AAPFU0939F1ZV")).toBe(true);
    expect(gstinChecksumOk("27AAPFU0939F1ZX")).toBe(false);
    expect(gstinChecksumOk("not-a-gstin")).toBe(false);
    const w = scanWarnings("BILL", { gstin: "27AAPFU0939F1ZX", taxableInr: 100000, gstInr: 5000, totalInr: 105000 });
    expect(w.map((x) => x.key)).toEqual(["gstin"]);
    expect(scanWarnings("BILL", { taxableInr: 100000, gstInr: 5000, totalInr: 115000 })[0].key).toBe("totalInr");
  });
});

describe("turning a scan into an entry", () => {
  it("picks amount / qty / party / ref per kind", () => {
    expect(scanSummary("WEIGHBRIDGE", { netKg: 8250, party: "Ravi", slipNo: "77", chargesInr: 60 })).toEqual({ amountInr: 60, party: "Ravi", qtyKg: 8250, ref: "77" });
    expect(scanSummary("BILL", { totalInr: 105000, qtyKg: 2500, billNo: "A1", party: "X" })).toEqual({ amountInr: 105000, party: "X", qtyKg: 2500, ref: "A1" });
    expect(scanEntryKind("RECEIPT")).toBe("EXPENSE");
    expect(scanEntryKind("BILL")).toBe("PURCHASE");
  });
});

describe("proof-needed rule", () => {
  it("applies only to chosen kinds at or above the minimum", () => {
    expect(proofNeeded(["PAYMENT"], "PAYMENT", 500, 0)).toBe(true);
    expect(proofNeeded(["PAYMENT"], "EXPENSE", 500, 0)).toBe(false);
    expect(proofNeeded(["EXPENSE"], "EXPENSE", 200, 500)).toBe(false);
    expect(proofNeeded(["EXPENSE"], "EXPENSE", 500, 500)).toBe(true);
    expect(proofNeeded([], "PAYMENT", 9999, 0)).toBe(false);
  });
  it("is off by default and survives config normalization", () => {
    expect(normalizeConfig({}).proofRequired).toEqual([]);
    expect(normalizeConfig({ proofRequired: ["PAYMENT", "SALE", "x"], proofMinInr: 500 })).toMatchObject({ proofRequired: ["PAYMENT"], proofMinInr: 500 });
    expect(normalizeConfig({ proofMinInr: -5 }).proofMinInr).toBe(0);
  });
});
