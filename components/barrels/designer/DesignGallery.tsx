"use client";

// Ready-made designs and the auto design maker, for a label or a receipt of any size. Every card is a real
// preview of the layout with sample data; "Use this" hands the layout to the designer (as a new layout, or
// in place of the one open, which Undo brings back).
import { useMemo, useState } from "react";
import { LABEL_SIZES } from "@/lib/printSizes";
import { LIMITS, clamp, r1, type TemplateDoc, type TemplateKind, type TokenData } from "@/lib/labelTemplate";
import {
  DEFAULT_AUTO, DEFAULT_SLIP_PARTS, HIGHLIGHTS, LABEL_PRESETS, PARTS, SLIP_PARTS, SLIP_PRESETS, autoLabels, autoSlip,
  type AutoOpts, type Focus, type Highlight, type Part, type SlipPart,
} from "@/lib/labelDesigns";
import { LabelView, SlipView } from "@/components/barrels/designer/render";
import { Seg } from "@/components/barrels/designer/fields";

const PX = 96 / 25.4;
const CARD = 168; // preview box, px
const LABEL_CHOICES = LABEL_SIZES.filter((z) => z.h && z.cls !== "a4");
const ROLLS = [80, 58, 50];

function Thumb({ doc, data }: { doc: TemplateDoc; data: TokenData }) {
  if (doc.kind === "label") {
    const z = Math.min(CARD / (doc.widthMm * PX), CARD / (doc.heightMm * PX));
    return (
      <div className="dz-thumb" style={{ width: doc.widthMm * PX * z, height: doc.heightMm * PX * z }}>
        <div style={{ transform: `scale(${z})`, transformOrigin: "0 0", width: `${doc.widthMm}mm`, height: `${doc.heightMm}mm` }}>
          <LabelView doc={doc} data={data} />
        </div>
      </div>
    );
  }
  const z = CARD / (doc.widthMm * PX);
  return (
    <div className="dz-thumb roll" style={{ width: CARD, maxHeight: 260 }}>
      <div style={{ zoom: z, width: `${doc.widthMm}mm`, padding: `${doc.marginMm}mm`, boxSizing: "border-box" }}>
        <SlipView doc={doc} data={data} />
      </div>
    </div>
  );
}

export default function DesignGallery({
  kind,
  data,
  start,
  mode,
  onPick,
  onClose,
}: {
  kind: TemplateKind;
  data: TokenData;
  /** the size to start on: label w × h, or roll width (h null) */
  start: { w: number; h: number | null };
  mode: "new" | "replace";
  onPick: (doc: TemplateDoc, name: string) => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<"ready" | "auto">("ready");
  const [w, setW] = useState(start.w);
  const [h, setH] = useState(start.h ?? 75);
  const [opts, setOpts] = useState<AutoOpts>(DEFAULT_AUTO);
  const [sparts, setSparts] = useState<SlipPart[]>(DEFAULT_SLIP_PARTS);
  const [shl, setShl] = useState<Highlight>("band");
  const label = kind === "label";
  const W = r1(clamp(w, label ? LIMITS.labelW[0] : LIMITS.slipW[0], label ? LIMITS.labelW[1] : LIMITS.slipW[1]));
  const H = r1(clamp(h, LIMITS.labelH[0], LIMITS.labelH[1]));
  const sizeName = label ? `${W} × ${H} mm` : `${W} mm roll`;

  const ready = useMemo(
    () => (label ? LABEL_PRESETS.map((p) => ({ id: p.id, name: p.name, note: p.note, doc: p.make(W, H) as TemplateDoc })) : SLIP_PRESETS.map((p) => ({ id: p.id, name: p.name, note: p.note, doc: p.make(W, 0) as TemplateDoc }))),
    [label, W, H]
  );
  const auto = useMemo(
    () => (label ? autoLabels(W, H, opts).map((v) => ({ id: v.id, name: v.name, note: v.note, doc: v.doc as TemplateDoc })) : [{ id: "auto", name: "Your receipt", note: "From the parts you chose", doc: autoSlip(W, sparts, shl) as TemplateDoc }]),
    [label, W, H, opts, sparts, shl]
  );
  const list = tab === "ready" ? ready : auto;
  const togglePart = (p: Part) => setOpts((o) => ({ ...o, parts: o.parts.includes(p) ? o.parts.filter((x) => x !== p) : [...o.parts, p] }));
  const toggleSlip = (p: SlipPart) => setSparts((l) => (l.includes(p) ? l.filter((x) => x !== p) : [...l, p]));
  const sizeId = LABEL_CHOICES.find((z) => z.w === W && z.h === H)?.id ?? "custom";

  return (
    <div className="dz-gal-back" role="dialog" aria-modal="true" aria-label="Designs" onClick={onClose}>
      <div className="dz-gal" onClick={(e) => e.stopPropagation()}>
        <div className="dz-gal-head">
          <b>🎨 {label ? "Label" : "Receipt"} designs · {sizeName}</b>
          <button type="button" className="bd-btn" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="dz-gal-size">
          {label ? (
            <>
              <label className="dz-inl">
                Size
                <select value={sizeId} onChange={(e) => { const z = LABEL_CHOICES.find((x) => x.id === e.target.value); if (z) { setW(z.w); setH(z.h ?? 30); } }}>
                  {LABEL_CHOICES.map((z) => <option key={z.id} value={z.id}>{z.name}{z.note ? ` · ${z.note}` : ""}</option>)}
                  <option value="custom">Your own size…</option>
                </select>
              </label>
              <label className="dz-inl">W <input type="number" min={LIMITS.labelW[0]} max={LIMITS.labelW[1]} value={w} onChange={(e) => setW(Number(e.target.value) || 0)} style={{ width: 70 }} /> mm</label>
              <label className="dz-inl">H <input type="number" min={LIMITS.labelH[0]} max={LIMITS.labelH[1]} value={h} onChange={(e) => setH(Number(e.target.value) || 0)} style={{ width: 70 }} /> mm</label>
            </>
          ) : (
            <>
              <span className="bd-m small">Roll</span>
              {ROLLS.map((r) => <button key={r} type="button" className={`bd-chip${W === r ? " on" : ""}`} onClick={() => setW(r)}>{r} mm</button>)}
              <label className="dz-inl">Other <input type="number" min={LIMITS.slipW[0]} max={LIMITS.slipW[1]} value={w} onChange={(e) => setW(Number(e.target.value) || 0)} style={{ width: 70 }} /> mm</label>
            </>
          )}
        </div>
        <div className="dz-tabs small" role="tablist">
          <button role="tab" aria-selected={tab === "ready"} className={tab === "ready" ? "on" : ""} onClick={() => setTab("ready")}>📚 Ready designs<small>pick one, change anything</small></button>
          <button role="tab" aria-selected={tab === "auto"} className={tab === "auto" ? "on" : ""} onClick={() => setTab("auto")}>✨ Auto design<small>choose what to show, get finished layouts</small></button>
        </div>

        {tab === "auto" && (
          <div className="dz-auto">
            {label ? (
              <>
                <div className="dz-autoparts" role="group" aria-label="What to show">
                  {PARTS.map((p) => (
                    <label key={p.id} className={`dz-pchip${opts.parts.includes(p.id) ? " on" : ""}`}>
                      <input type="checkbox" checked={opts.parts.includes(p.id)} onChange={() => togglePart(p.id)} /> {p.name}
                    </label>
                  ))}
                </div>
                <div className="dz-autorow">
                  <span className="bd-m small">Biggest</span>
                  <Seg<Focus> label="Biggest" value={opts.focus} onChange={(v) => setOpts((o) => ({ ...o, focus: v, parts: v === "code" || o.parts.includes(v) ? o.parts : [...o.parts, v] }))} options={[{ v: "code", t: "Code" }, { v: "tare", t: "Tare" }, { v: "gross", t: "Gross" }, { v: "net", t: "Net" }]} />
                  <span className="bd-m small">Highlight</span>
                  <Seg<Highlight> label="Highlight" value={opts.highlight} onChange={(v) => setOpts((o) => ({ ...o, highlight: v }))} options={HIGHLIGHTS.map((x) => ({ v: x.id, t: x.name, title: x.note }))} />
                </div>
              </>
            ) : (
              <>
                <div className="dz-autoparts" role="group" aria-label="What to show">
                  {SLIP_PARTS.map((p) => (
                    <label key={p.id} className={`dz-pchip${sparts.includes(p.id) ? " on" : ""}`}>
                      <input type="checkbox" checked={sparts.includes(p.id)} onChange={() => toggleSlip(p.id)} /> {p.name}
                    </label>
                  ))}
                </div>
                <div className="dz-autorow">
                  <span className="bd-m small">Net oil</span>
                  <Seg<Highlight> label="Highlight" value={shl} onChange={setShl} options={[{ v: "band", t: "Black band" }, { v: "bold", t: "Bold" }]} />
                </div>
              </>
            )}
          </div>
        )}

        <div className="dz-gal-grid">
          {list.map((d) => (
            <div key={d.id} className="dz-gcard">
              <Thumb doc={d.doc} data={data} />
              <b>{d.name}</b>
              <small>{d.note}</small>
              <button type="button" className="bd-btn primary" onClick={() => onPick(d.doc, d.id === "blank" ? `${label ? "Label" : "Receipt"} ${sizeName}` : `${d.name} ${label ? `${W}×${H}` : `${W} mm`}`)}>
                {mode === "new" ? "Use this" : "Use this here"}
              </button>
            </div>
          ))}
        </div>
        {mode === "replace" && <p className="bd-m small">“Use this here” replaces what is on the {label ? "label" : "receipt"} now; ↶ Undo brings it back. Your own fields are kept.</p>}
      </div>
    </div>
  );
}

