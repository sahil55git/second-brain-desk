// The shop's UPI payment set-up (setting key "shop"), shared by the counter, printed receipts, GST invoices,
// udhaar reminders and the printable QR card. Pure helpers, tested in lib/__tests__/shopPay.test.ts.
//
// Any UPI app (PhonePe, Google Pay, Paytm, BHIM, a bank's own app, Amazon Pay …) pays to a UPI ID through the same
// standard "upi://pay" link, so ONE QR works for every customer app. The shop can keep several UPI IDs (for
// example two bank accounts) and choose which one a bill shows. The older single field `upi` stays the default ID,
// so anything written before this page existed keeps working.

export const MAX_ACCOUNTS = 5;

export interface UpiAccount {
  id: string;
  /** what staff see: "Main", "SBI current", "Wife's PhonePe" */
  label: string;
  vpa: string;
}

export interface ShopPay {
  /** the name customers see on their UPI app's pay screen (as registered with the bank) */
  payee: string;
  /** default UPI ID: the first one in `accounts`, or the older single field */
  upi: string;
  accounts: UpiAccount[];
}

export const validVpa = (v: unknown): v is string => typeof v === "string" && /^[A-Za-z0-9._-]{2,}@[A-Za-z]{2,}$/.test(v.trim());

/**
 * Whatever the owner typed or pasted → a clean UPI ID candidate.
 * A pasted UPI link or the text read from a QR ("upi://pay?pa=shop@ybl&pn=…") gives its pa= part;
 * spaces and a trailing dot are dropped; the ID is lower-cased (UPI IDs are not case sensitive).
 */
export function cleanVpa(input: unknown): string {
  let s = typeof input === "string" ? input.trim() : "";
  if (!s) return "";
  if (/^upi:\/\//i.test(s)) {
    try {
      const pa = new URL(s.replace(/^upi:\/\//i, "https://x/")).searchParams.get("pa");
      if (pa) s = pa;
    } catch {
      /* not a link: treat as typed */
    }
  }
  return s.replace(/\s+/g, "").replace(/\.+$/, "").toLowerCase();
}

/** The payee name (pn=) in a pasted UPI link, if any. */
export function payeeFromLink(input: unknown): string {
  const s = typeof input === "string" ? input.trim() : "";
  if (!/^upi:\/\//i.test(s)) return "";
  try {
    return (new URL(s.replace(/^upi:\/\//i, "https://x/")).searchParams.get("pn") || "").trim().slice(0, 60);
  } catch {
    return "";
  }
}

/** What is wrong with a UPI ID, in plain words; null = fine. Empty is fine (nothing set). */
export function vpaProblem(v: unknown): string | null {
  const s = cleanVpa(v);
  if (!s) return null;
  if (!s.includes("@")) return "A UPI ID has an @ in it, like shopname@ybl.";
  if (!validVpa(s)) return "This does not look like a UPI ID (letters, numbers, . - _ then @ then the bank / app part).";
  return null;
}

const HANDLES: [RegExp, string][] = [
  [/^(ybl|ibl|axl)$/, "PhonePe"],
  [/^ok(icici|hdfcbank|sbi|axis)$/, "Google Pay"],
  [/^(paytm|pthdfc|ptyes|ptsbi|ptaxis)$/, "Paytm"],
  [/^(apl|yapl|rapl)$/, "Amazon Pay"],
  [/^upi$/, "BHIM"],
  [/^(ikwik|freecharge)$/, "MobiKwik / Freecharge"],
];
/** The app the handle after @ usually belongs to; "" when it is a bank's own handle (just a hint, never a block). */
export function appHint(vpa: string): string {
  const h = (cleanVpa(vpa).split("@")[1] || "").toLowerCase();
  return HANDLES.find(([re]) => re.test(h))?.[1] ?? "";
}

const lbl = (s: unknown, n = 30) => (typeof s === "string" ? s.replace(/\s+/g, " ").trim().slice(0, n) : "");

/** Saved data (new, old `{name, upi}` only, or broken) → a complete ShopPay. */
export function parseShopPay(raw: unknown): ShopPay {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const list: UpiAccount[] = [];
  const seen = new Set<string>();
  const add = (label: unknown, vpa: unknown, id?: unknown) => {
    const v = cleanVpa(vpa);
    if (!validVpa(v) || seen.has(v) || list.length >= MAX_ACCOUNTS) return;
    seen.add(v);
    list.push({ id: lbl(id, 20) || `u${list.length + 1}`, label: lbl(label) || (list.length ? `UPI ${list.length + 1}` : "Main"), vpa: v });
  };
  if (Array.isArray(o.accounts)) for (const a of o.accounts) if (a && typeof a === "object") add((a as Record<string, unknown>).label, (a as Record<string, unknown>).vpa, (a as Record<string, unknown>).id);
  // the older single field is the default when no list was saved yet (or it is not in the list)
  if (typeof o.upi === "string" && validVpa(cleanVpa(o.upi)) && !seen.has(cleanVpa(o.upi))) {
    const v = cleanVpa(o.upi);
    if (list.length < MAX_ACCOUNTS) list.unshift({ id: "u0", label: "Main", vpa: v });
    seen.add(v);
  }
  return { payee: lbl(o.upiName, 60), upi: list[0]?.vpa ?? "", accounts: list };
}

/** The data to save for key "shop": keeps every other field (shop name, location …) and keeps `upi` = default ID. */
export function mergeShopPay(existing: unknown, pay: { payee: string; accounts: { id?: string; label: string; vpa: string }[] }): Record<string, unknown> {
  const base = (existing && typeof existing === "object" ? { ...(existing as Record<string, unknown>) } : {}) as Record<string, unknown>;
  const clean = parseShopPay({ accounts: pay.accounts });
  base.accounts = clean.accounts;
  base.upi = clean.upi;
  base.upiName = lbl(pay.payee, 60);
  return base;
}

/** For the server: null = fine to save, else why not. */
export function shopProblem(data: unknown): string | null {
  const o = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;
  if (typeof o.upi === "string" && o.upi.trim() && !validVpa(o.upi.trim())) return "That UPI ID does not look right.";
  if (Array.isArray(o.accounts)) {
    if (o.accounts.length > MAX_ACCOUNTS) return `At most ${MAX_ACCOUNTS} UPI IDs.`;
    for (const a of o.accounts) {
      const v = a && typeof a === "object" ? (a as Record<string, unknown>).vpa : "";
      if (!validVpa(typeof v === "string" ? v.trim() : "")) return "One of the UPI IDs does not look right.";
    }
  }
  return null;
}

/** The account to use: the one asked for if it still exists, else the default. */
export function pickAccount(pay: ShopPay, id?: string | null): UpiAccount | null {
  return pay.accounts.find((a) => a.id === id) ?? pay.accounts[0] ?? null;
}

/**
 * The text a customer's UPI app reads from the QR. amount <= 0 gives a "static" QR with no amount
 * (the customer types it); with an amount the pay screen opens filled in.
 */
export function payLink(o: { vpa: string; payee: string; amount?: number; note?: string }): string {
  // built by hand, as bank QR codes are: the UPI ID stays readable (pa=shop@ybl) and spaces are %20, not "+",
  // so every UPI app shows the name and note properly
  const enc = (t: string) => encodeURIComponent(t).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  const parts = [`pa=${o.vpa.trim()}`, `pn=${enc((o.payee || "Shop").replace(/\s+/g, " ").trim().slice(0, 40))}`];
  if (o.amount && o.amount > 0) parts.push(`am=${(Math.round(o.amount * 100) / 100).toFixed(2)}`);
  parts.push("cu=INR");
  if (o.note) parts.push(`tn=${enc(o.note.replace(/\s+/g, " ").trim().slice(0, 50))}`);
  return `upi://pay?${parts.join("&")}`;
}
