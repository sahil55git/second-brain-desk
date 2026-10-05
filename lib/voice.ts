// Voice commands for the Quick Register (English or Kannada). The browser's
// speech recogniser turns speech into text; this pure parser turns the text
// into "which form to open, pre-filled with what". Nothing is ever saved by
// voice alone — the form opens filled in and the person taps Save.
import type { Mode, RegisterKind } from "./register";

export type VoiceAction =
  | { type: "entry"; kind: RegisterKind; item?: string; qty?: number; unit?: string; rate?: number; amount?: number; mode?: Mode; party?: string }
  | { type: "open"; target: "count" | "calc" | "reports" | "stock" | "jw" | "fresh" }
  | { type: "unknown"; text: string };

const KN_DIGITS = "೦೧೨೩೪೫೬೭೮೯";
const WORD_NUM: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, fifteen: 15, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90,
  ಒಂದು: 1, ಎರಡು: 2, ಮೂರು: 3, ನಾಲ್ಕು: 4, ಐದು: 5, ಆರು: 6, ಏಳು: 7, ಎಂಟು: 8, ಒಂಬತ್ತು: 9, ಹತ್ತು: 10, ಇಪ್ಪತ್ತು: 20, ಐವತ್ತು: 50,
};

export function normalizeSpeech(raw: string): string {
  let s = raw.toLowerCase();
  s = s.replace(/[೦-೯]/g, (d) => String(KN_DIGITS.indexOf(d)));
  s = s.replace(/₹|rs\.?|rupees?|ರೂಪಾಯಿ|ರೂ/g, " rs ");
  s = s.replace(/(\d),(\d)/g, "$1$2");
  // "five hundred" / "2 thousand" style
  s = s.replace(/\b(\d+|[a-z\u0C80-\u0CFF]+)\s+(hundred|ನೂರು)\b/g, (_, n) => String((Number(n) || WORD_NUM[n] || 1) * 100));
  s = s.replace(/\b(\d+|[a-z\u0C80-\u0CFF]+)\s+(thousand|ಸಾವಿರ)\b/g, (_, n) => String((Number(n) || WORD_NUM[n] || 1) * 1000));
  s = s
    .split(/\s+/)
    .map((w) => (WORD_NUM[w] !== undefined ? String(WORD_NUM[w]) : w))
    .join(" ");
  return s.replace(/\s+/g, " ").trim();
}

const KINDS: [RegisterKind, RegExp][] = [
  ["FRESH_CRUSH", /fresh\s*crush|ಹೊಸ\s*ಗಾಣ/],
  ["UDHAAR_IN", /udhaar\s*(received|came|back|collected)|ಉದ್ರಿ\s*ವಸೂಲಿ|ವಸೂಲಿ/],
  ["PIGMEE", /pigmee|pigmy|pygmy|ಪಿಗ್ಮಿ/],
  ["OWNER_DRAW", /sahil\s*(took|taken)|owner|ಸಾಹಿಲ್/],
  ["PURCHASE", /purchase|bought|buy|ಖರೀದಿ/],
  ["PAYMENT", /salary|payment|paid to|ಸಂಬಳ|ಪಾವತಿ/],
  ["EXPENSE", /expense|spent|kharcha|kharch|ಖರ್ಚು/],
  ["SALE", /sale|sold|sell|ಮಾರಾಟ|ಮಾರಿದ/],
];
const ITEMS: Partial<Record<RegisterKind, [string, RegExp][]>> = {
  SALE: [["sunflower", /sunflower|ಸೂರ್ಯಕಾಂತಿ/], ["karadi", /karadi|safflower|kardi|ಕರಡಿ|ಕುಸುಬೆ/], ["groundnut", /groundnut|ground nut|peanut|ಶೇಂಗಾ|ಕಡಲೆಕಾಯಿ/], ["ekatva", /ekatva|ekta|ಏಕತ್ವ/], ["cake", /cake|khali|ಹಿಂಡಿ/]],
  FRESH_CRUSH: [["groundnut", /groundnut|ground nut|peanut|ಶೇಂಗಾ/], ["karadi", /karadi|safflower|ಕರಡಿ/], ["sunflower", /sunflower|ಸೂರ್ಯಕಾಂತಿ/], ["mustard", /mustard|ಸಾಸಿವೆ/]],
  PURCHASE: [["seed", /seed|ಬೀಜ/], ["tins", /tin|can|ಡಬ್ಬ/], ["labels", /label|packing|ಲೇಬಲ್/], ["oil", /oil|ಎಣ್ಣೆ/]],
  EXPENSE: [["diesel", /diesel|ಡೀಸೆಲ್/], ["tea", /tea|food|chai|ಚಹಾ|ಊಟ/], ["power", /electric|current|power|light bill|ವಿದ್ಯುತ್/], ["transport", /transport|auto|tempo|ಸಾಗಣೆ/], ["repair", /repair|ರಿಪೇರಿ/]],
  PAYMENT: [["salary", /salary|ಸಂಬಳ/], ["supplier", /supplier|ಸರಬರಾಜು/]],
};

export function parseVoice(raw: string): VoiceAction {
  const s = normalizeSpeech(raw);
  if (!s) return { type: "unknown", text: raw };
  if (/\b(count|tally)\b.*\bcash\b|ನಗದು\s*ಎಣಿಕೆ|cash count/.test(s)) return { type: "open", target: "count" };
  if (/stock|ಸ್ಟಾಕ್/.test(s)) return { type: "open", target: "stock" };
  if (/calculator|calc|ಕ್ಯಾಲ್ಕುಲೇಟರ್/.test(s)) return { type: "open", target: "calc" };
  if (/report|ವರದಿ/.test(s)) return { type: "open", target: "reports" };
  if (/job\s*work|intake|ಕೆಲಸದ/.test(s)) return { type: "open", target: "jw" };

  const kindHit = KINDS.find(([, re]) => re.test(s));
  if (!kindHit) return { type: "unknown", text: raw };
  const kind = kindHit[0];
  const a: Extract<VoiceAction, { type: "entry" }> = { type: "entry", kind };
  const item = (ITEMS[kind] || []).find(([, re]) => re.test(s));
  if (item) a.item = item[0];
  // unit + quantity: "10 kg", "5 litre", "50 bags", "20 pieces"
  const q = s.match(/(\d+(?:\.\d+)?)\s*(kg|kilo|kgs|ಕೆಜಿ|litre|liter|ltr|l\b|ಲೀಟರ್|bags?|ಚೀಲ|pieces?|pcs|tins?|box(?:es)?)/);
  if (q) {
    a.qty = Number(q[1]);
    const u = q[2];
    a.unit = /kg|kilo|ಕೆಜಿ/.test(u) ? "kg" : /l|ಲೀಟರ್/.test(u) && !/bag/.test(u) ? "ltr" : /bag|ಚೀಲ/.test(u) ? "bags" : /box/.test(u) ? "box" : "pcs";
  }
  // rate: "at 250", "rate 250", "250 per kg"
  const r = s.match(/(?:at|rate|@|ದರ)\s*(?:rs\s*)?(\d+(?:\.\d+)?)/) || s.match(/(\d+(?:\.\d+)?)\s*(?:rs\s*)?(?:per|each|\/)/);
  if (r) a.rate = Number(r[1]);
  // amount: "rs 500", "500 rupees", "amount 500", or the last number left over
  const am = s.match(/(?:rs|amount|total|ಮೊತ್ತ)\s*(\d+(?:\.\d+)?)/) || s.match(/(\d+(?:\.\d+)?)\s*rs/);
  if (am) a.amount = Number(am[1]);
  else {
    const nums = (s.match(/\d+(?:\.\d+)?/g) || []).map(Number);
    const used = new Set([a.qty, a.rate].filter((x) => x !== undefined));
    const left = nums.filter((n) => !used.has(n));
    if (left.length && !(a.qty && a.rate)) a.amount = left[left.length - 1];
  }
  if (a.qty && a.rate && !a.amount) a.amount = Math.round(a.qty * a.rate * 100) / 100;
  if (/upi|phone\s*pe|phonepe|gpay|google pay|paytm/.test(s)) a.mode = "UPI";
  else if (/udhaar|credit|ಉದ್ರಿ/.test(s) && kind !== "UDHAAR_IN") a.mode = "CREDIT";
  else if (/cash|ನಗದು/.test(s)) a.mode = "CASH";
  const party = s.match(/(?:to|from|name|customer|ಗೆ)\s+([a-z\u0C80-\u0CFF]{3,}(?:\s+[a-z\u0C80-\u0CFF]{3,})?)/);
  if (party && !/^(rs|kg|cash|upi)/.test(party[1])) a.party = party[1].replace(/\b\w/g, (c) => c.toUpperCase());
  return a;
}
