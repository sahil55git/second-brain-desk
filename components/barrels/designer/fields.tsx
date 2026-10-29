"use client";

// Small form controls shared by the label and receipt editors.
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { FONTS } from "@/lib/fonts";
import { MAX_FIELDS, fieldKey, tokensFor, type Align, type CustomField, type TemplateKind, type VAlign } from "@/lib/labelTemplate";

/** The layout's own fields, so every "Insert field" menu in the editor lists them too. */
export const FieldsCtx = createContext<CustomField[]>([]);

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
  const mine = useContext(FieldsCtx);
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
        {mine.length > 0 && (
          <optgroup label="My fields">
            {mine.map((f) => (
              <option key={f.key} value={f.key}>
                {`{${f.key}}  ${f.label}`}
              </option>
            ))}
          </optgroup>
        )}
        <optgroup label="Built-in fields">
          {tokensFor(kind).map((t) => (
            <option key={t.name} value={t.name}>
              {`{${t.name}}  ${t.label}`}
            </option>
          ))}
        </optgroup>
      </select>
    </span>
  );
}

/**
 * "My fields": fields the person makes up for this layout (Batch, Oil type, Lot no.). Each one has a name
 * and what it prints; it is used as {key} anywhere, and "Put on" adds it to the label / receipt.
 */
export function FieldsPanel({ fields, kind, canEdit, onChange, onPlace }: { fields: CustomField[]; kind: TemplateKind; canEdit: boolean; onChange: (f: CustomField[]) => void; onPlace: (f: CustomField) => void }) {
  const [label, setLabel] = useState("");
  const [value, setValue] = useState("");
  const add = () => {
    const l = label.replace(/\s+/g, " ").trim().slice(0, 40);
    if (!l || fields.length >= MAX_FIELDS) return;
    const f = { key: fieldKey(l, kind, fields.map((x) => x.key)), label: l, value: value.trim().slice(0, 120) };
    onChange([...fields, f]);
    onPlace(f);
    setLabel("");
    setValue("");
  };
  const set = (key: string, p: Partial<CustomField>) => onChange(fields.map((f) => (f.key === key ? { ...f, ...p } : f)));
  return (
    <div className="dz-fields">
      <h4>My fields</h4>
      <p className="bd-m small">Your own items, like <b>Batch</b>, <b>Oil type</b> or <b>Lot no.</b>: give a name and what it prints. It goes on the {kind === "label" ? "label" : "receipt"} as <code>{"{name}"}</code> and can be changed on the print page before printing.</p>
      {fields.map((f) => (
        <div key={f.key} className="dz-frow">
          <input aria-label="Field name" value={f.label} disabled={!canEdit} maxLength={40} onChange={(e) => set(f.key, { label: e.target.value })} />
          <input aria-label={`${f.label}: what it prints`} value={f.value} disabled={!canEdit} maxLength={120} placeholder="what it prints" onChange={(e) => set(f.key, { value: e.target.value })} />
          <code title="Type this in any text to use it">{`{${f.key}}`}</code>
          {canEdit && (
            <span className="dz-grp">
              <button type="button" className="dz-tb" onClick={() => onPlace(f)} title="Put it on again">＋ Put on</button>
              <button type="button" className="dz-tb danger" onClick={() => onChange(fields.filter((x) => x.key !== f.key))} aria-label={`Remove ${f.label}`}>🗑</button>
            </span>
          )}
        </div>
      ))}
      {canEdit && fields.length < MAX_FIELDS && (
        <div className="dz-frow add">
          <input aria-label="New field name" value={label} maxLength={40} placeholder="Name, e.g. Batch" onChange={(e) => setLabel(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} />
          <input aria-label="What it prints" value={value} maxLength={120} placeholder="What it prints, e.g. B-12" onChange={(e) => setValue(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} />
          <button type="button" className="bd-btn primary" disabled={!label.trim()} onClick={add}>＋ Add field</button>
        </div>
      )}
    </div>
  );
}

/** On a print page: the layout's own fields, to fill in or change just for this print. */
export function FieldFill({ fields, values, onChange }: { fields: CustomField[] | undefined; values: Record<string, string>; onChange: (v: Record<string, string>) => void }) {
  if (!fields?.length) return null;
  return (
    <div className="bd-row bd-fieldfill">
      <span className="bd-m small">✏️ For this print:</span>
      {fields.map((f) => (
        <label key={f.key} className="dz-inl">
          {f.label}{" "}
          <input value={values[f.key] ?? ""} placeholder={f.value || "—"} maxLength={120} onChange={(e) => onChange({ ...values, [f.key]: e.target.value })} style={{ width: 140 }} />
        </label>
      ))}
    </div>
  );
}
