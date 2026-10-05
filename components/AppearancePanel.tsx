"use client";

// 🎨 Appearance — every look-and-feel option in one place, with a live
// preview. Saved on this device only (each phone / laptop can differ).
// Used by /appearance (all signed-in users) and inside /settings.

import { useState } from "react";
import { useCustomize, ACCENT_PRESETS, BACKGROUND_PALETTES, type BackgroundKey, type ThemeMode } from "@/lib/customize";
import {
  DEFAULT_LOOK,
  FONTS,
  THEME_PRESETS,
  contrastRatio,
  deriveSurface,
  parseThemeCode,
  themeCode,
  type CustomTheme,
  type FontKey,
  type ThemePreset,
} from "@/lib/appearance";

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="set-row" style={{ alignItems: "flex-start" }}>
      <span className="lab">
        {label}
        {hint && <small>{hint}</small>}
      </span>
      <div style={{ minWidth: 0, flex: "0 1 auto", display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>{children}</div>
    </div>
  );
}
function Seg<T extends string>({ value, options, onChange }: { value: T; options: { key: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="set-chips" role="radiogroup">
      {options.map((o) => (
        <button key={o.key} type="button" role="radio" aria-checked={value === o.key} className={`set-chip${value === o.key ? " on" : ""}`} onClick={() => onChange(o.key)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}
function Slider({ value, min, max, step, onChange, fmt }: { value: number; min: number; max: number; step: number; onChange: (v: number) => void; fmt: (v: number) => string }) {
  return (
    <label style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} style={{ width: 200 }} />
      <b style={{ minWidth: 52, textAlign: "right" }}>{fmt(value)}</b>
    </label>
  );
}

function presetSwatch(p: ThemePreset) {
  if (p.colors) return p.colors;
  const pal = BACKGROUND_PALETTES[p.background || "default"];
  const s = p.mode === "dark" ? pal.dark : pal.light;
  return { bg: s.bg, fg: s.fg, card: deriveSurface(s.bg, s.fg).card, accent: p.accent };
}

export default function AppearancePanel() {
  const { prefs, setPrefs, setLook } = useCustomize();
  const look = prefs.look;
  const [code, setCode] = useState("");
  const [codeMsg, setCodeMsg] = useState<string | null>(null);

  const applyPreset = (p: ThemePreset) => {
    setPrefs({ theme: p.mode, accent: p.accent, ...(p.background ? { background: p.background } : {}) });
    setLook({ ...(p.look || {}), preset: p.key, custom: p.colors || null });
  };
  const current: CustomTheme =
    look.custom ||
    (() => {
      const pal = BACKGROUND_PALETTES[prefs.background] || BACKGROUND_PALETTES.default;
      const s = prefs.theme === "dark" ? pal.dark : pal.light;
      return { bg: s.bg, fg: s.fg, card: deriveSurface(s.bg, s.fg).card, accent: prefs.accent };
    })();
  const setCustom = (patch: Partial<CustomTheme>) => setLook({ preset: "custom", custom: { ...current, ...patch } });
  const ratio = contrastRatio(current.bg, current.fg);

  return (
    <div className="appearance">
      {/* Live preview */}
      <section className="hub-card ap-preview" aria-label="Preview">
        <div className="ap-prev-top">
          <b>Preview</b>
          <span className="hub-m small">Changes apply instantly on this device.</span>
        </div>
        <div className="ap-prev-grid">
          <div className="ap-tile in">💰<b>Sale</b><small>ಮಾರಾಟ</small></div>
          <div className="ap-tile out">🧾<b>Expense</b><small>ಖರ್ಚು</small></div>
          <div className="ap-tile jw">🌾<b>New intake</b><small>ಹೊಸ ದಾಖಲೆ</small></div>
          <div className="hub-kpi g ap-kpi"><div className="l">Sales today</div><div className="v">₹9,360</div><div className="s">2 counter · 1 invoice</div></div>
        </div>
        <div className="ap-prev-text">
          Should be in counter <b>₹1,160</b> · <span className="hub-m">ಕೌಂಟರಿನಲ್ಲಿ ಇರಬೇಕಾದ್ದು</span> ·{" "}
          <button className="hub-btn primary sm" type="button">Button</button>
        </div>
      </section>

      {/* Themes */}
      <section className="hub-card">
        <h3>Themes</h3>
        <div className="ap-themes">
          {THEME_PRESETS.map((p) => {
            const c = presetSwatch(p);
            const on = look.preset === p.key;
            return (
              <button key={p.key} type="button" className={`ap-theme${on ? " on" : ""}`} onClick={() => applyPreset(p)} aria-pressed={on} style={{ background: c.bg, color: c.fg }}>
                <span className="sw">
                  <i style={{ background: c.card }} />
                  <i style={{ background: c.accent }} />
                  <i style={{ background: c.fg }} />
                </span>
                {p.label}
                {p.mode !== "auto" && <small>{p.mode}</small>}
              </button>
            );
          })}
        </div>
        <Row label="Light / dark" hint="Auto follows the phone or computer setting.">
          <Seg<ThemeMode>
            value={prefs.theme}
            options={[
              { key: "auto", label: "Auto" },
              { key: "light", label: "☀️ Light" },
              { key: "dark", label: "🌙 Dark" },
            ]}
            onChange={(v) => {
              setPrefs({ theme: v });
              if (look.custom) setLook({ custom: null, preset: "custom-mode" });
            }}
          />
        </Row>
        <Row label="Background" hint="Base colour family for light and dark.">
          <Seg<BackgroundKey>
            value={prefs.background}
            options={(Object.keys(BACKGROUND_PALETTES) as BackgroundKey[]).map((k) => ({ key: k, label: BACKGROUND_PALETTES[k].label }))}
            onChange={(v) => {
              setPrefs({ background: v });
              setLook({ custom: null, preset: "custom-mode" });
            }}
          />
        </Row>
        <Row label="Accent colour">
          <div className="set-chips">
            {ACCENT_PRESETS.map((a) => (
              <button
                key={a.key}
                type="button"
                className={`ap-dot${(look.custom?.accent || prefs.accent) === a.hex ? " on" : ""}`}
                style={{ background: a.hex }}
                title={a.label}
                aria-label={a.label}
                onClick={() => (look.custom ? setCustom({ accent: a.hex }) : setPrefs({ accent: a.hex }))}
              />
            ))}
            <input
              type="color"
              value={look.custom?.accent || prefs.accent}
              onChange={(e) => (look.custom ? setCustom({ accent: e.target.value }) : setPrefs({ accent: e.target.value }))}
              aria-label="Custom accent colour"
            />
          </div>
        </Row>
      </section>

      {/* Custom theme */}
      <section className="hub-card">
        <h3>Make your own theme</h3>
        <div className="hub-m small" style={{ marginBottom: 6 }}>
          Pick four colours; borders and secondary text are worked out automatically. Share a theme by copying its code.
        </div>
        <div className="ap-colors">
          {(
            [
              ["bg", "Background"],
              ["fg", "Text"],
              ["card", "Panels"],
              ["accent", "Accent"],
            ] as const
          ).map(([k, label]) => (
            <label key={k} className="ap-color">
              <input type="color" value={current[k]} onChange={(e) => setCustom({ [k]: e.target.value } as Partial<CustomTheme>)} />
              <span>{label}</span>
              <code>{current[k]}</code>
            </label>
          ))}
        </div>
        <div className={`hub-m small ${ratio < 4.5 ? "r" : "g"}`}>
          Text contrast {ratio.toFixed(1)} : 1 {ratio < 4.5 ? "— too low, hard to read (aim for 4.5 or more)" : "— easy to read ✓"}
        </div>
        <Row label="Theme code" hint='Paste a code like "#0f0f10,#eeeff1,#151516,#d25e65".'>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
            <input value={code} onChange={(e) => setCode(e.target.value)} placeholder={themeCode(current)} style={{ width: 290 }} aria-label="Theme code" />
            <button
              type="button"
              className="hub-btn sm"
              onClick={() => {
                const t = parseThemeCode(code);
                if (!t) return setCodeMsg("That code isn't valid — it needs 3 or 4 colours like #112233.");
                setLook({ preset: "custom", custom: t });
                setCodeMsg("Theme applied ✓");
              }}
            >
              Apply
            </button>
            <button
              type="button"
              className="hub-btn sm"
              onClick={() => {
                const c = themeCode(current);
                navigator.clipboard?.writeText(c).then(
                  () => setCodeMsg("Copied ✓"),
                  () => setCodeMsg(c)
                );
              }}
            >
              Copy mine
            </button>
          </div>
          {codeMsg && <span className="hub-m small">{codeMsg}</span>}
        </Row>
      </section>

      {/* Text & layout */}
      <section className="hub-card">
        <h3>Text, size &amp; layout</h3>
        <Row label="Font" hint="Kannada-friendly fonts are marked.">
          <select value={look.font} onChange={(e) => setLook({ font: e.target.value as FontKey })} aria-label="Font">
            {(Object.keys(FONTS) as FontKey[]).map((k) => (
              <option key={k} value={k}>
                {FONTS[k].label}
              </option>
            ))}
          </select>
        </Row>
        <Row label="Text size" hint="Makes everything bigger or smaller — good for older eyes or small phones.">
          <Slider value={look.textScale} min={0.85} max={1.4} step={0.05} onChange={(v) => setLook({ textScale: v })} fmt={(v) => `${Math.round(v * 100)}%`} />
        </Row>
        <Row label="Button icon size" hint="The big pictures on the register buttons.">
          <Slider value={look.iconScale} min={0.8} max={1.5} step={0.05} onChange={(v) => setLook({ iconScale: v })} fmt={(v) => `${Math.round(v * 100)}%`} />
        </Row>
        <Row label="Spacing">
          <Seg
            value={look.density}
            options={[
              { key: "compact", label: "Compact" },
              { key: "comfortable", label: "Comfortable" },
              { key: "spacious", label: "Spacious" },
            ]}
            onChange={(v) => setLook({ density: v })}
          />
        </Row>
        <Row label="Corner roundness">
          <Slider value={look.radius} min={0} max={1.6} step={0.1} onChange={(v) => setLook({ radius: v })} fmt={(v) => (v === 0 ? "Square" : `${Math.round(v * 100)}%`)} />
        </Row>
        <Row label="Register button style">
          <Seg
            value={look.tileStyle}
            options={[
              { key: "solid", label: "Solid colour" },
              { key: "soft", label: "Soft tint" },
              { key: "outline", label: "Outline" },
            ]}
            onChange={(v) => setLook({ tileStyle: v })}
          />
        </Row>
      </section>

      {/* Effects */}
      <section className="hub-card">
        <h3>Effects &amp; accessibility</h3>
        <Row label="Panel transparency" hint="Below 100% panels become see-through glass over the background.">
          <Slider value={look.panelOpacity} min={0.5} max={1} step={0.05} onChange={(v) => setLook({ panelOpacity: v })} fmt={(v) => `${Math.round(v * 100)}%`} />
        </Row>
        <Row label="Background pattern">
          <Seg
            value={look.pattern}
            options={[
              { key: "none", label: "Plain" },
              { key: "gradient", label: "Soft glow" },
              { key: "sunrise", label: "Sunrise" },
              { key: "dots", label: "Dots" },
              { key: "grid", label: "Grid" },
            ]}
            onChange={(v) => setLook({ pattern: v })}
          />
        </Row>
        <Row label="Contrast" hint="High contrast: stronger borders and darker secondary text.">
          <Seg
            value={look.contrast}
            options={[
              { key: "normal", label: "Normal" },
              { key: "high", label: "High" },
            ]}
            onChange={(v) => setLook({ contrast: v })}
          />
        </Row>
        <Row label="Animations">
          <Seg
            value={look.motion}
            options={[
              { key: "full", label: "On" },
              { key: "reduced", label: "Reduced" },
            ]}
            onChange={(v) => setLook({ motion: v })}
          />
        </Row>
        <Row label="Start over" hint="Theme, colours and all options above go back to the original look.">
          <button
            type="button"
            className="hub-btn"
            onClick={() => {
              setPrefs({ theme: "auto", accent: ACCENT_PRESETS[0].hex, background: "default" });
              setLook(DEFAULT_LOOK);
            }}
          >
            Reset appearance
          </button>
        </Row>
      </section>
    </div>
  );
}
