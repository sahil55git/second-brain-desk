// The Android app (mobile/): the same web pages inside a phone app, plus a few things only the
// phone can do — home-screen widgets, printing straight to a Bluetooth / USB printer, saving and
// sharing files, notifications, keeping the screen on. On a normal browser every call here is a
// harmless no-op, so pages can use them without asking where they run.
import { Capacitor, registerPlugin } from "@capacitor/core";

export interface NativePrinter {
  /** "nbt:<mac>" or "nusb:<device name>" */
  id: string;
  name: string;
  kind: "bluetooth" | "usb";
  /** Android says it is a printer (or it looks like one by name) */
  printer: boolean;
}

interface MahadevNativePlugin {
  info(): Promise<{ version: string; build: number; sdk: number; model: string; widgets: boolean }>;
  setDevice(o: { baseUrl: string; token: string; role: string; name: string }): Promise<void>;
  clearDevice(): Promise<void>;
  deviceStatus(): Promise<{ on: boolean; baseUrl?: string; name?: string; lastOk?: number; lastError?: string }>;
  refresh(): Promise<void>;
  setWidgetStyle(o: { style: string; opacity: number; textSize: string }): Promise<void>;
  setAlerts(o: { on: boolean }): Promise<void>;
  pinWidget(o: { kind: "summary" | "actions" | "barrels" }): Promise<{ ok: boolean }>;
  print(o: { name: string }): Promise<void>;
  saveFile(o: { name: string; base64: string; mime: string; share: boolean }): Promise<{ uri: string; where: string }>;
  shareText(o: { text: string; title?: string }): Promise<void>;
  keepAwake(o: { on: boolean }): Promise<void>;
  openUrl(o: { url: string }): Promise<void>;
}
interface MahadevPrinterPlugin {
  list(): Promise<{ printers: NativePrinter[]; bluetoothOn: boolean }>;
  write(o: { id: string; base64: string }): Promise<{ sent: number }>;
  close(): Promise<void>;
}
interface LocalNotificationsPlugin {
  requestPermissions(): Promise<{ display: string }>;
  checkPermissions(): Promise<{ display: string }>;
  schedule(o: { notifications: unknown[] }): Promise<unknown>;
  cancel(o: { notifications: { id: number }[] }): Promise<void>;
  getPending(): Promise<{ notifications: { id: number }[] }>;
  addListener(ev: string, f: (e: { notification: { extra?: { url?: string } } }) => void): Promise<{ remove: () => void }>;
}
interface AppPlugin {
  addListener(ev: string, f: (e: { url?: string }) => void): Promise<{ remove: () => void }>;
}

export const MahadevNative = registerPlugin<MahadevNativePlugin>("MahadevNative");
export const MahadevPrinter = registerPlugin<MahadevPrinterPlugin>("MahadevPrinter");
export const LocalNotifications = registerPlugin<LocalNotificationsPlugin>("LocalNotifications");
export const AppEvents = registerPlugin<AppPlugin>("App");

/** True inside the Android app. */
export function isNative(): boolean {
  try {
    return typeof window !== "undefined" && Capacitor.isNativePlatform() && Capacitor.isPluginAvailable("MahadevNative");
  } catch {
    return false;
  }
}

/** Uint8Array → base64 without blowing the stack on big labels. */
export function toBase64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + 0x8000)));
  return btoa(s);
}

export async function blobToBase64(b: Blob): Promise<string> {
  return toBase64(new Uint8Array(await b.arrayBuffer()));
}

/** Where the APK is published (GitHub release of this repository). */
export const APK_URL = "https://github.com/sahil55git/second-brain-desk/releases/download/android-latest/Mahadev-Desk.apk";
export const APK_PREVIEW_URL = "https://github.com/sahil55git/second-brain-desk/releases/download/android-preview/Mahadev-Desk.apk";

// Daily reminders scheduled on the phone (local notifications): fixed ids so they can be replaced.
export interface Reminder {
  id: number;
  key: string;
  title: string;
  body: string;
  url: string;
  hour: number;
  minute: number;
  /** 1 = Sunday … 7 = Saturday; empty = every day */
  weekday?: number;
}
export const REMINDERS: Reminder[] = [
  { id: 701, key: "cash", title: "💵 Cash tally", body: "Count the cash in the counter before closing. ನಗದು ಎಣಿಸಿ.", url: "/cash", hour: 20, minute: 30 },
  { id: 702, key: "barrels", title: "🛢️ Barrels", body: "Weigh the barrels that arrived today. ಬ್ಯಾರಲ್ ತೂಕ ಮಾಡಿ.", url: "/barrels?weigh=full", hour: 18, minute: 0 },
  { id: 703, key: "wages", title: "👷 Daily wages", body: "Enter today's daily wages. ದಿನಗೂಲಿ ಬರೆಯಿರಿ.", url: "/employees", hour: 19, minute: 0 },
  { id: 704, key: "stock", title: "📦 Stock count", body: "Weekly oil stock count. ಸ್ಟಾಕ್ ಎಣಿಕೆ.", url: "/stock", hour: 10, minute: 0, weekday: 1 },
];

/** "20:30" → {hour, minute}, or null. */
export function parseTime(v: string): { hour: number; minute: number } | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(v.trim());
  if (!m) return null;
  const hour = Number(m[1]), minute = Number(m[2]);
  return hour < 24 && minute < 60 ? { hour, minute } : null;
}

/** The local-notification object for a reminder (repeats daily, or weekly on its weekday). */
export function reminderNotification(r: Reminder, hour = r.hour, minute = r.minute) {
  return {
    id: r.id,
    title: r.title,
    body: r.body,
    extra: { url: r.url },
    schedule: { on: { hour, minute, ...(r.weekday ? { weekday: r.weekday } : {}) }, allowWhileIdle: true },
  };
}
