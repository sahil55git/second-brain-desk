// Quick Register right-hand windows: which ones are shown, folded, and in what order.
// Saved per signed-in user on this device.
export const WIN_IDS = ["form", "work", "jobwork", "entries"] as const;
export type WinId = (typeof WIN_IDS)[number];
export const WIN_LABEL: Record<WinId, string> = { form: "Entry form", work: "Workspace", jobwork: "Job-work", entries: "Today's entries" };

export interface WinState { order: WinId[]; min: WinId[]; hid: WinId[] }
export const DEFAULT_WIN: WinState = { order: [...WIN_IDS], min: [], hid: [] };

const isId = (x: unknown): x is WinId => typeof x === "string" && (WIN_IDS as readonly string[]).includes(x);

/** Accepts whatever was saved: unknown ids are dropped, missing ones are added at the end. */
export function normalizeWin(raw: unknown): WinState {
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<Record<keyof WinState, unknown>>;
  const list = (v: unknown) => (Array.isArray(v) ? v.filter(isId) : []).filter((x, i, a) => a.indexOf(x) === i);
  const order = list(r.order);
  for (const id of WIN_IDS) if (!order.includes(id)) order.push(id);
  return { order, min: list(r.min), hid: list(r.hid) };
}

/** Moves a window one step up or down among the windows that are shown. */
export function moveWin(s: WinState, id: WinId, dir: -1 | 1): WinState {
  const shown = s.order.filter((x) => !s.hid.includes(x));
  const i = shown.indexOf(id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= shown.length) return s;
  const swap = shown[j];
  const order = s.order.slice();
  const a = order.indexOf(id), b = order.indexOf(swap);
  order[a] = swap;
  order[b] = id;
  return { ...s, order };
}

export const toggleMin = (s: WinState, id: WinId): WinState => ({ ...s, min: s.min.includes(id) ? s.min.filter((x) => x !== id) : [...s.min, id] });
export const hideWin = (s: WinState, id: WinId): WinState => ({ ...s, hid: s.hid.includes(id) ? s.hid : [...s.hid, id] });
/** Shows a window again and unfolds it. */
export const showWin = (s: WinState, id: WinId): WinState => ({ ...s, hid: s.hid.filter((x) => x !== id), min: s.min.filter((x) => x !== id) });
