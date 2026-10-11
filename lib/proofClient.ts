// Browser-only helpers for proofs & scans: shrink photos, stamp them, find
// the location, keep a copy on this phone / PC, and send them to the server.

import { PROOF_META, ROOT_FOLDER, fileNameFor, folderPath, phoneFileName, type ProofKind } from "@/lib/proofs";

export interface Captured {
  kind: ProofKind;
  dataUrl: string;
  capturedAt: string; // ISO — when the picture was taken
  geo?: { lat: number; lng: number; acc?: number } | null;
}

const MAX_SIDE = 1600;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not open the picture"));
    img.src = src;
  });
}

function fileToDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error("Could not read the picture"));
    r.readAsDataURL(file);
  });
}

/**
 * Shrink a camera photo to at most 1600 px and JPEG, optionally adding a
 * white strip under it with the stamp text (date, time, amount, name) so the
 * printed proof explains itself. The photo itself is never drawn over.
 */
export async function preparePhoto(file: Blob, stamp?: string[]): Promise<string> {
  let source: CanvasImageSource;
  let w: number;
  let h: number;
  try {
    // Respects the phone's rotation (EXIF) on current browsers.
    const bmp = await createImageBitmap(file, { imageOrientation: "from-image" } as ImageBitmapOptions);
    source = bmp;
    w = bmp.width;
    h = bmp.height;
  } catch {
    const img = await loadImage(await fileToDataUrl(file));
    source = img;
    w = img.naturalWidth;
    h = img.naturalHeight;
  }
  const scale = Math.min(1, MAX_SIDE / Math.max(w, h));
  const cw = Math.max(1, Math.round(w * scale));
  const ch = Math.max(1, Math.round(h * scale));
  const lines = (stamp || []).filter(Boolean);
  const font = Math.max(14, Math.round(cw / 42));
  const strip = lines.length ? Math.round(lines.length * font * 1.35 + font * 0.8) : 0;
  const c = document.createElement("canvas");
  c.width = cw;
  c.height = ch + strip;
  const g = c.getContext("2d");
  if (!g) throw new Error("This browser cannot prepare pictures");
  g.fillStyle = "#ffffff";
  g.fillRect(0, 0, c.width, c.height);
  g.drawImage(source, 0, 0, cw, ch);
  if (lines.length) drawStamp(g, lines, cw, ch, font);
  let q = 0.82;
  let out = c.toDataURL("image/jpeg", q);
  while (out.length > 2_600_000 && q > 0.45) {
    q -= 0.12;
    out = c.toDataURL("image/jpeg", q);
  }
  return out;
}

function drawStamp(g: CanvasRenderingContext2D, lines: string[], width: number, top: number, font: number) {
  g.fillStyle = "#111111";
  g.font = `${font}px "Noto Sans Kannada", system-ui, sans-serif`;
  g.textBaseline = "top";
  lines.forEach((l, i) => g.fillText(l, Math.round(font * 0.6), Math.round(top + font * 0.4 + i * font * 1.35), width - font));
}

/** Signature canvas → PNG on white, with the stamp under it. */
export function signatureToDataUrl(canvas: HTMLCanvasElement, stamp: string[]): string {
  const font = Math.max(14, Math.round(canvas.width / 36));
  const strip = Math.round(stamp.length * font * 1.35 + font * 0.8);
  const c = document.createElement("canvas");
  c.width = canvas.width;
  c.height = canvas.height + strip;
  const g = c.getContext("2d")!;
  g.fillStyle = "#ffffff";
  g.fillRect(0, 0, c.width, c.height);
  g.drawImage(canvas, 0, 0);
  g.fillStyle = "#e5e5e5";
  g.fillRect(0, canvas.height, c.width, 2);
  drawStamp(g, stamp, c.width, canvas.height, font);
  return c.toDataURL("image/png");
}

/** Text printed under a payment proof. */
export function stampLines(opts: { title: string; kind: ProofKind; amountInr?: number | null; party?: string | null; by?: string | null; at?: Date }): string[] {
  const at = opts.at || new Date();
  const when = at.toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" });
  const money = opts.amountInr && opts.amountInr > 0 ? `₹${Math.round(opts.amountInr).toLocaleString("en-IN")}` : "";
  return [
    `${opts.title} · ${PROOF_META[opts.kind].en} · ${when}`,
    [money && `Paid ${money}`, opts.party && `to ${opts.party}`, opts.by && `by ${opts.by}`].filter(Boolean).join(" "),
  ].filter(Boolean);
}

/** Best-effort location (only if the phone allows it); never blocks saving. */
export function getGeo(timeoutMs = 4000): Promise<Captured["geo"]> {
  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return resolve(null);
    const t = window.setTimeout(() => resolve(null), timeoutMs + 500);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        window.clearTimeout(t);
        resolve({ lat: +p.coords.latitude.toFixed(6), lng: +p.coords.longitude.toFixed(6), acc: Math.round(p.coords.accuracy) });
      },
      () => {
        window.clearTimeout(t);
        resolve(null);
      },
      { enableHighAccuracy: false, timeout: timeoutMs, maximumAge: 5 * 60 * 1000 }
    );
  });
}

// ---------------------------------------------------------------------------
// Copy on this phone / PC
// ---------------------------------------------------------------------------
const COPY_KEY = "proof-phone-copy";
const GEO_KEY = "proof-geo";

export function phoneCopyOn(): boolean {
  try {
    return localStorage.getItem(COPY_KEY) === "on";
  } catch {
    return false;
  }
}
export function setPhoneCopy(on: boolean) {
  try {
    localStorage.setItem(COPY_KEY, on ? "on" : "off");
  } catch {
    /* ignore */
  }
}
export function geoOn(): boolean {
  try {
    return localStorage.getItem(GEO_KEY) !== "off";
  } catch {
    return true;
  }
}
export function setGeoOn(on: boolean) {
  try {
    localStorage.setItem(GEO_KEY, on ? "on" : "off");
  } catch {
    /* ignore */
  }
}

/** Chrome / Edge on a computer can write into real sub-folders; phones download instead. */
export function canPickFolder(): boolean {
  return typeof window !== "undefined" && "showDirectoryPicker" in window;
}

type DirHandle = {
  name: string;
  getDirectoryHandle: (n: string, o?: { create?: boolean }) => Promise<DirHandle>;
  getFileHandle: (n: string, o?: { create?: boolean }) => Promise<{ createWritable: () => Promise<{ write: (b: Blob) => Promise<void>; close: () => Promise<void> }> }>;
  queryPermission?: (o: { mode: "readwrite" }) => Promise<PermissionState>;
  requestPermission?: (o: { mode: "readwrite" }) => Promise<PermissionState>;
};

function idb<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T | undefined> {
  return new Promise((resolve) => {
    try {
      const open = indexedDB.open("sbd-proofs", 1);
      open.onupgradeneeded = () => open.result.createObjectStore("kv");
      open.onerror = () => resolve(undefined);
      open.onsuccess = () => {
        const tx = open.result.transaction("kv", mode);
        const req = fn(tx.objectStore("kv"));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(undefined);
      };
    } catch {
      resolve(undefined);
    }
  });
}

export async function savedFolderName(): Promise<string | null> {
  const h = await idb<DirHandle>("readonly", (s) => s.get("dir") as IDBRequest<DirHandle>);
  return h?.name || null;
}

export async function pickFolder(): Promise<string | null> {
  if (!canPickFolder()) return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const h: DirHandle = await (window as any).showDirectoryPicker({ id: "sbd-proofs", mode: "readwrite" });
  await idb("readwrite", (s) => s.put(h, "dir"));
  return h.name;
}

export async function forgetFolder() {
  await idb("readwrite", (s) => s.delete("dir"));
}

async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  return (await fetch(dataUrl)).blob();
}

/**
 * Keep a copy on this device. With a chosen folder (computer): writes to
 * <folder>/06_Scans_&_Proofs/<Category>/<YYYY-MM>/<file>. Otherwise downloads
 * it (phones: Downloads), with the category at the front of the file name.
 */
export async function saveCopyOnDevice(kind: ProofKind, date: string, dataUrl: string, name: string): Promise<"folder" | "download" | "failed"> {
  try {
    const blob = await dataUrlToBlob(dataUrl);
    const h = await idb<DirHandle>("readonly", (s) => s.get("dir") as IDBRequest<DirHandle>);
    if (h) {
      try {
        let perm: PermissionState = (await h.queryPermission?.({ mode: "readwrite" })) || "granted";
        // The browser may ask once per visit; if it can't ask now, fall back to a download.
        if (perm !== "granted") perm = (await h.requestPermission?.({ mode: "readwrite" })) || "denied";
        if (perm === "granted") {
          let dir = h;
          for (const part of folderPath(kind, date)) dir = await dir.getDirectoryHandle(part, { create: true });
          const f = await dir.getFileHandle(name, { create: true });
          const w = await f.createWritable();
          await w.write(blob);
          await w.close();
          return "folder";
        }
      } catch {
        /* fall through to download */
      }
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = phoneFileName(kind, name);
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 10000);
    return "download";
  } catch {
    return "failed";
  }
}

// ---------------------------------------------------------------------------
// Send to the server (which files it in Google Drive)
// ---------------------------------------------------------------------------
export interface SavedProof {
  id: string;
  fileName: string;
  driveUrl: string | null;
  driveError: string | null;
}

export async function uploadProof(
  c: Captured,
  meta: {
    date: string;
    registerEntryId?: string | null;
    partyName?: string | null;
    amountInr?: number | null;
    refNo?: string | null;
    fields?: Record<string, unknown> | null;
    aiFields?: Record<string, unknown> | null;
    notes?: string | null;
  }
): Promise<{ saved: SavedProof; drive: { ok: boolean; error?: string }; device: "folder" | "download" | "failed" | "off" }> {
  const res = await fetch("/api/attachments", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      kind: c.kind,
      dataUrl: c.dataUrl,
      capturedAt: c.capturedAt,
      geo: c.geo || null,
      device: typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 160) : null,
      ...meta,
    }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
  const saved = json.data as SavedProof;
  let device: "folder" | "download" | "failed" | "off" = "off";
  if (phoneCopyOn()) {
    // Same name as the Drive copy, so the two can be matched later.
    device = await saveCopyOnDevice(c.kind, meta.date, c.dataUrl, saved.fileName || fileNameFor({ kind: c.kind, date: meta.date, at: new Date(c.capturedAt), mime: "image/jpeg" }));
  }
  return { saved, drive: json.drive || { ok: false }, device };
}

export const PROOF_ROOT = ROOT_FOLDER;
