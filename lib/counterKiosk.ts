// Counter-only mode for one device (shop tablet / phone): the app opens straight into Weigh & Bill
// and every other page is closed, except the ones the owner ticks. Kept on the device; leaving the
// mode needs the PIN set when it was turned on. (Pure, tested.)
export const KIOSK_KEY = "counterKiosk";
export const COUNTER_PATH = "/register/counter";

export const KIOSK_EXTRAS = {
  register: { path: "/register", en: "Quick Register and POS", kn: "ಕ್ವಿಕ್ ರಿಜಿಸ್ಟರ್ ಮತ್ತು POS" },
  cash: { path: "/cash", en: "Cash desk", kn: "ನಗದು ಡೆಸ್ಕ್" },
  records: { path: "/records", en: "Records", kn: "ದಾಖಲೆಗಳು" },
  print: { path: "/print", en: "Printer setup", kn: "ಪ್ರಿಂಟರ್ ಸೆಟಪ್" },
  scales: { path: "/scales", en: "Live scales (scale set-up)", kn: "ಲೈವ್ ತಕ್ಕಡಿ (ಸೆಟಪ್)" },
} as const;
export type KioskExtra = keyof typeof KIOSK_EXTRAS;

export interface KioskState {
  on: boolean;
  /** SHA-256 of the PIN */
  pinHash: string;
  allow: KioskExtra[];
}

/** May this page open while counter-only mode is on? */
export function kioskAllows(state: KioskState | null, pathname: string, search: string): boolean {
  if (!state?.on) return true;
  if (pathname === COUNTER_PATH || pathname.startsWith(COUNTER_PATH + "/")) return true;
  if (pathname.startsWith("/login") || pathname.startsWith("/api/")) return true;
  for (const k of state.allow) {
    const x = KIOSK_EXTRAS[k];
    if (!x) continue;
    if (k === "scales") {
      if (pathname === "/scales" || pathname.startsWith("/scales/")) return true;
      if (pathname === "/" && new URLSearchParams(search).get("desk") === "scales") return true; // the older link
    } else if (pathname === x.path || pathname.startsWith(x.path + "/")) return true;
  }
  return false;
}

export async function hashPin(pin: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`mahadev-counter:${pin}`));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function readKiosk(): KioskState | null {
  try {
    const v = window.localStorage.getItem(KIOSK_KEY);
    const s = v ? (JSON.parse(v) as KioskState) : null;
    return s && typeof s.on === "boolean" ? { on: s.on, pinHash: String(s.pinHash || ""), allow: Array.isArray(s.allow) ? s.allow.filter((k) => k in KIOSK_EXTRAS) : [] } : null;
  } catch {
    return null;
  }
}
