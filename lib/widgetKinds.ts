// The Android app's home-screen widgets: which kinds there are (the same list as Widgets.KINDS in
// mobile/android/.../Widgets.java), what each shows, the quick-button choices and the sticky-note
// colours. Pure helpers, tested in lib/__tests__/widgetKinds.test.ts; the page is
// components/android/AndroidPage.tsx.
import { QUICK_LINKS, visibleLinks } from "@/lib/quickLinks";

export type WidgetKind = "dashboard" | "summary" | "actions" | "barrels" | "cash" | "udhaar" | "jobwork" | "stock" | "alerts" | "note" | "chat" | "tips" | "tasks";

export interface WidgetInfo {
  kind: WidgetKind;
  icon: string;
  name: string;
  /** what it shows, one line */
  what: string;
  /** home-screen cells, wide × tall */
  size: string;
  /** shows money: on a staff phone it only says "Owner only" */
  ownerOnly?: boolean;
  /** has buttons that do something right on the home screen */
  interactive?: boolean;
}

export const WIDGETS: WidgetInfo[] = [
  { kind: "dashboard", icon: "📊", name: "Dashboard", what: "Today / Week / Month switch, sales and change, cash, UPI, spent, udhaar, job-work, barrels, 7-day chart, first alert", size: "4×3", ownerOnly: true, interactive: true },
  { kind: "summary", icon: "📈", name: "Today", what: "Today's sales, cash, UPI, spent, udhaar, barrels (staff: barrels)", size: "4×2" },
  { kind: "actions", icon: "⚡", name: "Quick buttons", what: "Six buttons you choose below, each opens its form", size: "4×2", interactive: true },
  { kind: "barrels", icon: "🛢️", name: "Barrels", what: "To weigh full / waiting to empty, with Weigh buttons", size: "3×2", interactive: true },
  { kind: "cash", icon: "💵", name: "Cash", what: "Cash in − out today, UPI, whether the count matches", size: "3×1", ownerOnly: true },
  { kind: "udhaar", icon: "🙌", name: "Udhaar", what: "Total to collect and the five biggest customers", size: "3×2", ownerOnly: true },
  { kind: "jobwork", icon: "🌾", name: "Job-work", what: "Lots waiting, kg, overdue, the oldest five", size: "3×2", ownerOnly: true },
  { kind: "stock", icon: "📦", name: "Stock · days left", what: "Each oil's days left at the current pace (from the stock count)", size: "3×2", ownerOnly: true },
  { kind: "alerts", icon: "🔔", name: "Alerts", what: "What needs attention right now, or ✓ All good", size: "3×2" },
  { kind: "note", icon: "📌", name: "Sticky note", what: "Your own note for the shop, written below", size: "2×2" },
  { kind: "chat", icon: "💬", name: "Chat", what: "Type or 🎤 speak; Today / Udhaar / Tasks chips — answers and entries open in a small window", size: "4×2", interactive: true },
  { kind: "tips", icon: "✨", name: "Do next", what: "Smart tips: stock running out, old udhaar, barrels, cash count, tasks", size: "4×2" },
  { kind: "tasks", icon: "📋", name: "Tasks", what: "Your reminders from the chat, late ones marked", size: "3×2" },
];

export const NOTE_COLORS = [
  { id: "yellow", name: "Yellow", hex: "#fff3c4" },
  { id: "pink", name: "Pink", hex: "#ffd6de" },
  { id: "green", name: "Green", hex: "#d4f2d2" },
  { id: "blue", name: "Blue", hex: "#d3e6ff" },
  { id: "dark", name: "Dark", hex: "#1a150f" },
] as const;
export type NoteColor = (typeof NOTE_COLORS)[number]["id"];
export const NOTE_MAX = 400;

export interface WidgetAction { label: string; path: string }
export const MAX_ACTIONS = 6;
/** What the Quick buttons widget shows until you choose (same as Widgets.DEFAULT_ACTS). */
export const DEFAULT_ACTION_IDS = ["sale", "expense", "udhaar", "weighfull", "cash", "quickcard"];

/** The tiles you can put on the widget: every Quick link this person may open. */
export function actionChoices(isOwner: boolean) {
  return visibleLinks(isOwner).filter((l) => l.href.startsWith("/") && l.id !== "androidapp");
}

/** A widget button's text: icon on one line, a short name under it. */
export function actionLabel(icon: string, title: string): string {
  const short = title.replace(/\s*\(.*\)$/, "").replace(/^Barrels: /, "").trim();
  return `${icon}\n${short.length > 12 ? short.slice(0, 11).trimEnd() + "…" : short}`;
}

/** Quick link ids → the {label, path} list the phone keeps (unknown ids dropped, at most six, no repeats). */
export function actionsFor(ids: string[]): WidgetAction[] {
  const out: WidgetAction[] = [];
  const seen: Record<string, true> = {};
  for (const id of ids) {
    const l = QUICK_LINKS.find((x) => x.id === id);
    if (!l || seen[id] || !l.href.startsWith("/")) continue;
    seen[id] = true;
    out.push({ label: actionLabel(l.icon, l.title), path: l.href });
    if (out.length >= MAX_ACTIONS) break;
  }
  return out;
}

export function cleanNote(text: string): string {
  return text.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim().slice(0, NOTE_MAX);
}

export const REFRESH_CHOICES = [15, 30, 60] as const;
export const cleanMinutes = (m: unknown): 15 | 30 | 60 => (Number(m) <= 15 ? 15 : Number(m) >= 60 ? 60 : 30);
