// Quick launcher — the round button, the hidden side panel and the pop windows.
// Pure helpers only (no React): default items, cleaning saved settings, and
// working out what an item opens. Saved per device in localStorage.

export type LKind = "Function" | "App" | "Link";
export type Gesture = "peek" | "menu" | "edit" | "pop" | "full" | "none";
export type GestureKey = "hover" | "right" | "long" | "triple";

export type LItem = {
  id: string;
  label: string;
  kind: LKind;
  /** Function: a Quick Register key (sale, estimate…). App: a path (/stock). Link: a web address. */
  target: string;
  icon: string;
  fab: boolean;
  panel: boolean;
};

export type LauncherPrefs = {
  items: LItem[];
  fabSide: "left" | "right";
  panelSide: "left" | "right";
  openMode: "pop" | "tab";
  gest: Record<GestureKey, Gesture>;
};

export const LAUNCHER_KEY = "sbd_launcher_v1";
export const MAX_ITEMS = 40;

export const ICON_CHOICES = ["rupee", "bill", "cash", "box", "user", "factory", "chart", "link", "leaf", "star", "calc", "barrel", "truck", "note", "phone", "globe"] as const;

/** Quick Register functions that can be pinned (the keys ?open= understands). */
export const FUNCTION_CHOICES: { key: string; label: string; icon: string }[] = [
  { key: "sale", label: "New sale", icon: "rupee" },
  { key: "estimate", label: "Estimate", icon: "calc" },
  { key: "expense", label: "Add expense", icon: "bill" },
  { key: "cash", label: "Count cash", icon: "cash" },
  { key: "purchase", label: "Purchase", icon: "truck" },
  { key: "udhaar", label: "Udhaar received", icon: "user" },
  { key: "payment", label: "Payment", icon: "bill" },
  { key: "jobwork", label: "Job-work", icon: "factory" },
  { key: "crush", label: "Self crushing", icon: "leaf" },
  { key: "stock", label: "Stock count", icon: "box" },
  { key: "scan", label: "Scan bill", icon: "note" },
  { key: "smart", label: "Smart entry", icon: "star" },
];

const fn = (id: string, key: string, fab: boolean, panel = true): LItem => {
  const f = FUNCTION_CHOICES.find((x) => x.key === key)!;
  return { id, label: f.label, kind: "Function", target: key, icon: f.icon, fab, panel };
};

export const DEFAULT_ITEMS: LItem[] = [
  fn("d-sale", "sale", true),
  fn("d-estimate", "estimate", true),
  fn("d-expense", "expense", true),
  fn("d-cash", "cash", false),
  { id: "d-mfg", label: "Manufacturing", kind: "App", target: "/mfg", icon: "factory", fab: true, panel: true },
  { id: "d-stock", label: "Stock", kind: "App", target: "/stock", icon: "box", fab: true, panel: true },
  { id: "d-parties", label: "Parties", kind: "App", target: "/?desk=parties", icon: "user", fab: false, panel: true },
  { id: "d-reports", label: "Reports", kind: "App", target: "/reports", icon: "chart", fab: false, panel: true },
  { id: "d-vyapar", label: "Vyapar", kind: "Link", target: "https://vyaparapp.in", icon: "link", fab: false, panel: true },
  { id: "d-gst", label: "GST portal", kind: "Link", target: "https://www.gst.gov.in", icon: "link", fab: false, panel: true },
  { id: "d-mandi", label: "Mandi prices", kind: "Link", target: "https://agmarknet.gov.in", icon: "leaf", fab: false, panel: true },
];

export const DEFAULT_GESTURES: Record<GestureKey, Gesture> = { hover: "peek", right: "menu", long: "peek", triple: "full" };

export const DEFAULT_PREFS: LauncherPrefs = {
  items: DEFAULT_ITEMS,
  fabSide: "right",
  panelSide: "right",
  openMode: "pop",
  gest: DEFAULT_GESTURES,
};

const GESTURES: Gesture[] = ["peek", "menu", "edit", "pop", "full", "none"];
const KINDS: LKind[] = ["Function", "App", "Link"];

/** Make a web address safe to open: https only, no scripts. Returns "" if unusable. */
export function cleanLink(raw: string): string {
  const t = (raw || "").trim();
  if (!t) return "";
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(t) ? t : `https://${t}`;
  try {
    const u = new URL(withScheme);
    if (u.protocol !== "https:" && u.protocol !== "http:") return "";
    if (!u.hostname.includes(".")) return "";
    return u.toString();
  } catch {
    return "";
  }
}

/** Only in-app paths are allowed for App items ("/stock", "/?desk=parties"). */
export function cleanPath(raw: string): string {
  const t = (raw || "").trim();
  if (!t) return "";
  const p = t.startsWith("/") ? t : `/${t}`;
  if (p.startsWith("//") || /[\s\\]/.test(p)) return "";
  return p;
}

export function cleanTarget(kind: LKind, raw: string): string {
  if (kind === "Link") return cleanLink(raw);
  if (kind === "App") return cleanPath(raw);
  const key = (raw || "").trim().toLowerCase();
  return FUNCTION_CHOICES.some((f) => f.key === key) ? key : "";
}

function cleanItem(raw: unknown): LItem | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const kind = KINDS.includes(r.kind as LKind) ? (r.kind as LKind) : null;
  const label = typeof r.label === "string" ? r.label.trim().slice(0, 30) : "";
  const id = typeof r.id === "string" && r.id ? r.id.slice(0, 40) : "";
  if (!kind || !label || !id) return null;
  const target = cleanTarget(kind, typeof r.target === "string" ? r.target : "");
  if (!target) return null;
  const icon = typeof r.icon === "string" && (ICON_CHOICES as readonly string[]).includes(r.icon) ? r.icon : kind === "Link" ? "link" : "star";
  return { id, label, kind, target, icon, fab: r.fab !== false, panel: r.panel !== false };
}

/** Clean whatever was saved (or nothing) into valid settings. */
export function normalizePrefs(raw: unknown): LauncherPrefs {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_PREFS, items: DEFAULT_ITEMS.map((i) => ({ ...i })), gest: { ...DEFAULT_GESTURES } };
  const r = raw as Record<string, unknown>;
  let items: LItem[] = [];
  if (Array.isArray(r.items)) {
    const seen = new Set<string>();
    for (const x of r.items) {
      const it = cleanItem(x);
      if (it && !seen.has(it.id)) {
        seen.add(it.id);
        items.push(it);
      }
      if (items.length >= MAX_ITEMS) break;
    }
  } else items = DEFAULT_ITEMS.map((i) => ({ ...i }));
  const g = (r.gest && typeof r.gest === "object" ? r.gest : {}) as Record<string, unknown>;
  const gest = { ...DEFAULT_GESTURES };
  (Object.keys(gest) as GestureKey[]).forEach((k) => {
    const v = g[k] as Gesture;
    // Hover can only show the small window or do nothing.
    if (GESTURES.includes(v) && (k !== "hover" || v === "peek" || v === "none")) gest[k] = v;
  });
  return {
    items,
    fabSide: r.fabSide === "left" ? "left" : "right",
    panelSide: r.panelSide === "left" ? "left" : "right",
    openMode: r.openMode === "tab" ? "tab" : "pop",
    gest,
  };
}

export type Opening = { mode: "embed" | "external"; url: string };

function withEmbed(path: string): string {
  const [base, hash = ""] = path.split("#");
  const sep = base.includes("?") ? "&" : "?";
  return `${base}${sep}embed=1${hash ? `#${hash}` : ""}`;
}

/** What opening an item does. embed = inside a pop window; external = a new tab. */
export function resolveOpening(item: Pick<LItem, "kind" | "target">, openMode: "pop" | "tab"): Opening {
  if (item.kind === "Function") {
    const url = withEmbed(`/register?open=${encodeURIComponent(item.target)}`);
    return { mode: openMode === "tab" ? "external" : "embed", url: openMode === "tab" ? `/register?open=${encodeURIComponent(item.target)}` : url };
  }
  if (item.kind === "App") {
    return openMode === "tab" ? { mode: "external", url: item.target } : { mode: "embed", url: withEmbed(item.target) };
  }
  // Web links are other people's sites; many refuse to sit inside a window, so the
  // pop window offers "Open in new tab" and "tab" mode skips the window entirely.
  return { mode: openMode === "tab" ? "external" : "embed", url: item.target };
}

export function addItem(prefs: LauncherPrefs, input: { kind: LKind; label: string; target: string; icon?: string }, id: string): { prefs: LauncherPrefs; error?: string } {
  const label = input.label.trim().slice(0, 30);
  if (!label) return { prefs, error: "Give it a name" };
  const target = cleanTarget(input.kind, input.target);
  if (!target) return { prefs, error: input.kind === "Link" ? "That web address doesn't look right" : input.kind === "App" ? "Use a page like /stock" : "Pick a function from the list" };
  if (prefs.items.length >= MAX_ITEMS) return { prefs, error: `Up to ${MAX_ITEMS} items` };
  const icon = input.icon && (ICON_CHOICES as readonly string[]).includes(input.icon) ? input.icon : input.kind === "Link" ? "link" : "star";
  return { prefs: { ...prefs, items: [...prefs.items, { id, label, kind: input.kind, target, icon, fab: true, panel: true }] } };
}

export function updateItem(prefs: LauncherPrefs, id: string, patch: Partial<Pick<LItem, "fab" | "panel" | "label">>): LauncherPrefs {
  return { ...prefs, items: prefs.items.map((i) => (i.id === id ? { ...i, ...patch, label: (patch.label ?? i.label).slice(0, 30) || i.label } : i)) };
}

export function removeItem(prefs: LauncherPrefs, id: string): LauncherPrefs {
  return { ...prefs, items: prefs.items.filter((i) => i.id !== id) };
}

export function moveItem(prefs: LauncherPrefs, id: string, dir: -1 | 1): LauncherPrefs {
  const i = prefs.items.findIndex((x) => x.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= prefs.items.length) return prefs;
  const items = prefs.items.slice();
  [items[i], items[j]] = [items[j], items[i]];
  return { ...prefs, items };
}

/** Pages a pop window may show: this site only (plus web links the user added). */
export function isEmbeddable(url: string): boolean {
  return url.startsWith("/") && !url.startsWith("//");
}
