"use client";

// Small form controls shared by the label and receipt editors.
import { useEffect, useRef, useState } from "react";
import { FONTS } from "@/lib/fonts";
import { tokensFor, type Align, type TemplateKind, type VAlign } from "@/lib/labelTemplate";

export function Field({ label, children, wide }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <label className={`dz-field${wide ? " wide" : ""}`}>
      <span>{label}</span>
      {children}
    </label>
  );
}

/** A number box that lets you type freely and only applies a valid number (clamped) when you leave it or press Enter. */
export function NumBox({ value, onChange, min, max, step = 0.5, unit }: { value: number; onChange: (n: number) => void; min: number; max: number; step?: number; unit?: string }) {
  const [text, setText] = useState(String(value));
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setText(String(value));
  }, [value]);
  const commit = (t: string) => {
    const n = Number(t);
    if (t.trim() !== "" && Number.isFinite(n)) onChange(Math.min(max, Math.max(min, n)));
    else setText(String(value));
  };
  return (
    <span className="dz-num">
      <input
        inputMode="decimal"
        value={text}
        onFocus={() => (focused.current = true)}
        onChange={(e) => {
          setText(e.target.value);
          const n = Number(e.target.value);
          if (e.target.value.trim() !== "" && Number.isFinite(n) && n >= min && n <= max) onChange(n);
        }}
        onBlur={() => {
          focused.current = false;
          commit(text);
          setText((t) => (Number.isFinite(Number(t)) ? String(Math.min(max, Math.max(min, Number(t) || value))) : String(value)));
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit(text);
          if (e.key === "ArrowUp" || e.key === "ArrowDown") {
            e.preventDefault();
            const n = Math.min(max, Math.max(min, Math.round((value + (e.key === "ArrowUp" ? step : -step)) * 100) / 100));
            setText(String(n));
            onChange(n);
          }
        }}
      />
      {unit && <em>{unit}</em>}
    </span>
  );
}

export function Seg<T extends string>({ value, options, onChange, label }: { value: T; options: { v: T; t: string; title?: string }[]; onChange: (v: T) => void; label?: string }) {
  return (
    <span className="dz-seg" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.v} type="button" title={o.title} className={value === o.v ? "on" : ""} onClick={() => onChange(o.v)}>
          {o.t}
        </button>
      ))}
    </span>
  );
}

export const AlignSeg = ({ value, onChange }: { value: Align; onChange: (v: Align) => void }) => (
  <Seg label="Align" value={value} onChange={onChange} options={[{ v: "left", t: "⟸", title: "Left" }, { v: "center", t: "↔", title: "Centre" }, { v: "right", t: "⟹", title: "Right" }]} />
);
export const VAlignSeg = ({ value, onChange }: { value: VAlign; onChange: (v: VAlign) => void }) => (
  <Seg label="Vertical align" value={value} onChange={onChange} options={[{ v: "top", t: "⤒", title: "Top" }, { v: "middle", t: "↕", title: "Middle" }, { v: "bottom", t: "⤓", title: "Bottom" }]} />
);

export function Toggle({ on, onChange, children, title }: { on: boolean; onChange: (v: boolean) => void; children: React.ReactNode; title?: string }) {
  return (
    <button type="button" title={title} className={`dz-tog${on ? " on" : ""}`} aria-pressed={on} onClick={() => onChange(!on)}>
      {children}
    </button>
  );
}

export function FontSelect({ value, onChange }: { value: string; onChange: (v: ReturnType<typeof asFont>) => void }) {
  return (
    <select value={value} onChange={(e) => onChange(asFont(e.target.value))}>
      {FONTS.map((f) => (
        <option key={f.id} value={f.id} style={{ fontFamily: f.stack }}>
          {f.name}
        </option>
      ))}
    </select>
  );
}
const asFont = (v: string) => (FONTS.find((f) => f.id === v)?.id ?? "sans");

/** A text box (single line or several) with an "insert field" menu that puts {tokens} where the cursor is. */
export function TokenText({ value, onChange, kind, multiline, placeholder, rows = 3, areaRef }: { value: string; onChange: (v: string) => void; kind: TemplateKind; multiline?: boolean; placeholder?: string; rows?: number; areaRef?: React.RefObject<HTMLTextAreaElement> }) {
  const own = useRef<HTMLInputElement & HTMLTextAreaElement>(null);
  const ref = (areaRef ?? own) as React.RefObject<HTMLInputElement & HTMLTextAreaElement>;
  const insert = (name: string) => {
    const el = ref.current;
    const add = `{${name}}`;
    if (!el) return onChange(value + add);
    const a = el.selectionStart ?? value.length;
    const b = el.selectionEnd ?? value.length;
    const next = value.slice(0, a) + add + value.slice(b);
    onChange(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(a + add.length, a + add.length);
    });
  };
  return (
    <span className="dz-tt">
      {multiline ? (
        <textarea ref={ref} rows={rows} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <input ref={ref} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
      )}
      <select
        aria-label="Insert a field"
        value=""
        onChange={(e) => {
          if (e.target.value) insert(e.target.value);
        }}
      >
        <option value="">＋ Insert field…</option>
        {tokensFor(kind).map((t) => (
          <option key={t.name} value={t.name}>
            {`{${t.name}}  ${t.label}`}
          </option>
        ))}
      </select>
    </span>
  );
}
