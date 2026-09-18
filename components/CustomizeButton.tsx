"use client";

import { useState } from "react";
import {
  useCustomize,
  ACCENT_PRESETS,
  BACKGROUND_PALETTES,
  type ThemeMode,
  type BackgroundKey,
} from "@/lib/customize";

export default function CustomizeButton() {
  const { prefs, setPrefs, reset } = useCustomize();
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="rounded border border-black/20 dark:border-white/20 px-3 py-1.5 text-sm font-medium whitespace-nowrap"
        title="Customize appearance"
      >
        ⚙ Customize
      </button>
      {open && (
        <div
          className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-xl bg-[var(--background)] text-[var(--foreground)] border border-black/10 dark:border-white/10 p-5 max-h-[85vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-lg">Customize appearance</h2>
              <button onClick={() => setOpen(false)} className="opacity-60 hover:opacity-100">
                ✕
              </button>
            </div>

            <div className="mb-5">
              <div className="text-xs opacity-70 mb-2 font-medium">Theme</div>
              <div className="flex gap-2">
                {(["auto", "light", "dark"] as ThemeMode[]).map((t) => (
                  <button
                    key={t}
                    onClick={() => setPrefs({ theme: t })}
                    className={`px-3 py-1.5 rounded text-sm capitalize ${
                      prefs.theme === t
                        ? "bg-[var(--accent)] text-[var(--accent-contrast)]"
                        : "bg-black/5 dark:bg-white/5"
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            <div className="mb-5">
              <div className="text-xs opacity-70 mb-2 font-medium">Accent colour</div>
              <div className="flex flex-wrap gap-2 items-center">
                {ACCENT_PRESETS.map((a) => (
                  <button
                    key={a.key}
                    onClick={() => setPrefs({ accent: a.hex })}
                    title={a.label}
                    className={`w-7 h-7 rounded-full border-2 ${
                      prefs.accent.toLowerCase() === a.hex.toLowerCase()
                        ? "border-[var(--foreground)]"
                        : "border-transparent"
                    }`}
                    style={{ backgroundColor: a.hex }}
                  />
                ))}
                <input
                  type="color"
                  value={prefs.accent}
                  onChange={(e) => setPrefs({ accent: e.target.value })}
                  className="w-7 h-7 rounded cursor-pointer bg-transparent border border-black/20 dark:border-white/20"
                  title="Custom colour"
                />
              </div>
            </div>

            <div className="mb-5">
              <div className="text-xs opacity-70 mb-2 font-medium">Background</div>
              <div className="flex flex-wrap gap-2">
                {(Object.keys(BACKGROUND_PALETTES) as BackgroundKey[]).map((key) => {
                  const p = BACKGROUND_PALETTES[key];
                  return (
                    <button
                      key={key}
                      onClick={() => setPrefs({ background: key })}
                      className={`px-3 py-1.5 rounded text-sm border-2 ${
                        prefs.background === key ? "border-[var(--accent)]" : "border-transparent"
                      }`}
                      style={{ backgroundColor: p.light.bg, color: p.light.fg }}
                    >
                      {p.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <button onClick={reset} className="text-xs underline opacity-70">
              Reset everything to default
            </button>
          </div>
        </div>
      )}
    </>
  );
}
