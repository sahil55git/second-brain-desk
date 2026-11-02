// Staff attendance helpers (pure). Page: /attendance. Tested in lib/__tests__/attendance.test.ts.
export type AttStatus = "P" | "H" | "A";
export const STATUS_DAYS: Record<AttStatus, number> = { P: 1, H: 0.5, A: 0 };
export const STATUS_LABEL: Record<AttStatus, string> = { P: "Present", H: "Half day", A: "Absent" };
export const isStatus = (v: unknown): v is AttStatus => v === "P" || v === "H" || v === "A";
export const MAX_PHOTO_CHARS = 60_000;

/** Metres between two points (haversine). */
export function distanceM(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371000, rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
}

/** Days worked in a month from attendance rows (P = 1, H = ½). */
export function daysWorked(rows: { employeeId: string; date: string; status: string }[], month: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of rows) {
    if (!r.date.startsWith(month) || !isStatus(r.status)) continue;
    out[r.employeeId] = (out[r.employeeId] || 0) + STATUS_DAYS[r.status];
  }
  return out;
}

/** "9:12 am → 6:40 pm · 9 h 28 m" */
export function shiftText(inAt: string | null, outAt: string | null): string {
  const t = (iso: string) => new Date(iso).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });
  if (!inAt) return "";
  if (!outAt) return `in ${t(inAt)}`;
  const mins = Math.max(0, Math.round((Date.parse(outAt) - Date.parse(inAt)) / 60000));
  return `${t(inAt)} → ${t(outAt)} · ${Math.floor(mins / 60)} h ${mins % 60} m`;
}
