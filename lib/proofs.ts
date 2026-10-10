// Proofs & scans — pure helpers shared by the browser and the API routes.
//
// Two features use these:
//  1. Proof of payment: a signature drawn on the screen, a photo of the
//     person receiving the money, or a photo of a thumb impression on a
//     paper voucher — attached to a Quick Register money-out entry.
//  2. Slip / bill scanner: a photo of a weighbridge slip, weighing (scale)
//     slip, bill / invoice or receipt, read by AI into fields that the
//     person checks before saving.
//
// Every file is filed in its own folder, the same on Google Drive and on the
// phone / PC copy:
//   My_Oil_Business_Second_Brain / 06_Scans_&_Proofs / <Category> / <YYYY-MM> / <file>
// No numbers here are business rules; nothing changes a cash or GST figure.

export type ProofKind =
  | "SIGNATURE" // signature drawn on the screen
  | "RECIPIENT_PHOTO" // photo of the person taking the money
  | "THUMB_PAPER" // photo of an inked thumb impression / signed paper voucher
  | "WEIGHBRIDGE" // weighbridge (dharmakanta) slip
  | "WEIGHING" // shop scale / weighing slip
  | "BILL" // supplier bill / tax invoice
  | "RECEIPT"; // expense receipt / cash memo

export const PROOF_KINDS: ProofKind[] = ["SIGNATURE", "RECIPIENT_PHOTO", "THUMB_PAPER", "WEIGHBRIDGE", "WEIGHING", "BILL", "RECEIPT"];
export const PAYMENT_PROOF_KINDS: ProofKind[] = ["SIGNATURE", "RECIPIENT_PHOTO", "THUMB_PAPER"];
export const SCAN_KINDS: ScanKind[] = ["WEIGHBRIDGE", "WEIGHING", "BILL", "RECEIPT"];
export type ScanKind = "WEIGHBRIDGE" | "WEIGHING" | "BILL" | "RECEIPT";

export const ROOT_FOLDER = "06_Scans_&_Proofs";

export const PROOF_META: Record<ProofKind, { folder: string; icon: string; en: string; kn: string }> = {
  SIGNATURE: { folder: "Payment_Signatures", icon: "✍️", en: "Signature", kn: "ಸಹಿ" },
  RECIPIENT_PHOTO: { folder: "Payment_Recipient_Photos", icon: "🤳", en: "Photo of person paid", kn: "ಹಣ ಪಡೆದವರ ಫೋಟೋ" },
  THUMB_PAPER: { folder: "Payment_Thumb_&_Vouchers", icon: "👍", en: "Thumb / signed paper", kn: "ಹೆಬ್ಬೆರಳು / ಸಹಿ ಚೀಟಿ" },
  WEIGHBRIDGE: { folder: "Weighbridge_Slips", icon: "🚛", en: "Weighbridge slip", kn: "ಧರ್ಮಕಾಂಟಾ ಚೀಟಿ" },
  WEIGHING: { folder: "Weighing_Slips", icon: "⚖️", en: "Weighing slip", kn: "ತೂಕದ ಚೀಟಿ" },
  BILL: { folder: "Bills_&_Invoices", icon: "📄", en: "Bill / invoice", kn: "ಬಿಲ್ / ಇನ್‌ವಾಯ್ಸ್" },
  RECEIPT: { folder: "Receipts", icon: "🧾", en: "Receipt", kn: "ರಸೀದಿ" },
};

export function isProofKind(k: unknown): k is ProofKind {
  return typeof k === "string" && (PROOF_KINDS as string[]).includes(k);
}
export function isScanKind(k: unknown): k is ScanKind {
  return typeof k === "string" && (SCAN_KINDS as string[]).includes(k);
}

/** Folder path (outermost first) for a file of this kind on this business date. */
export function folderPath(kind: ProofKind, date: string): string[] {
  const month = /^\d{4}-\d{2}/.test(date) ? date.slice(0, 7) : "undated";
  return [ROOT_FOLDER, PROOF_META[kind].folder, month];
}

/** Safe, readable piece of a file name: letters/digits (incl. Kannada), dash, underscore. */
export function safePart(s: string | null | undefined, max = 30): string {
  return String(s || "")
    .normalize("NFC")
    // ASCII letters/digits and Kannada script; everything else becomes "_".
    .replace(/[^A-Za-z0-9\u0C80-\u0CFF]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, max);
}

export function extFor(mime: string): string {
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  if (mime === "application/pdf") return "pdf";
  return "jpg";
}

/**
 * File name: 2026-10-10_14-32_Signature_Ramesh_Rs5000.png
 * Sorted by date, then time, inside the month folder.
 */
export function fileNameFor(opts: {
  kind: ProofKind;
  date: string;
  at: Date | number;
  mime: string;
  party?: string | null;
  amountInr?: number | null;
  ref?: string | null; // slip / bill number
}): string {
  const t = new Date(opts.at);
  // Time of day in IST, the shop's business clock.
  const ist = new Date(t.getTime() + 330 * 60 * 1000);
  const hh = String(ist.getUTCHours()).padStart(2, "0");
  const mm = String(ist.getUTCMinutes()).padStart(2, "0");
  const ss = String(ist.getUTCSeconds()).padStart(2, "0");
  const bits = [
    /^\d{4}-\d{2}-\d{2}$/.test(opts.date) ? opts.date : "undated",
    `${hh}-${mm}-${ss}`,
    safePart(PROOF_META[opts.kind].en, 24),
    safePart(opts.party),
    opts.ref ? "No" + safePart(opts.ref, 20) : "",
    opts.amountInr && opts.amountInr > 0 ? "Rs" + Math.round(opts.amountInr) : "",
  ].filter(Boolean);
  return `${bits.join("_")}.${extFor(opts.mime)}`;
}

/** Phone copies go to one Downloads folder on Android, so the folder is put in the name. */
export function phoneFileName(kind: ProofKind, name: string): string {
  return `${PROOF_META[kind].folder}__${name}`;
}

// ---------------------------------------------------------------------------
// Data URLs
// ---------------------------------------------------------------------------
export const MAX_IMAGE_BYTES = 3_000_000; // after compression; keeps uploads under Vercel's 4.5 MB body limit

export function parseDataUrl(dataUrl: unknown): { mime: string; base64: string; bytes: number } | null {
  if (typeof dataUrl !== "string") return null;
  const m = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!m) return null;
  const base64 = m[2];
  const pad = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  return { mime: m[1], base64, bytes: Math.floor((base64.length * 3) / 4) - pad };
}

// ---------------------------------------------------------------------------
// Slip / bill fields read by AI
// ---------------------------------------------------------------------------
export interface ScanFieldDef {
  key: string;
  en: string;
  kn: string;
  type: "text" | "number" | "date";
  hint: string; // tells the AI what to look for
}

const F = (key: string, en: string, kn: string, type: ScanFieldDef["type"], hint: string): ScanFieldDef => ({ key, en, kn, type, hint });

export const SCAN_FIELDS: Record<ScanKind, ScanFieldDef[]> = {
  WEIGHBRIDGE: [
    F("slipNo", "Slip no.", "ಚೀಟಿ ಸಂಖ್ಯೆ", "text", "serial / ticket / RST number of the slip"),
    F("date", "Date", "ದಿನಾಂಕ", "date", "date printed on the slip, as YYYY-MM-DD"),
    F("vehicleNo", "Vehicle no.", "ವಾಹನ ಸಂಖ್ಯೆ", "text", "vehicle registration number, e.g. KA38A1234, without spaces"),
    F("party", "Party / supplier", "ಪಕ್ಷ / ಪೂರೈಕೆದಾರ", "text", "customer, supplier or party name"),
    F("material", "Material", "ಸರಕು", "text", "material or commodity, e.g. groundnut, safflower seed"),
    F("grossKg", "Gross kg", "ಒಟ್ಟು ತೂಕ ಕೆಜಿ", "number", "gross / loaded weight in kg"),
    F("tareKg", "Tare kg", "ಖಾಲಿ ತೂಕ ಕೆಜಿ", "number", "tare / empty vehicle weight in kg"),
    F("netKg", "Net kg", "ನಿವ್ವಳ ತೂಕ ಕೆಜಿ", "number", "net weight in kg (gross minus tare)"),
    F("chargesInr", "Weighing charges ₹", "ತೂಕದ ಶುಲ್ಕ ₹", "number", "weighbridge fee in rupees, if printed"),
    F("weighbridge", "Weighbridge name", "ಧರ್ಮಕಾಂಟಾ ಹೆಸರು", "text", "name of the weighbridge that printed the slip"),
  ],
  WEIGHING: [
    F("slipNo", "Slip no.", "ಚೀಟಿ ಸಂಖ್ಯೆ", "text", "slip / token number"),
    F("date", "Date", "ದಿನಾಂಕ", "date", "date as YYYY-MM-DD"),
    F("party", "Customer / party", "ಗ್ರಾಹಕ / ಪಕ್ಷ", "text", "customer or party name"),
    F("item", "Item", "ಐಟಂ", "text", "item or product weighed"),
    F("weightKg", "Weight kg", "ತೂಕ ಕೆಜಿ", "number", "weight in kg (net, if both gross and net are shown)"),
    F("rateInr", "Rate ₹/kg", "ದರ ₹/ಕೆಜಿ", "number", "rate per kg in rupees"),
    F("amountInr", "Amount ₹", "ಮೊತ್ತ ₹", "number", "total amount in rupees"),
  ],
  BILL: [
    F("billNo", "Bill / invoice no.", "ಬಿಲ್ ಸಂಖ್ಯೆ", "text", "bill or invoice number"),
    F("date", "Date", "ದಿನಾಂಕ", "date", "invoice date as YYYY-MM-DD"),
    F("party", "Seller / supplier", "ಮಾರಾಟಗಾರ", "text", "name of the business that issued the bill"),
    F("gstin", "Seller GSTIN", "GSTIN", "text", "the 15-character GSTIN of the seller (not the buyer)"),
    F("items", "Items", "ಐಟಂಗಳು", "text", "short list of items with quantities, e.g. 'Safflower seed 2500 kg'"),
    F("qtyKg", "Total qty kg", "ಒಟ್ಟು ಪ್ರಮಾಣ ಕೆಜಿ", "number", "total quantity in kg if the bill is for goods by weight"),
    F("taxableInr", "Taxable value ₹", "ತೆರಿಗೆಗೆ ಒಳಪಡುವ ಮೊತ್ತ ₹", "number", "value before GST"),
    F("gstInr", "GST ₹", "GST ₹", "number", "total GST (CGST+SGST or IGST) in rupees"),
    F("totalInr", "Bill total ₹", "ಬಿಲ್ ಒಟ್ಟು ₹", "number", "grand total payable in rupees"),
  ],
  RECEIPT: [
    F("receiptNo", "Receipt no.", "ರಸೀದಿ ಸಂಖ್ಯೆ", "text", "receipt / memo number"),
    F("date", "Date", "ದಿನಾಂಕ", "date", "date as YYYY-MM-DD"),
    F("party", "Paid to", "ಯಾರಿಗೆ ಪಾವತಿ", "text", "shop or person who issued the receipt"),
    F("purpose", "For what", "ಯಾವುದಕ್ಕೆ", "text", "what was paid for, e.g. diesel, transport, repair"),
    F("amountInr", "Amount ₹", "ಮೊತ್ತ ₹", "number", "total amount paid in rupees"),
  ],
};

export function buildScanPrompt(kind: ScanKind): string {
  const fields = SCAN_FIELDS[kind];
  const lines = fields.map((f) => `  "${f.key}": ${f.type === "number" ? "number or null" : "string or null"}  // ${f.hint}`);
  return [
    `You read photos of Indian business documents for an edible-oil mill in Bidar, Karnataka.`,
    `The photo is a ${PROOF_META[kind].en.toLowerCase()}. Text may be English, Kannada, Hindi or Marathi, printed or handwritten.`,
    `Return ONLY one JSON object, no markdown, with exactly these keys:`,
    `{`,
    ...lines,
    `  "confidence": "high" | "medium" | "low"  // how clearly you could read it`,
    `}`,
    `Rules: use null for anything you cannot read clearly — never guess a number.`,
    `Numbers are plain numbers without commas or currency symbols. Weights in kg (convert quintals ×100, tonnes ×1000).`,
    `Dates as YYYY-MM-DD (Indian slips are usually DD-MM-YYYY).`,
  ].join("\n");
}

export type ScanFields = Record<string, string | number | null>;

function toNumber(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string") return null;
  const s = v.replace(/[₹,\s]|rs\.?|kg/gi, "");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function toDate(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = /^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/.exec(s);
  if (m) {
    const y = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${y}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  }
  return null;
}

/** Clean up the AI's answer: right types, known keys only. */
export function normalizeScan(kind: ScanKind, raw: Record<string, unknown> | null | undefined): ScanFields {
  const out: ScanFields = {};
  for (const f of SCAN_FIELDS[kind]) {
    const v = raw?.[f.key];
    if (f.type === "number") out[f.key] = toNumber(v);
    else if (f.type === "date") out[f.key] = toDate(v);
    else out[f.key] = typeof v === "string" && v.trim() ? v.trim().slice(0, 200) : typeof v === "number" ? String(v) : null;
  }
  if (typeof out.vehicleNo === "string") out.vehicleNo = out.vehicleNo.replace(/[\s-]/g, "").toUpperCase();
  if (typeof out.gstin === "string") out.gstin = out.gstin.replace(/\s/g, "").toUpperCase();
  return out;
}

// GSTIN: 2-digit state code, 10-char PAN, entity digit, Z, checksum.
export const GSTIN_RE = /^[0-3][0-9][A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

/** GSTIN check-digit (standard base-36 mod algorithm). */
export function gstinChecksumOk(g: string): boolean {
  if (!GSTIN_RE.test(g)) return false;
  const chars = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const v = chars.indexOf(g[i]) * (i % 2 === 0 ? 1 : 2);
    sum += Math.floor(v / 36) + (v % 36);
  }
  const check = chars[(36 - (sum % 36)) % 36];
  return check === g[14];
}

/** Things the person should look at twice before saving. */
export function scanWarnings(kind: ScanKind, f: ScanFields): { key: string; en: string; kn: string }[] {
  const w: { key: string; en: string; kn: string }[] = [];
  if (kind === "WEIGHBRIDGE") {
    const g = f.grossKg as number | null;
    const t = f.tareKg as number | null;
    const n = f.netKg as number | null;
    if (g != null && t != null && n != null && Math.abs(g - t - n) > 1) {
      w.push({ key: "netKg", en: `Gross − tare = ${Math.round(g - t)} kg, but net says ${n} kg`, kn: `ಒಟ್ಟು − ಖಾಲಿ = ${Math.round(g - t)} ಕೆಜಿ, ನಿವ್ವಳ ${n} ಕೆಜಿ ಎಂದಿದೆ` });
    }
    if (g != null && t != null && t > g) w.push({ key: "tareKg", en: "Tare is more than gross", kn: "ಖಾಲಿ ತೂಕ ಒಟ್ಟಿಗಿಂತ ಹೆಚ್ಚು" });
  }
  if (kind === "WEIGHING") {
    const wt = f.weightKg as number | null;
    const r = f.rateInr as number | null;
    const a = f.amountInr as number | null;
    if (wt != null && r != null && a != null && Math.abs(wt * r - a) > Math.max(2, a * 0.01)) {
      w.push({ key: "amountInr", en: `kg × rate = ₹${Math.round(wt * r)}, but amount says ₹${a}`, kn: `ಕೆಜಿ × ದರ = ₹${Math.round(wt * r)}, ಮೊತ್ತ ₹${a}` });
    }
  }
  if (kind === "BILL") {
    const g = f.gstin as string | null;
    if (g && !gstinChecksumOk(g)) w.push({ key: "gstin", en: "GSTIN does not look valid — check each letter", kn: "GSTIN ಸರಿಯಿಲ್ಲದಂತಿದೆ — ಪರಿಶೀಲಿಸಿ" });
    const tx = f.taxableInr as number | null;
    const gst = f.gstInr as number | null;
    const tot = f.totalInr as number | null;
    if (tx != null && gst != null && tot != null && Math.abs(tx + gst - tot) > 2) {
      w.push({ key: "totalInr", en: `Taxable + GST = ₹${Math.round(tx + gst)}, but total says ₹${tot}`, kn: `ತೆರಿಗೆ ಮೊತ್ತ + GST = ₹${Math.round(tx + gst)}, ಒಟ್ಟು ₹${tot}` });
    }
  }
  return w;
}

/** Amount / party / qty / reference to carry into a register entry or file name. */
export function scanSummary(kind: ScanKind, f: ScanFields): { amountInr: number | null; party: string | null; qtyKg: number | null; ref: string | null } {
  const num = (k: string) => (typeof f[k] === "number" ? (f[k] as number) : null);
  const str = (k: string) => (typeof f[k] === "string" && f[k] ? (f[k] as string) : null);
  if (kind === "WEIGHBRIDGE") return { amountInr: num("chargesInr"), party: str("party"), qtyKg: num("netKg"), ref: str("slipNo") };
  if (kind === "WEIGHING") return { amountInr: num("amountInr"), party: str("party"), qtyKg: num("weightKg"), ref: str("slipNo") };
  if (kind === "BILL") return { amountInr: num("totalInr"), party: str("party"), qtyKg: num("qtyKg"), ref: str("billNo") };
  return { amountInr: num("amountInr"), party: str("party"), qtyKg: null, ref: str("receiptNo") };
}

/** The register form a scan most naturally becomes. */
export function scanEntryKind(kind: ScanKind): "PURCHASE" | "EXPENSE" {
  return kind === "RECEIPT" ? "EXPENSE" : "PURCHASE";
}

// ---------------------------------------------------------------------------
// Shop-wide rule: which money-out entries must carry a proof before saving
// (RegisterConfigData.proofRequired / proofMinInr — JSON, no migration).
// ---------------------------------------------------------------------------
export type ProofRuleKind = "PAYMENT" | "PURCHASE" | "EXPENSE";
export const PROOF_RULE_KINDS: ProofRuleKind[] = ["PAYMENT", "PURCHASE", "EXPENSE"];

/** True when this entry must carry a signature / photo before it can be saved. */
export function proofNeeded(required: ProofRuleKind[], kind: string, amountInr: number, minInr: number): boolean {
  return (required as string[]).includes(kind) && amountInr >= Math.max(0, minInr || 0);
}
