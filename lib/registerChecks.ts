// Quick Register — live checks under an entry form, in plain English + Kannada.
//
// Exact rules, no AI. They only POINT THINGS OUT; nothing here blocks or changes a
// save (the person may really have sold the same thing twice). Pure functions, no
// React / Prisma, so they are unit-tested on their own.
import { normName } from "./smartEntry";
import { KIND_SIDE, type Mode, type RegisterKind } from "./register";

export type RegLevel = "info" | "warn" | "alert";
export interface RegCheck {
  level: RegLevel;
  en: string;
  kn: string;
}

export interface RegDraft {
  kind: RegisterKind;
  item: string | null;
  qty: number | null;
  unit: string | null;
  rate: number | null;
  amount: number;
  /** True when the amount was typed by hand (not worked out from qty × rate). */
  amountTyped: boolean;
  mode: Mode | "OWNER_PHONEPE";
  party: string;
  date: string;
}

export interface RegHistoryEntry {
  date?: string;
  kind: RegisterKind;
  item: string | null;
  qty: number | null;
  unit: string | null;
  rateInr: number | null;
  amountInr: number;
  partyName: string | null;
  createdAt: string | number | Date;
}

export interface RegCheckCtx {
  /** Entries already saved (today's, and optionally recent days). */
  entries: RegHistoryEntry[];
  /** Remembered rate for this kind + item (Settings → rates). */
  savedRate?: number | null;
  /** Cash that should be in the counter right now. */
  cashNow?: number | null;
  today: string;
  nowMs: number;
}

export const REG_LIMITS = {
  /** Amount vs qty × rate: allowed gap (₹ or %, whichever is larger). */
  mismatchInr: 1,
  mismatchPct: 1,
  /** A rate this far from the usual one is pointed out; × this much is "a zero slipped". */
  ratePct: 20,
  rateSlipTimes: 5,
  /** Same entry saved within this many minutes → "double tap?". */
  dupMinutes: 10,
  /** Amount this many times the usual for the kind. */
  bigTimesMedian: 5,
  /** Without history, an amount at or above this is double-checked. */
  bigAbsoluteInr: 100_000,
  /** Quantity (kg / ltr) this large is double-checked. */
  bigQty: 5000,
};

const r2 = (n: number) => Math.round(n * 100) / 100;
const rs = (n: number) => "₹" + r2(n).toLocaleString("en-IN");

function median(nums: number[]): number | null {
  if (!nums.length) return null;
  const s = [...nums].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

const ORDER: Record<RegLevel, number> = { alert: 0, warn: 1, info: 2 };

export function registerChecks(d: RegDraft, ctx: RegCheckCtx): RegCheck[] {
  const out: RegCheck[] = [];
  const amt = Number(d.amount) || 0;
  const hasQty = d.kind === "SALE" || d.kind === "PURCHASE";
  const itemKey = d.item || null;

  // 1. Date: future, or not today.
  if (d.date) {
    if (d.date > ctx.today) out.push({ level: "alert", en: `Date ${d.date} is in the future.`, kn: `ದಿನಾಂಕ ${d.date} ಭವಿಷ್ಯದ್ದು.` });
    else if (d.date < ctx.today)
      out.push({ level: "info", en: `You are entering for ${d.date}, not today.`, kn: `ಇದು ${d.date} ದಿನದ ದಾಖಲೆ, ಇಂದಿನದು ಅಲ್ಲ.` });
  }

  // 2. Amount typed by hand vs qty × rate (a slipped zero is the classic mistake).
  const q = Number(d.qty) || 0;
  const rt = Number(d.rate) || 0;
  if (hasQty && q > 0 && rt > 0 && amt > 0 && d.amountTyped) {
    const expected = r2(q * rt);
    const gap = Math.abs(amt - expected);
    if (gap > Math.max(REG_LIMITS.mismatchInr, (expected * REG_LIMITS.mismatchPct) / 100)) {
      const slip = amt > 0 && expected > 0 && [10, 0.1, 100, 0.01].some((f) => Math.abs(amt / expected - f) < 0.001);
      out.push({
        level: slip ? "alert" : "warn",
        en: `Amount ${rs(amt)} but quantity × rate = ${rs(expected)}${slip ? " — a zero extra or missing?" : "."}`,
        kn: `ಮೊತ್ತ ${rs(amt)}, ಆದರೆ ಪ್ರಮಾಣ × ದರ = ${rs(expected)}${slip ? " — ಸೊನ್ನೆ ಹೆಚ್ಚು ಅಥವಾ ಕಡಿಮೆ?" : "."}`,
      });
    }
  }

  // 3. Rate vs the usual for this item (recent same-item entries, else the remembered rate).
  if (hasQty && rt > 0) {
    const same = ctx.entries
      .filter((e) => e.kind === d.kind && (e.item || null) === itemKey && (e.unit || null) === (d.unit || null) && (Number(e.rateInr) || 0) > 0)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 5)
      .map((e) => Number(e.rateInr));
    const usual = median(same) ?? (ctx.savedRate && ctx.savedRate > 0 ? ctx.savedRate : null);
    if (usual && usual > 0) {
      const times = rt / usual;
      const off = Math.abs(times - 1) * 100;
      if (times >= REG_LIMITS.rateSlipTimes || times <= 1 / REG_LIMITS.rateSlipTimes) {
        out.push({
          level: "alert",
          en: `Rate ${rs(rt)} is very different from the usual ${rs(usual)} — a zero extra or missing?`,
          kn: `ದರ ${rs(rt)} ಸಾಮಾನ್ಯ ${rs(usual)} ಕ್ಕಿಂತ ತುಂಬಾ ಬೇರೆ — ಸೊನ್ನೆ ಹೆಚ್ಚು ಅಥವಾ ಕಡಿಮೆ?`,
        });
      } else if (off > REG_LIMITS.ratePct) {
        out.push({
          level: "warn",
          en: `Rate ${rs(rt)} is ${Math.round(off)}% ${times > 1 ? "above" : "below"} the usual ${rs(usual)}.`,
          kn: `ದರ ${rs(rt)} ಸಾಮಾನ್ಯ ${rs(usual)} ಕ್ಕಿಂತ ${Math.round(off)}% ${times > 1 ? "ಹೆಚ್ಚು" : "ಕಡಿಮೆ"}.`,
        });
      }
    }
  }

  // 4. Same entry already saved (double tap, or entered twice).
  if (amt > 0) {
    const party = normName(d.party);
    const dups = ctx.entries.filter(
      (e) => e.kind === d.kind && (e.item || null) === itemKey && Math.abs(Number(e.amountInr) - amt) < 0.5 && normName(e.partyName) === party
    );
    if (dups.length) {
      const newest = Math.max(...dups.map((e) => new Date(e.createdAt).getTime()));
      const mins = Math.max(0, Math.round((ctx.nowMs - newest) / 60_000));
      if (mins <= REG_LIMITS.dupMinutes)
        out.push({
          level: "alert",
          en: `The same entry (${rs(amt)}) was saved ${mins === 0 ? "a moment" : mins + " min"} ago — saving twice?`,
          kn: `ಇದೇ ದಾಖಲೆ (${rs(amt)}) ${mins === 0 ? "ಈಗಷ್ಟೇ" : mins + " ನಿಮಿಷದ ಹಿಂದೆ"} ಉಳಿಸಲಾಗಿದೆ — ಎರಡು ಬಾರಿ ಉಳಿಸುತ್ತಿದ್ದೀರಾ?`,
        });
      else if (party)
        out.push({
          level: "warn",
          en: `${d.party.trim()} ${rs(amt)} is already entered today.`,
          kn: `${d.party.trim()} ${rs(amt)} ಇಂದು ಈಗಾಗಲೇ ದಾಖಲಾಗಿದೆ.`,
        });
    }
  }

  // 5. Udhaar needs a name.
  const onCredit = d.mode === "CREDIT" && (d.kind === "SALE" || d.kind === "PURCHASE");
  if ((onCredit || d.kind === "UDHAAR_IN") && !d.party.trim())
    out.push({
      level: "alert",
      en: d.kind === "UDHAAR_IN" ? "Whose udhaar was received? Enter the name." : "Udhaar needs the customer / supplier name.",
      kn: d.kind === "UDHAAR_IN" ? "ಯಾರ ಉದ್ರಿ ವಸೂಲಿ? ಹೆಸರು ಬರೆಯಿರಿ." : "ಉದ್ರಿಗೆ ಗ್ರಾಹಕ / ಪೂರೈಕೆದಾರರ ಹೆಸರು ಬೇಕು.",
    });

  // 6. Much bigger than usual for this kind.
  if (amt > 0) {
    const same = ctx.entries.filter((e) => e.kind === d.kind).map((e) => Number(e.amountInr)).filter((n) => n > 0);
    const usual = same.length >= 3 ? median(same) : null;
    if (usual && amt > usual * REG_LIMITS.bigTimesMedian)
      out.push({
        level: "warn",
        en: `${rs(amt)} is ${r2(amt / usual)}× the usual ${d.kind === "SALE" ? "sale" : "amount"} (${rs(usual)}) — check the zeros.`,
        kn: `${rs(amt)} ಸಾಮಾನ್ಯ ಮೊತ್ತ (${rs(usual)}) ಕ್ಕಿಂತ ${r2(amt / usual)} ಪಟ್ಟು — ಸೊನ್ನೆಗಳನ್ನು ನೋಡಿ.`,
      });
    else if (!usual && amt >= REG_LIMITS.bigAbsoluteInr)
      out.push({ level: "warn", en: `${rs(amt)} is a large amount — check the zeros.`, kn: `${rs(amt)} ದೊಡ್ಡ ಮೊತ್ತ — ಸೊನ್ನೆಗಳನ್ನು ನೋಡಿ.` });
  }

  // 7. Very large quantity.
  if (hasQty && q >= REG_LIMITS.bigQty && (d.unit === "kg" || d.unit === "ltr"))
    out.push({ level: "warn", en: `${q} ${d.unit} is a very large quantity — check it.`, kn: `${q} ${d.unit === "kg" ? "ಕೆಜಿ" : "ಲೀಟರ್"} ತುಂಬಾ ಹೆಚ್ಚು ಪ್ರಮಾಣ — ಪರಿಶೀಲಿಸಿ.` });

  // 8. Cash going out is more than the counter should hold.
  const cashOut = KIND_SIDE[d.kind] !== "in" && (d.kind === "PIGMEE" || d.kind === "OWNER_DRAW" || d.mode === "CASH");
  if (cashOut && amt > 0 && ctx.cashNow != null && ctx.cashNow >= 0 && amt > ctx.cashNow)
    out.push({
      level: "warn",
      en: `The counter should have only ${rs(ctx.cashNow)} — this cash payment is more.`,
      kn: `ಕೌಂಟರಿನಲ್ಲಿ ${rs(ctx.cashNow)} ಮಾತ್ರ ಇರಬೇಕು — ಈ ನಗದು ಪಾವತಿ ಅದಕ್ಕಿಂತ ಹೆಚ್ಚು.`,
    });

  return out.sort((a, b) => ORDER[a.level] - ORDER[b.level]);
}

/** Save button wording: a real alert changes "Save" to "Save anyway" (it never blocks). */
export const hasAlert = (checks: RegCheck[]) => checks.some((c) => c.level === "alert");
