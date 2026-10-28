"use client";

// "Layout" chooser on the label and slip print pages: the built-in standard, or one made in the designer.
import type { TemplateKind, TemplateRow } from "@/lib/labelTemplate";
import { STANDARD } from "@/components/barrels/designer/useTemplates";

export default function LayoutPicker({ kind, rows, choiceId, onChoose, fixedByLink }: { kind: TemplateKind; rows: TemplateRow[]; choiceId: string; onChoose: (id: string) => void; fixedByLink?: boolean }) {
  return (
    <div className="bd-row dz-picker">
      <label className="dz-inl">
        <b>Layout</b>
        <select value={choiceId} onChange={(e) => onChoose(e.target.value)} aria-label="Layout">
          <option value={STANDARD}>Standard (built in)</option>
          {rows.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
              {r.isDefault ? " ★" : ""} · {r.kind === "label" ? `${r.widthMm}×${r.heightMm} mm` : `${r.widthMm} mm`}
            </option>
          ))}
        </select>
      </label>
      <a className="bd-linkbtn" href={`/barrels/fleet/designer?kind=${kind}`} target="_blank" rel="noreferrer">🎨 Design / edit layouts</a>
      {fixedByLink && <span className="bd-m small">(chosen by the link you opened)</span>}
    </div>
  );
}
