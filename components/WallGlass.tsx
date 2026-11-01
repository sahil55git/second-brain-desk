"use client";

// 🪟 Wallpaper glass + holographic motion. Like the home-screen widgets: a wallpaper behind
// everything, cards as frosted glass with a thin light rim, and (optional) cards that tilt and
// shimmer under your finger / mouse and with the phone's tilt. Saved on this device.
import { useEffect, useState } from "react";
import "./wallglass.css";

export interface WallSettings {
  wall: string; // "none" | preset key | data: URL (own photo)
  blur: number; // 0 – 40 px
  dim: number; // 0 – 0.7 darkening over the wallpaper
  holo: boolean; // tilt + sheen
}
export const WALL_DEFAULT: WallSettings = { wall: "none", blur: 18, dim: 0.25, holo: false };
const KEY = "wall-glass-v1";
const EVT = "wall-glass-change";

export const WALL_PRESETS: { key: string; label: string; css: string }[] = [
  { key: "aurora", label: "Aurora", css: "radial-gradient(60% 50% at 20% 20%,#3b82f6aa,transparent 70%),radial-gradient(50% 50% at 80% 30%,#a855f7aa,transparent 70%),radial-gradient(60% 60% at 50% 90%,#10b981aa,transparent 70%),#0b1020" },
  { key: "mustard", label: "Mustard field", css: "radial-gradient(70% 60% at 30% 10%,#facc15cc,transparent 70%),radial-gradient(60% 60% at 90% 80%,#65a30dcc,transparent 70%),linear-gradient(160deg,#422006,#14532d)" },
  { key: "sunset", label: "Sunset oil", css: "radial-gradient(60% 50% at 70% 20%,#fb923ccc,transparent 70%),radial-gradient(60% 60% at 10% 80%,#db2777bb,transparent 70%),linear-gradient(180deg,#1e1b4b,#450a0a)" },
  { key: "ocean", label: "Deep ocean", css: "radial-gradient(70% 60% at 20% 80%,#06b6d4aa,transparent 70%),radial-gradient(50% 50% at 80% 20%,#1d4ed8aa,transparent 70%),#020617" },
  { key: "pastel", label: "Pastel", css: "radial-gradient(60% 50% at 20% 20%,#fbcfe8,transparent 70%),radial-gradient(60% 60% at 80% 40%,#bfdbfe,transparent 70%),radial-gradient(60% 60% at 40% 90%,#bbf7d0,transparent 70%),#f5f3ff" },
  { key: "mesh", label: "Neon mesh", css: "conic-gradient(from 210deg at 50% 50%,#0ea5e9,#8b5cf6,#ec4899,#f59e0b,#0ea5e9)" },
];

export function readWall(): WallSettings {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || "null");
    return v ? { ...WALL_DEFAULT, ...v } : WALL_DEFAULT;
  } catch {
    return WALL_DEFAULT;
  }
}
export function saveWall(s: WallSettings) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* full (big photo) — still applied for now */ }
  window.dispatchEvent(new CustomEvent(EVT, { detail: s }));
}

function apply(s: WallSettings) {
  const root = document.documentElement;
  const preset = WALL_PRESETS.find((p) => p.key === s.wall);
  const bg = s.wall === "none" ? "" : preset ? preset.css : s.wall.startsWith("data:") ? `url("${s.wall}") center/cover no-repeat` : "";
  if (bg) {
    root.dataset.wall = "on";
    root.style.setProperty("--wall-bg", bg);
    root.style.setProperty("--wall-blur", `${s.blur}px`);
    root.style.setProperty("--wall-dim", String(s.dim));
  } else {
    delete root.dataset.wall;
  }
  root.classList.toggle("holo", s.holo);
}

const CARDS = ".hub-card,.bd-card,.bd-kpi,.qr-tile,.ins-card,.pop-card";

/** Mounted once in the layout: paints the wallpaper and runs the holo motion. */
export default function WallGlass() {
  const [s, setS] = useState<WallSettings | null>(null);
  useEffect(() => {
    setS(readWall());
    const on = (e: Event) => setS((e as CustomEvent<WallSettings>).detail);
    window.addEventListener(EVT, on);
    return () => window.removeEventListener(EVT, on);
  }, []);
  useEffect(() => { if (s) apply(s); }, [s]);

  useEffect(() => {
    if (!s?.holo) return;
    const root = document.documentElement;
    if (root.classList.contains("reduce-motion") || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let last: HTMLElement | null = null;
    let raf = 0;
    const reset = (el: HTMLElement | null) => { if (el) { el.style.removeProperty("--rx"); el.style.removeProperty("--ry"); el.classList.remove("holo-on"); } };
    const move = (e: PointerEvent) => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const el = (e.target as Element | null)?.closest?.(CARDS) as HTMLElement | null;
        if (el !== last) { reset(last); last = el; }
        if (!el) return;
        const r = el.getBoundingClientRect();
        const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
        const k = r.width > 500 ? 3 : 7; // big cards tilt less
        el.style.setProperty("--rx", `${((0.5 - y) * k).toFixed(2)}deg`);
        el.style.setProperty("--ry", `${((x - 0.5) * k).toFixed(2)}deg`);
        el.style.setProperty("--mx", `${(x * 100).toFixed(1)}%`);
        el.style.setProperty("--my", `${(y * 100).toFixed(1)}%`);
        el.classList.add("holo-on");
      });
    };
    const leave = () => { reset(last); last = null; };
    // phone tilt moves the light across every card
    const tilt = (e: DeviceOrientationEvent) => {
      if (e.gamma == null || e.beta == null) return;
      root.style.setProperty("--gx", `${Math.max(0, Math.min(100, 50 + e.gamma * 1.5)).toFixed(1)}%`);
      root.style.setProperty("--gy", `${Math.max(0, Math.min(100, 50 + (e.beta - 45) * 1.5)).toFixed(1)}%`);
    };
    document.addEventListener("pointermove", move, { passive: true });
    document.addEventListener("pointerleave", leave);
    document.addEventListener("pointerup", (e) => { if (e.pointerType === "touch") leave(); });
    window.addEventListener("deviceorientation", tilt);
    return () => {
      cancelAnimationFrame(raf);
      leave();
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerleave", leave);
      window.removeEventListener("deviceorientation", tilt);
    };
  }, [s?.holo]);
  return null;
}

/** Shrink a photo to ≤1600 px JPEG so it fits in the browser's storage. */
async function shrinkWall(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((ok, bad) => { const i = new Image(); i.onload = () => ok(i); i.onerror = bad; i.src = url; });
    const k = Math.min(1, 1600 / Math.max(img.width, img.height));
    const c = document.createElement("canvas");
    c.width = Math.round(img.width * k);
    c.height = Math.round(img.height * k);
    c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL("image/jpeg", 0.8);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Settings block for the Appearance page. */
export function WallGlassPanel() {
  const [s, set] = useState<WallSettings>(WALL_DEFAULT);
  useEffect(() => set(readWall()), []);
  const up = (p: Partial<WallSettings>) => { const n = { ...s, ...p }; set(n); saveWall(n); };
  const own = s.wall.startsWith("data:");
  return (
    <section className="hub-card wg-panel">
      <h2>🪟 Wallpaper glass</h2>
      <p className="hub-m small">A wallpaper behind the app with see-through frosted cards — like the home-screen widgets.</p>
      <div className="wg-walls">
        <button className={`wg-w none${s.wall === "none" ? " on" : ""}`} onClick={() => up({ wall: "none" })}>Off</button>
        {WALL_PRESETS.map((p) => (
          <button key={p.key} className={`wg-w${s.wall === p.key ? " on" : ""}`} style={{ background: p.css }} onClick={() => up({ wall: p.key })} aria-label={p.label} title={p.label}><span>{p.label}</span></button>
        ))}
        <label className={`wg-w own${own ? " on" : ""}`} style={own ? { background: `url("${s.wall}") center/cover` } : undefined}>
          <span>📷 My photo</span>
          <input type="file" accept="image/*" hidden onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) up({ wall: await shrinkWall(f) }); }} />
        </label>
      </div>
      {s.wall !== "none" && (
        <div className="wg-sliders">
          <label>Frost <input type="range" min={0} max={40} value={s.blur} onChange={(e) => up({ blur: +e.target.value })} /> <small>{s.blur}px</small></label>
          <label>Dim <input type="range" min={0} max={0.7} step={0.05} value={s.dim} onChange={(e) => up({ dim: +e.target.value })} /> <small>{Math.round(s.dim * 100)}%</small></label>
        </div>
      )}
      <label className="wg-holo">
        <input type="checkbox" checked={s.holo} onChange={(e) => up({ holo: e.target.checked })} />
        <span><b>✨ Holographic cards</b> — cards tilt in 3D and a light sheen follows your finger, mouse and the phone&apos;s tilt. Off when “Reduce motion” is on.</span>
      </label>
    </section>
  );
}
