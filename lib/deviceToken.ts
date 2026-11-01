// Phone widget keys and the widget summary. Pure helpers, tested in lib/__tests__/deviceToken.test.ts.
import { createHash, randomBytes } from "crypto";

export const TOKEN_PREFIX = "mdt_";
export const newDeviceToken = () => TOKEN_PREFIX + randomBytes(24).toString("base64url");
export const hashDeviceToken = (t: string) => createHash("sha256").update(t).digest("hex");
export const looksLikeToken = (t: unknown): t is string => typeof t === "string" && t.startsWith(TOKEN_PREFIX) && t.length >= 30 && t.length <= 80;

/** "Bearer mdt_..." → "mdt_..." */
export function bearer(h: string | null): string | null {
  const m = /^Bearer\s+(\S+)$/i.exec(h || "");
  return m && looksLikeToken(m[1]) ? m[1] : null;
}

export const cleanDeviceName = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim().replace(/\s+/g, " ").slice(0, 60) : "Android phone");

export interface WidgetAlert {
  /** stays the same while the alert is true, so the phone notifies once */
  id: string;
  title: string;
  text: string;
  /** page to open, on the app's own site */
  url: string;
}

export interface BarrelCounts {
  toWeighFull: number;
  waitingEmpty: number;
  /** full barrels waiting 7 days or more */
  waitingLong: number;
  oldestDays: number;
}

/** Barrel counts from the open lots: not weighed yet, weighed full and waiting to be emptied. */
export function barrelCounts(barrels: { grossKg: number | null; emptyKg: number | null; grossAt: Date | string | null }[], nowMs: number): BarrelCounts {
  let toWeighFull = 0, waitingEmpty = 0, waitingLong = 0, oldestDays = 0;
  for (const b of barrels) {
    if (b.grossKg == null) toWeighFull++;
    else if (b.emptyKg == null) {
      waitingEmpty++;
      const days = b.grossAt ? Math.floor((nowMs - new Date(b.grossAt).getTime()) / 86400000) : 0;
      if (days >= 7) waitingLong++;
      oldestDays = Math.max(oldestDays, days);
    }
  }
  return { toWeighFull, waitingEmpty, waitingLong, oldestDays };
}

export interface MoneyBits {
  today: string;
  cashCounted: boolean;
  lowStock: string[];
  jobWorkOverdue: number;
}

/** What is worth a notification right now. Ids carry the day so an alert repeats once a day at most. */
export function widgetAlerts(b: BarrelCounts, m: MoneyBits | null, hourIst: number, day: string): WidgetAlert[] {
  const out: WidgetAlert[] = [];
  if (b.waitingLong > 0) out.push({ id: `barrels-long-${day}-${b.waitingLong}`, title: "🛢️ Barrels waiting", text: `${b.waitingLong} full barrel(s) waiting 7+ days to be emptied (oldest ${b.oldestDays} days).`, url: "/barrels?weigh=empty" });
  if (m) {
    if (!m.cashCounted && hourIst >= 20) out.push({ id: `cash-${day}`, title: "💵 Cash not counted", text: "Today's cash tally is not done yet.", url: "/cash" });
    if (m.lowStock.length) out.push({ id: `stock-${day}-${m.lowStock.length}`, title: "📦 Low stock", text: `${m.lowStock.slice(0, 4).join(", ")}${m.lowStock.length > 4 ? ` +${m.lowStock.length - 4} more` : ""} running low.`, url: "/stock" });
    if (m.jobWorkOverdue > 0) out.push({ id: `jw-${day}-${m.jobWorkOverdue}`, title: "🌾 Job-work overdue", text: `${m.jobWorkOverdue} job-work lot(s) overdue.`, url: "/?desk=jobwork" });
  }
  return out;
}
