// Staff rules: one-tap deductions / extra pay with a reason ("late after 9:40 → −₹50",
// "oil not crushed for own sale → −₹50"), the shop-opening-time rule, and the voice parser for
// quick entries in the employee ledger. Pure functions — no database. Nothing here saves anything;
// the owner always confirms before a ledger line is written.
import { normalizeSpeech } from "./voice";

export interface StaffRule {
  id: string;
  label: string;
  kind: "CUT" | "BONUS";
  amountInr: number;
}

export interface StaffSettings {
  openTime: string; // "HH:MM", India time
  graceMin: number; // late only after openTime + grace
  lateCutInr: number; // automatic "late" deduction
  rules: StaffRule[];
}

export const DEFAULT_RULES: StaffRule[] = [
  { id: "oil-not-crushed", label: "Oil not crushed for own sale", kind: "CUT", amountInr: 50 },
  { id: "left-early", label: "Left shop without telling", kind: "CUT", amountInr: 100 },
  { id: "damage", label: "Damage / spill", kind: "CUT", amountInr: 100 },
  { id: "overtime", label: "Extra work / overtime", kind: "BONUS", amountInr: 100 },
  { id: "good-work", label: "Good work bonus", kind: "BONUS", amountInr: 200 },
];

export const DEFAULT_SETTINGS: StaffSettings = { openTime: "09:30", graceMin: 10, lateCutInr: 50, rules: DEFAULT_RULES };

export const MAX_RULES = 30;
export const MAX_RULE_INR = 100_000;
const isTime = (t: unknown): t is string => typeof t === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(t);
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "rule";

/** Whatever was saved (or typed) → settings that are always safe to use. */
export function cleanSettings(raw: unknown): StaffSettings {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const num = (v: unknown, d: number, max: number) => {
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 && n <= max ? Math.round(n * 100) / 100 : d;
  };
  const seen = new Set<string>();
  const rules: StaffRule[] = [];
  const src = Array.isArray(r.rules) ? r.rules : DEFAULT_RULES;
  for (const x of src.slice(0, MAX_RULES)) {
    const o = (x && typeof x === "object" ? x : {}) as Record<string, unknown>;
    const label = typeof o.label === "string" ? o.label.trim().slice(0, 60) : "";
    const amount = Number(o.amountInr);
    if (label.length < 2 || !Number.isFinite(amount) || amount <= 0 || amount > MAX_RULE_INR) continue;
    let id = typeof o.id === "string" && /^[a-z0-9-]{1,40}$/.test(o.id) ? o.id : slug(label);
    while (seen.has(id)) id = `${id.slice(0, 36)}-${seen.size}`;
    seen.add(id);
    rules.push({ id, label, kind: o.kind === "BONUS" ? "BONUS" : "CUT", amountInr: Math.round(amount * 100) / 100 });
  }
  return {
    openTime: isTime(r.openTime) ? r.openTime : DEFAULT_SETTINGS.openTime,
    graceMin: num(r.graceMin, DEFAULT_SETTINGS.graceMin, 180),
    lateCutInr: num(r.lateCutInr, DEFAULT_SETTINGS.lateCutInr, MAX_RULE_INR),
    rules,
  };
}

const IST_MIN = 330;
/** Minutes past the shop's opening time that someone arrived, 0 if on time (inside the grace). India time. */
export function minutesLate(inAtIso: string | null | undefined, openTime: string, graceMin: number): number {
  if (!inAtIso || !isTime(openTime)) return 0;
  const t = Date.parse(inAtIso);
  if (!Number.isFinite(t)) return 0;
  const d = new Date(t + IST_MIN * 60_000);
  const arrived = d.getUTCHours() * 60 + d.getUTCMinutes();
  const open = Number(openTime.slice(0, 2)) * 60 + Number(openTime.slice(3));
  return arrived > open + graceMin ? arrived - open : 0;
}

/** "9:52 AM" for a note, India time. */
export function clockText(inAtIso: string): string {
  const d = new Date(Date.parse(inAtIso) + IST_MIN * 60_000);
  const h = d.getUTCHours();
  return `${h % 12 === 0 ? 12 : h % 12}:${String(d.getUTCMinutes()).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

/** The marker the late entry carries, so the same day is never deducted twice. */
export const lateTag = (date: string) => `[late:${date}]`;

export interface LateSuggestion { employeeId: string; name: string; inAt: string; minutes: number; amountInr: number; note: string; done: boolean }

export function lateSuggestions(
  rows: { employeeId: string; inAt: string | null; status: string }[],
  names: Record<string, string>,
  settings: StaffSettings,
  date: string,
  already: Set<string>, // employeeIds that already have the late entry for this date
): LateSuggestion[] {
  const out: LateSuggestion[] = [];
  for (const a of rows) {
    if (a.status === "A" || !names[a.employeeId]) continue;
    const m = minutesLate(a.inAt, settings.openTime, settings.graceMin);
    if (m <= 0 || !a.inAt) continue;
    out.push({
      employeeId: a.employeeId,
      name: names[a.employeeId],
      inAt: a.inAt,
      minutes: m,
      amountInr: settings.lateCutInr,
      note: `Late ${clockText(a.inAt)} (${m} min after ${settings.openTime}) ${lateTag(date)}`,
      done: already.has(a.employeeId),
    });
  }
  return out.sort((x, y) => y.minutes - x.minutes);
}

// ---------------------------------------------------------------------------- voice / typed quick entry
export interface QuickParsed {
  employeeId: string | null;
  type: "CUT" | "BONUS" | "ADV" | "PAY";
  amountInr: number | null;
  mode: "CASH" | "UPI" | "BANK";
  note: string;
  ruleId: string | null;
  heard: string;
}

const words = (s: string) => s.toLowerCase().split(/[^a-z0-9ಀ-೿]+/).filter(Boolean);

/** Who: the one person whose name (any word of it, 3+ letters) is in the sentence; null if none or if two match. */
export function matchEmployee(text: string, emps: { id: string; name: string }[]): string | null {
  const heard = words(text);
  const scored = emps
    .map((e) => {
      const n = words(e.name).filter((w) => w.length >= 3);
      const hit = n.filter((w) => heard.some((h) => h === w || (h.length >= 3 && (w.startsWith(h) || h.startsWith(w))))).length;
      return { id: e.id, hit };
    })
    .filter((x) => x.hit > 0)
    .sort((a, b) => b.hit - a.hit);
  if (!scored.length) return null;
  if (scored.length > 1 && scored[0].hit === scored[1].hit) return null;
  return scored[0].id;
}

/** "ramesh late 50", "suresh bonus 200", "ganesh advance 500 upi", "ali oil not crushed" → a filled-in entry to confirm. */
export function parseQuickEntry(raw: string, emps: { id: string; name: string }[], settings: StaffSettings): QuickParsed {
  const s = normalizeSpeech(raw);
  const employeeId = matchEmployee(s, emps);
  const amountM = s.replace(/\brs\b/g, " ").match(/(\d+(?:\.\d+)?)/);
  let amount = amountM ? Number(amountM[1]) : null;
  if (amount !== null && (!(amount > 0) || amount > 10_000_000)) amount = null;
  const mode: QuickParsed["mode"] = /\bupi|gpay|phonepe|paytm\b/.test(s) ? "UPI" : /\bbank|neft|imps\b/.test(s) ? "BANK" : "CASH";

  // a saved reason named in the sentence wins: the rule with the most of its words in what was said
  const heard = new Set(words(s));
  let best: { r: StaffRule; hit: number } | null = null;
  for (const r of settings.rules) {
    const w = words(r.label).filter((x) => x.length >= 3);
    const hit = w.filter((x) => heard.has(x)).length;
    if (hit >= Math.min(2, w.length) && hit > (best?.hit ?? 0)) best = { r, hit };
  }
  if (best) {
    return { employeeId, type: best.r.kind, amountInr: amount ?? best.r.amountInr, mode, note: best.r.label, ruleId: best.r.id, heard: raw };
  }
  const late = /\blate|delay\b/.test(s);
  let type: QuickParsed["type"] = "CUT";
  if (/\badvance|adv|loan|udhaar|borrow/.test(s)) type = "ADV";
  else if (/\bpaid|pay|salary|gave|given\b/.test(s) && !/\bcut|fine|deduct/.test(s)) type = "PAY";
  else if (/\bbonus|overtime|extra|incentive|plus|add\b/.test(s)) type = "BONUS";
  const note = late ? "Late arrival" : type === "BONUS" ? "Bonus" : type === "ADV" ? "Advance" : type === "PAY" ? "Salary paid" : "Deduction";
  return { employeeId, type, amountInr: amount ?? (late ? settings.lateCutInr : null), mode, note, ruleId: null, heard: raw };
}

/** Search box for the staff list: name, role or phone. */
export function filterStaff<T extends { name: string; role: string; phone: string | null }>(list: T[], q: string): T[] {
  const t = q.trim().toLowerCase();
  if (!t) return list;
  return list.filter((e) => `${e.name} ${e.role} ${e.phone ?? ""}`.toLowerCase().includes(t));
}
