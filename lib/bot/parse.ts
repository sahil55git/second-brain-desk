// The chat bot's command language (in-app chat box, Telegram, Discord, later WhatsApp).
// Pure: text in, a command out. lib/bot/engine.ts runs it. Tested in lib/__tests__/botParse.test.ts.
//
//   today · week · month · cash · udhaar · udhaar ramesh · stock · barrels · jobwork · alerts
//   sale 500 upi suresh · sale 15kg groundnut @180 cash · sale 900 udhaar ramesh
//   expense 200 diesel · got 1000 ramesh (udhaar received) · purchase 5000 seed bank · paid 3000 salary raju
//   report today pdf · sales week excel · udhaar pdf · stock pdf
//   link 123456 · help
import { CATALOG, type Mode, type RegisterKind } from "@/lib/register";
import { taskWords } from "@/lib/tasks";

export type Span = "today" | "yesterday" | "week" | "month" | "lastMonth";
export type ReportWhat = "day" | "sales" | "expenses" | "udhaar" | "stock" | "cash" | "jobwork" | "purchase";
export type ReportFormat = "pdf" | "excel" | "text";

export interface EntryCmd {
  t: "entry";
  kind: RegisterKind;
  amount: number;
  mode: Mode;
  party: string | null;
  item: string | null;
  itemLabel: string | null;
  qty: number | null;
  unit: string | null;
  rate: number | null;
  note: string | null;
}

export type Cmd =
  | { t: "help"; topic?: string }
  | { t: "start" }
  | { t: "summary"; span: "today" | "yesterday" | "week" | "month" }
  | { t: "cash" }
  | { t: "udhaar"; name: string | null }
  | { t: "remind"; name: string }
  | { t: "stock" }
  | { t: "barrels" }
  | { t: "jobwork" }
  | { t: "alerts" }
  | { t: "review" }
  | { t: "watch" }
  | { t: "report"; what: ReportWhat; span: Span; format: ReportFormat }
  | EntryCmd
  | { t: "link"; code: string }
  | { t: "unlink" }
  | { t: "whoami" }
  | { t: "open"; path: string; label: string }
  | { t: "task"; words: string }
  | { t: "tasks" }
  | { t: "fill"; kind: RegisterKind; text: string; why: string }
  | { t: "bad"; why: string }
  | { t: "unknown"; text: string };

const words = (s: string) => s.split(/\s+/).filter(Boolean);

/** "₹1,500" "1.5k" "500/-" "rs500" → 1500 / 500; anything else → null. */
export function money(tok: string): number | null {
  const t = tok.toLowerCase().replace(/^(₹|rs\.?|inr)/, "").replace(/\/-$/, "").replace(/,/g, "");
  const m = /^(\d+(?:\.\d+)?)(k|l|lakh)?$/.exec(t);
  if (!m) return null;
  const n = Number(m[1]) * (m[2] === "k" ? 1000 : m[2] ? 100000 : 1);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
}

const UNIT: Record<string, string> = {
  kg: "kg", kgs: "kg", kilo: "kg", kilos: "kg",
  l: "ltr", lt: "ltr", ltr: "ltr", ltrs: "ltr", litre: "ltr", litres: "ltr", liter: "ltr", liters: "ltr",
  bag: "bags", bags: "bags", pc: "pcs", pcs: "pcs", tin: "pcs", tins: "pcs", nos: "pcs", box: "box", boxes: "box",
};

const MODE: Record<string, Mode | "CREDIT"> = {
  cash: "CASH", nagadu: "CASH",
  upi: "UPI", gpay: "UPI", phonepe: "UPI", paytm: "UPI", online: "UPI", bank: "UPI", neft: "UPI", imps: "UPI", rtgs: "UPI",
  udhaar: "CREDIT", udhar: "CREDIT", udhari: "CREDIT", credit: "CREDIT", baki: "CREDIT", baaki: "CREDIT",
};

// first word(s) → entry kind
const KIND_WORDS: [string[], RegisterKind][] = [
  [["got", "received", "recd", "jama", "collected", "collect", "udhaarin", "udharin"], "UDHAAR_IN"],
  [["sale", "sold", "sell", "becha", "bikri", "maarata", "marata"], "SALE"],
  [["expense", "exp", "spent", "spend", "kharcha", "kharch"], "EXPENSE"],
  [["purchase", "purchased", "bought", "buy", "kharidi", "kharid"], "PURCHASE"],
  [["paid", "payment", "pay", "salary"], "PAYMENT"],
];

/** Catalogue item for this kind named somewhere in the words (also "sunflower oil" → sunflower). */
function findItem(kind: RegisterKind, ws: string[]): { key: string; label: string; idx: number } | null {
  const list = CATALOG[kind] || [];
  for (let i = 0; i < ws.length; i++) {
    const w = ws[i].toLowerCase();
    const hit = list.find((c) => c.key === w || c.en.toLowerCase().split(/[\s/()]+/).includes(w) || c.kn === ws[i]);
    if (hit) return { key: hit.key, label: hit.en, idx: i };
  }
  return null;
}

const titleCase = (s: string) => s.replace(/(^|\s)([a-z])/g, (_m, a: string, c: string) => a + c.toUpperCase());
const NOISE = new Set(["to", "from", "for", "by", "of", "rs", "rupees", "in", "on", "the", "a", "oil", "-", "@", "x", "at", "rate"]);

export function parseEntry(kind: RegisterKind, rest: string[]): EntryCmd | { t: "bad"; why: string } {
  let amount: number | null = null;
  let rate: number | null = null;
  let qty: number | null = null;
  let unit: string | null = null;
  let mode: Mode | "CREDIT" | null = null;
  const left: string[] = [];
  for (let i = 0; i < rest.length; i++) {
    const raw = rest[i];
    const w = raw.toLowerCase();
    // "@180", "@ 180", "x180", "rate 180"
    const atRate = /^(@|x|rate)(\d.*)?$/.exec(w);
    if (atRate && (atRate[2] ? money(atRate[2]) : money(rest[i + 1] || ""))) {
      rate = atRate[2] ? money(atRate[2]) : money(rest[++i]);
      continue;
    }
    // "15kg", "15 kg", "2 tins"
    const q = /^(\d+(?:\.\d+)?)([a-z]+)$/.exec(w);
    if (q && UNIT[q[2]]) {
      qty = Number(q[1]);
      unit = UNIT[q[2]];
      continue;
    }
    const n = money(raw);
    if (n !== null && UNIT[(rest[i + 1] || "").toLowerCase()]) {
      qty = n;
      unit = UNIT[rest[++i].toLowerCase()];
      continue;
    }
    if (n !== null && amount === null) {
      amount = n;
      continue;
    }
    if (MODE[w]) {
      mode = MODE[w];
      continue;
    }
    if (!NOISE.has(w)) left.push(raw);
  }
  if (amount === null && qty && rate) amount = Math.round(qty * rate * 100) / 100;
  if (amount === null) return { t: "bad", why: "How much? Put the amount in, e.g. sale 500 upi suresh" };
  if (amount > 10_000_000) return { t: "bad", why: "That amount is too big for one entry." };

  // what is left: an item from the list, the rest is the person (or the note for an expense)
  const it = findItem(kind, left);
  if (it) left.splice(it.idx, 1);
  const restText = left.join(" ").trim();
  let party: string | null = null;
  let item = it?.key ?? null;
  let itemLabel: string | null = null;
  const note: string | null = null;
  if (kind === "EXPENSE") {
    if (!item && restText) {
      item = "other";
      itemLabel = titleCase(restText).slice(0, 80);
    }
  } else if (kind === "PURCHASE" && !item && left.length > 1) {
    // "purchase 5000 seed ganesh traders": first word what, the rest who
    party = titleCase(left.slice(1).join(" "));
    item = "other";
    itemLabel = titleCase(left[0]);
  } else {
    party = restText ? titleCase(restText).slice(0, 120) : null;
  }

  const creditOk = kind === "SALE" || kind === "PURCHASE";
  const finalMode: Mode = mode === "CREDIT" ? (creditOk ? "CREDIT" : "CASH") : mode ?? "CASH";
  if (finalMode === "CREDIT" && !party) return { t: "bad", why: "Whose udhaar? Add the name, e.g. sale 900 udhaar ramesh" };
  if (kind === "UDHAAR_IN" && !party) return { t: "bad", why: "Who paid? Add the name, e.g. got 1000 ramesh" };
  return { t: "entry", kind, amount, mode: finalMode, party, item, itemLabel, qty, unit: qty ? unit || "kg" : null, rate, note };
}

function spanOf(ws: string[]): Span | null {
  for (const w of ws) {
    if (w === "today" || w === "aaj" || w === "ivattu") return "today";
    if (w === "yesterday" || w === "kal" || w === "ninne") return "yesterday";
    if (w === "week" || w === "7d" || w === "weekly") return "week";
    if (w === "month" || w === "monthly" || w === "mahina") return "month";
    if (w === "lastmonth") return "lastMonth";
  }
  return null;
}
function formatOf(ws: string[]): ReportFormat | null {
  if (ws.some((w) => w === "pdf")) return "pdf";
  if (ws.some((w) => w === "excel" || w === "xlsx" || w === "xls" || w === "sheet")) return "excel";
  return null;
}
const REPORT_WORDS: Record<string, ReportWhat> = {
  report: "day", daybook: "day", day: "day", summary: "day",
  sales: "sales", sale: "sales", expenses: "expenses", expense: "expenses",
  udhaar: "udhaar", udhar: "udhaar", credit: "udhaar", stock: "stock", cash: "cash",
  jobwork: "jobwork", purchases: "purchase", purchase: "purchase",
};

// Pages and windows the chat can open (in the app it goes there; in Telegram / Discord it sends the link).
export const OPEN_TARGETS: { re: RegExp; path: string; label: string }[] = [
  { re: /(weigh|weight)\s*(the\s*)?empty|empty\s*(barrel|weigh)/, path: "/barrels?weigh=empty", label: "Weigh empty barrels" },
  { re: /barrel\s*(receiv|weigh)|weigh\s*(full|barrel)|receiv\w*\s*barrel|full\s*barrel/, path: "/barrels?weigh=full", label: "Barrel receiving · weigh full" },
  { re: /simple\s*barrel|barrel\s*simple/, path: "/barrels?simple=1", label: "Barrels · simple mode" },
  { re: /our\s*barrels|barrel\s*fleet|fleet/, path: "/barrels/fleet", label: "Our barrels" },
  { re: /barrel/, path: "/barrels", label: "Barrels" },
  { re: /edit\s*(the\s*)?(last|latest|previous)|last\s*entry|undo\s*(last|entry)|fix\s*(last|entry)/, path: "/register?edit=last", label: "Edit the last entry" },
  { re: /count\s*cash|cash\s*(count|tally)|tally\s*cash/, path: "/register?open=cash", label: "Count cash" },
  { re: /stock\s*(count|tally)|count\s*stock|tank\s*dip/, path: "/register?open=stock", label: "Stock count" },
  { re: /calc/, path: "/register?open=calc", label: "Calculator" },
  { re: /estimate|quotation/, path: "/register?open=estimate", label: "Estimate" },
  { re: /scan|slip|photo\s*bill/, path: "/register?open=scan", label: "Scan a slip / bill" },
  { re: /fresh\s*crush|crush/, path: "/register?open=crush", label: "Fresh crush sale" },
  { re: /(new|add)\s*(job\s*work|intake)|intake/, path: "/register?open=jobwork", label: "New job-work intake" },
  { re: /settle|job\s*work\s*pay/, path: "/register?open=jwsettle", label: "Job-work settle" },
  { re: /(new|add|open)\s*sale|sale\s*form/, path: "/register?open=sale", label: "New sale" },
  { re: /(new|add|open)\s*purchase|purchase\s*form/, path: "/register?open=purchase", label: "New purchase" },
  { re: /(new|add|open)\s*expense|expense\s*form/, path: "/register?open=expense", label: "New expense" },
  { re: /(udhaar|udhar)\s*(in|form|received)/, path: "/register?open=udhaar", label: "Udhaar received" },
  { re: /purchases?\s*(tab|desk|list|page)|purchase\s*bills/, path: "/?desk=purchase", label: "Purchase desk" },
  { re: /sales?\s*(tab|desk|list|page|bills)/, path: "/?desk=sales", label: "Sales desk" },
  { re: /ledger|day\s*book|khata/, path: "/?desk=ledger", label: "Ledger" },
  { re: /part(y|ies)|customers|suppliers/, path: "/?desk=parties", label: "Parties" },
  { re: /wage|employee|salary\s*(sheet|ledger)|staff\s*ledger/, path: "/employees", label: "Employee ledger" },
  { re: /label|print/, path: "/print", label: "Print centre" },
  { re: /report/, path: "/reports", label: "Reports" },
  { re: /cash/, path: "/cash", label: "Cash tally" },
  { re: /stock/, path: "/stock", label: "Stock" },
  { re: /register|quick\s*register/, path: "/register", label: "Quick Register" },
  { re: /manufactur|mfg|batch/, path: "/mfg", label: "Manufacturing" },
  { re: /setting|appearance|theme/, path: "/appearance", label: "Appearance" },
  { re: /widget|android|app\b/, path: "/app", label: "Android app settings" },
  { re: /quick\s*card/, path: "/quick", label: "Quick card" },
  { re: /home|dashboard|desk/, path: "/", label: "Home" },
];

/** "open barrel receiving" / "go to ledger" / "show purchase tab" → that page. */
export function openTarget(text: string): { path: string; label: string } | null {
  const t = text.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
  const hit = OPEN_TARGETS.find((o) => o.re.test(t));
  return hit ? { path: hit.path, label: hit.label } : null;
}

// Words people put in front of a question: "check stocks today", "show me udhaar of ramesh", "what is cash"
const FILLER = /^(please |pls |can you |could you |check |show( me)? |tell( me)? |give( me)? |get( me)? |what( i|')?s |what are |how much( is)? |my |the |today'?s )+/;
const PLURAL: Record<string, string> = { stocks: "stock", alert: "alerts", barrel: "barrels", jobs: "jobwork", reports: "report", udhaars: "udhaar", sales: "sales" };

export function parseCommand(input: string): Cmd {
  // Telegram sends "/today@MahadevBot"; people type "Udhaar  Ramesh?"
  let text = input.trim().replace(/^\//, "").replace(/^(\w+)@\w+/, "$1").replace(/[?!.,]+$/, "").replace(/\s*,(\s+|$)/g, " ").trim();
  // tasks and reminders: "remind me friday to pay digwal", "todo order tins", "tasks"
  const tw = taskWords(text);
  if (tw) return { t: "task", words: tw };
  if (/^(my\s+)?(tasks|todos?|to-?dos|reminders|todo list)$/i.test(text)) return { t: "tasks" };
  // opening a page / window: "open barrel receiving", "go to ledger", "start stock count"
  const opener = /^(open|go to|goto|take me to|show page|launch|start|edit)\b\s*/i.exec(text);
  if (opener) {
    const target = openTarget(text);
    if (target) return { t: "open", ...target };
  }
  text = text.replace(FILLER, "").trim() || text;
  text = text.split(/\s+/).map((w, i) => (i === 0 && PLURAL[w.toLowerCase()] ? PLURAL[w.toLowerCase()] : w)).join(" ");
  if (!text) return { t: "help" };
  const ws = words(text);
  const lw = ws.map((w) => w.toLowerCase());
  const head = lw[0].replace(/[-_]/g, "");
  const two = lw.slice(0, 2).join(" ");

  if (head === "start") return { t: "start" };
  if (head === "help" || head === "menu" || head === "commands" || head === "?") return { t: "help", topic: lw[1] };
  if (head === "link") return /^\d{6}$/.test(lw[1] || "") ? { t: "link", code: lw[1] } : { t: "bad", why: "Send link and the 6-digit code from the app, e.g. link 123456" };
  if (head === "unlink" || head === "logout") return { t: "unlink" };
  if (head === "whoami" || head === "me") return { t: "whoami" };

  // files: anything with pdf / excel in it
  const format = formatOf(lw);
  if (format) {
    const what = lw.map((w) => REPORT_WORDS[w]).find(Boolean) ?? "day";
    return { t: "report", what, span: spanOf(lw) ?? "today", format };
  }

  // entries
  const entry = (kind: RegisterKind, rest: string[]): Cmd => {
    const e = parseEntry(kind, rest);
    // amount or name missing: open the form filled with what was said, to finish there
    if (e.t === "bad") return { t: "fill", kind, text, why: e.why };
    return e;
  };
  if (two === "udhaar in" || two === "udhar in") return entry("UDHAAR_IN", ws.slice(2));
  for (const [ks, kind] of KIND_WORDS) if (ks.includes(head)) {
    // "sales week" is a question, "sale 500" is an entry
    if (kind === "SALE" && !ws.slice(1).some((w) => money(w) !== null || /^\d/.test(w))) break;
    if (kind === "EXPENSE" && !ws.slice(1).some((w) => money(w) !== null || /^\d/.test(w))) break;
    return entry(kind, ws.slice(1));
  }

  // questions
  const span = spanOf(lw);
  if (["today", "aaj", "week", "month", "yesterday", "summary", "sales", "sale", "hisab", "hisaab", "report"].includes(head)) {
    return { t: "summary", span: span === "lastMonth" ? "month" : span ?? "today" };
  }
  if (head === "cash" || head === "counter" || head === "galla") return { t: "cash" };
  if (head === "udhaar" || head === "udhar" || head === "udhari" || head === "credit" || head === "baki") {
    if (money(ws[1] || "") !== null) return { t: "bad", why: "Money received: got 500 ramesh. Credit sale: sale 500 udhaar ramesh." };
    const name = ws.slice(1).filter((w) => !["top", "list", "all", "of", "for"].includes(w.toLowerCase())).join(" ").trim();
    return { t: "udhaar", name: name || null };
  }
  if (head === "remind" || head === "reminder") {
    const name = ws.slice(1).join(" ").trim();
    return name ? { t: "remind", name } : { t: "bad", why: "Whom to remind? e.g. remind ramesh" };
  }
  if (head === "stock" || head === "maal") return { t: "stock" };
  if (head === "barrels" || head === "barrel" || head === "drums") return { t: "barrels" };
  if (head === "jobwork" || two === "job work" || head === "jw") return { t: "jobwork" };
  if (head === "alerts" || head === "alert" || head === "attention" || head === "problems") return { t: "alerts" };
  if (head === "review" || two === "weekly review" || two === "week review" || head === "weekly") return { t: "review" };
  if (head === "watch" || head === "unusual" || head === "suspicious" || head === "anomalies") return { t: "watch" };
  if (head === "expenses" || head === "expense" || head === "kharcha") return { t: "report", what: "expenses", span: span ?? "today", format: "text" };
  // "barrel receiving", "ledger", "count cash" … said without "open"
  const target = openTarget(text);
  if (target && text.split(/\s+/).length <= 4) return { t: "open", ...target };
  return { t: "unknown", text };
}

export const HELP_TEXT = [
  "**Ask**",
  "today · yesterday · week · month",
  "cash · stock · barrels · jobwork · alerts",
  "review (this week, with what to do) · watch (anything unusual)",
  "udhaar · udhaar ramesh · remind ramesh",
  "",
  "**Enter** (you get ✅ Save / ❌ Cancel first)",
  "sale 500 upi suresh",
  "sale 15kg groundnut @180 cash",
  "sale 900 udhaar ramesh",
  "got 1000 ramesh  (udhaar received)",
  "expense 200 diesel",
  "purchase 5000 seed bank",
  "paid 3000 salary raju",
  "",
  "**Open** (goes there in the app, sends the link in Telegram)",
  "open barrel receiving · open ledger · count cash",
  "new purchase · edit last entry · open wages",
  "",
  "**Tasks**",
  "remind me friday to pay digwal · todo order tins · tasks",
  "",
  "**Files**",
  "report today pdf · sales week excel",
  "udhaar pdf · stock pdf · expenses month pdf",
].join("\n");
