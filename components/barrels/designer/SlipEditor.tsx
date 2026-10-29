"use client";

// The receipt / slip designer: blocks stacked top to bottom on a fixed paper width. The paper grows
// with the content, like a till roll. Rows whose fields are empty can hide themselves.
import { useEffect, useMemo, useRef, useState } from "react";
import { LIMITS, checkDoc, duplicateItems, moveBlock, newBlock, type SlipBlock, type SlipBlockType, type SlipDoc, type TokenData } from "@/lib/labelTemplate";
import { SlipView } from "@/components/barrels/designer/render";
import { AlignSeg, Field, FieldsCtx, FieldsPanel, FontSelect, NumBox, Seg, Toggle, TokenText } from "@/components/barrels/designer/fields";
import { fileToLogo } from "@/components/barrels/designer/logo";

const PX = 96 / 25.4;
const ADD: { t: SlipBlockType; icon: string; name: string }[] = [
  { t: "text", icon: "T", name: "Text line" },
  { t: "kv", icon: "≡", name: "Label : value" },
  { t: "cols", icon: "▥", name: "Columns (Gross / Tare / Net)" },
  { t: "barcode", icon: "▮▯▮", name: "Barcode" },
  { t: "qr", icon: "▦", name: "QR code" },
  { t: "image", icon: "🖼", name: "Logo / picture" },
  { t: "divider", icon: "—", name: "Line" },
  { t: "spacer", icon: "↕", name: "Gap" },
  { t: "sign", icon: "✍", name: "Signature lines" },
];

const summary = (b: SlipBlock) => {
  switch (b.type) {
    case "text": return b.text.replace(/\s+/g, " ").slice(0, 34) || "(empty text)";
    case "kv": return `${b.label}: ${b.value}`.slice(0, 40);
    case "cols": return b.cells.map((c) => c.label).join(" | ");
    case "barcode": return `Barcode ${b.value}`;
    case "qr": return `QR code ${b.sizeMm} mm`;
    case "image": return "Logo / picture";
    case "divider": return `Line (${b.style})`;
    case "spacer": return `Gap ${b.heightMm} mm`;
    case "sign": return `Signatures: ${b.labels.join(", ")}`;
  }
};
const icon = (b: SlipBlock) => ADD.find((a) => a.t === b.type)?.icon ?? "";

export interface SlipEditorProps {
  doc: SlipDoc;
  data: TokenData;
  readOnly: boolean;
  onChange: (next: SlipDoc, key?: string | null) => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onResetStandard: () => void;
  /** open the ready-made designs / auto design */
  onDesigns?: () => void;
}

export default function SlipEditor({ doc, data, readOnly, onChange, onUndo, onRedo, canUndo, canRedo, onResetStandard, onDesigns }: SlipEditorProps) {
  const [selId, setSelId] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [zoomIn, setZoomIn] = useState<number | null>(null);
  const [prevW, setPrevW] = useState(400);
  const prev = useRef<HTMLDivElement>(null);
  const [bw, setBw] = useState(true);
  const fileRef = useRef<HTMLInputElement>(null);
  const logoFor = useRef<string | null>(null);
  const listRef = useRef<HTMLOListElement>(null);
  const canEdit = !readOnly;
  const warnings = useMemo(() => checkDoc(doc, data), [doc, data]);
  const sel = doc.blocks.find((b) => b.id === selId) ?? null;

  useEffect(() => {
    const el = prev.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setPrevW(el.clientWidth));
    ro.observe(el);
    setPrevW(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (selId && !doc.blocks.some((b) => b.id === selId)) setSelId(null);
  }, [doc, selId]);

  const commit = (blocks: SlipBlock[], key?: string | null) => onChange({ ...doc, blocks }, key);
  const patch = (id: string, p: Partial<SlipBlock>, key?: string) => commit(doc.blocks.map((b) => (b.id === id ? ({ ...b, ...p } as SlipBlock) : b)), key ?? `p:${id}:${Object.keys(p).join(",")}`);
  const add = (t: SlipBlockType) => {
    if (doc.blocks.length >= LIMITS.maxBlocks) return setMsg(`A slip can hold at most ${LIMITS.maxBlocks} blocks.`);
    const b = newBlock(t, doc);
    // new block goes right after the selected one, else at the end
    const at = selId ? doc.blocks.findIndex((x) => x.id === selId) + 1 : doc.blocks.length;
    const blocks = [...doc.blocks.slice(0, at), b, ...doc.blocks.slice(at)];
    commit(blocks);
    setSelId(b.id);
    setMsg(null);
    if (t === "image") {
      logoFor.current = b.id;
      fileRef.current?.click();
    }
  };
  const remove = (id: string) => {
    commit(doc.blocks.filter((b) => b.id !== id));
    setSelId(null);
  };
  const duplicate = (id: string) => {
    if (doc.blocks.length >= LIMITS.maxBlocks) return setMsg(`A slip can hold at most ${LIMITS.maxBlocks} blocks.`);
    const r = duplicateItems(doc.blocks, [id]);
    // place the copy straight under the original
    const copy = r.list[r.list.length - 1];
    const rest = r.list.slice(0, -1);
    const i = rest.findIndex((b) => b.id === id);
    commit([...rest.slice(0, i + 1), copy, ...rest.slice(i + 1)]);
    setSelId(copy.id);
  };
  const pickLogo = async (file: File | undefined) => {
    const id = logoFor.current;
    logoFor.current = null;
    if (!file || !id) return;
    try {
      const src = await fileToLogo(file, { blackWhite: bw, maxPx: 360 });
      patch(id, { src } as Partial<SlipBlock>, "logo");
      setMsg(null);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Could not use that picture.");
    }
  };

  const inner = doc.widthMm - 2 * doc.marginMm;
  const zoom = zoomIn ?? Math.max(1, Math.min(4, (prevW - 26) / (doc.widthMm * PX)));

  return (
    <FieldsCtx.Provider value={doc.fields ?? []}>
    <div className="dz-editor">
      <div className="dz-toolbar" role="toolbar" aria-label="Receipt tools">
        {canEdit && onDesigns && (
          <span className="dz-grp">
            <button type="button" className="dz-tb accent" onClick={onDesigns} title="Ready-made receipts and the auto design maker"><b>🎨</b> Designs</button>
          </span>
        )}
        <span className="dz-grp">
          <button type="button" className="dz-tb" disabled={!canUndo || !canEdit} onClick={onUndo}>↶ Undo</button>
          <button type="button" className="dz-tb" disabled={!canRedo || !canEdit} onClick={onRedo}>↷ Redo</button>
        </span>
        <span className="dz-grp">
          <button type="button" className="dz-tb" onClick={() => setZoomIn(Math.max(1, zoom - 0.5))} aria-label="Smaller preview">−</button>
          <button type="button" className="dz-tb" onClick={() => setZoomIn(null)} title="Fit to the screen">{Math.round(zoom * 100)}%</button>
          <button type="button" className="dz-tb" onClick={() => setZoomIn(Math.min(6, zoom + 0.5))} aria-label="Bigger preview">＋</button>
        </span>
      </div>
      {msg && <div className="bd-err">{msg}</div>}
      <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden onChange={(e) => { void pickLogo(e.target.files?.[0]); e.target.value = ""; }} />

      <div className="dz-main slip">
        <div className="dz-blocks">
          <h3>Receipt paper</h3>
          <div className="dz-grid3">
            <Field label="Roll / paper width">
              <select value={[50, 58, 80].includes(doc.widthMm) ? String(doc.widthMm) : "custom"} disabled={!canEdit} onChange={(e) => e.target.value !== "custom" && onChange({ ...doc, widthMm: Number(e.target.value), marginMm: Number(e.target.value) <= 60 ? 2 : 3 }, "paper")}>
                <option value="50">50 mm</option>
                <option value="58">58 mm</option>
                <option value="80">80 mm</option>
                <option value="custom">Other…</option>
              </select>
            </Field>
            <Field label="Width (mm)"><NumBox value={doc.widthMm} min={LIMITS.slipW[0]} max={LIMITS.slipW[1]} step={1} onChange={(n) => canEdit && onChange({ ...doc, widthMm: n }, "paper")} /></Field>
            <Field label="Side margin (mm)"><NumBox value={doc.marginMm} min={LIMITS.slipMargin[0]} max={LIMITS.slipMargin[1]} step={0.5} onChange={(n) => canEdit && onChange({ ...doc, marginMm: n }, "margin")} /></Field>
          </div>
          <p className="bd-m small">Printing area {Math.round(inner * 10) / 10} mm wide. The slip is as long as its content.</p>

          {warnings.length > 0 && (
            <ul className="dz-warn">
              {warnings.map((w) => <li key={w}>⚠ {w}</li>)}
            </ul>
          )}

          {canEdit && (
            <>
              <h3>Add a block</h3>
              <div className="dz-grp wrapgrp">
                {ADD.map((a) => (
                  <button key={a.t} type="button" className="dz-tb" onClick={() => add(a.t)}>
                    <b>{a.icon}</b> {a.name}
                  </button>
                ))}
              </div>
              <p className="bd-m small">{selId ? "New blocks go under the selected block." : "New blocks go at the bottom."}</p>
            </>
          )}

          <h3>Blocks, top to bottom</h3>
          <ol className="dz-blist" ref={listRef}>
            {doc.blocks.map((b, i) => (
              <li key={b.id} className={selId === b.id ? "on" : ""}>
                <div className="dz-brow">
                  <button type="button" className="dz-bsum" onClick={() => setSelId(selId === b.id ? null : b.id)}>
                    <b>{icon(b)}</b> <span>{summary(b)}</span>
                  </button>
                  {canEdit && (
                    <span className="dz-grp">
                      <button type="button" className="dz-tb" disabled={i === 0} onClick={() => commit(moveBlock(doc.blocks, b.id, -1))} aria-label="Move up">↑</button>
                      <button type="button" className="dz-tb" disabled={i === doc.blocks.length - 1} onClick={() => commit(moveBlock(doc.blocks, b.id, 1))} aria-label="Move down">↓</button>
                      <button type="button" className="dz-tb" onClick={() => duplicate(b.id)} aria-label="Copy">⧉</button>
                      <button type="button" className="dz-tb danger" onClick={() => remove(b.id)} aria-label="Delete">🗑</button>
                    </span>
                  )}
                </div>
                {selId === b.id && sel && (
                  <div className="dz-form">
                    <BlockForm b={sel} canEdit={canEdit} patch={(p, key) => patch(sel.id, p, key)} chooseLogo={() => { logoFor.current = sel.id; fileRef.current?.click(); }} bw={bw} setBw={setBw} />
                  </div>
                )}
              </li>
            ))}
            {!doc.blocks.length && <li className="bd-m small">Nothing yet. Add a block above.</li>}
          </ol>
          {canEdit && <button type="button" className="bd-btn" onClick={onResetStandard}>↺ Start again from the standard slip</button>}
          <FieldsPanel
            fields={doc.fields ?? []}
            kind="slip"
            canEdit={canEdit}
            onChange={(f) => onChange({ ...doc, fields: f.length ? f : undefined }, "fields")}
            onPlace={(f) => {
              if (doc.blocks.length >= LIMITS.maxBlocks) return setMsg(`A slip can hold at most ${LIMITS.maxBlocks} blocks.`);
              const b = { ...newBlock("kv", doc), label: f.label, value: `{${f.key}}` } as SlipBlock;
              const fields = (doc.fields ?? []).some((x) => x.key === f.key) ? doc.fields : [...(doc.fields ?? []), f];
              const at = selId ? doc.blocks.findIndex((x) => x.id === selId) + 1 : doc.blocks.length;
              onChange({ ...doc, fields, blocks: [...doc.blocks.slice(0, at), b, ...doc.blocks.slice(at)] });
              setSelId(b.id);
            }}
          />
        </div>

        <div className="dz-preview" ref={prev}>
          <div className="dz-previewhead">Preview with sample data <span className="bd-m small">· tap a block to edit it</span></div>
          <div className="dz-roll" style={{ width: doc.widthMm * PX * zoom }}>
            <div
              style={{ zoom, width: `${doc.widthMm}mm`, padding: `${doc.marginMm}mm`, boxSizing: "border-box" }}
              onClick={(e) => {
                const hit = (e.target as HTMLElement).closest("[data-block]") as HTMLElement | null;
                if (hit) setSelId(hit.dataset.block ?? null);
              }}
            >
              <SlipView doc={doc} data={data} selectedId={selId} />
            </div>
          </div>
        </div>
      </div>
    </div>
    </FieldsCtx.Provider>
  );
}

// ---------------------------------------------------------------------------
function BlockForm({ b, canEdit, patch, chooseLogo, bw, setBw }: { b: SlipBlock; canEdit: boolean; patch: (p: Partial<SlipBlock>, key?: string) => void; chooseLogo: () => void; bw: boolean; setBw: (v: boolean) => void }) {
  const set = (p: Partial<SlipBlock>, key?: string) => canEdit && patch(p, key);
  switch (b.type) {
    case "text":
      return (
        <>
          <Field label="Text (use fields like {code})" wide><TokenText kind="slip" multiline rows={2} value={b.text} onChange={(v) => set({ text: v }, `t:${b.id}`)} /></Field>
          <Field label="Font" wide><FontSelect value={b.font} onChange={(v) => set({ font: v })} /></Field>
          <div className="dz-grid2">
            <Field label="Size (pt)"><NumBox value={b.size} min={LIMITS.pt[0]} max={LIMITS.pt[1]} onChange={(n) => set({ size: n })} /></Field>
            <Field label="Across"><AlignSeg value={b.align} onChange={(v) => set({ align: v })} /></Field>
          </div>
          <div className="dz-grp">
            <Toggle on={b.bold} onChange={(v) => set({ bold: v })}><b>B</b></Toggle>
            <Toggle on={b.italic} onChange={(v) => set({ italic: v })}><i>I</i></Toggle>
            <Toggle on={b.invert} onChange={(v) => set({ invert: v })} title="Black box with white letters. Switch off for black letters on the white paper.">◼ Black background</Toggle>
            <Toggle on={b.hideEmpty} onChange={(v) => set({ hideEmpty: v })} title="Leave this line out when every field in it is empty">Hide when empty</Toggle>
          </div>
        </>
      );
    case "kv":
      return (
        <>
          <Field label="Label" wide><input value={b.label} onChange={(e) => set({ label: e.target.value.slice(0, 60) }, `l:${b.id}`)} /></Field>
          <Field label="Value" wide><TokenText kind="slip" value={b.value} onChange={(v) => set({ value: v }, `v:${b.id}`)} /></Field>
          <Field label="Font" wide><FontSelect value={b.font} onChange={(v) => set({ font: v })} /></Field>
          <div className="dz-grid2">
            <Field label="Size (pt)"><NumBox value={b.size} min={LIMITS.pt[0]} max={LIMITS.pt[1]} onChange={(n) => set({ size: n })} /></Field>
            <Field label="Style">
              <span className="dz-grp">
                <Toggle on={b.bold} onChange={(v) => set({ bold: v })}><b>B</b> value</Toggle>
                <Toggle on={b.hideEmpty} onChange={(v) => set({ hideEmpty: v })} title="Leave this row out when the value is empty">Hide when empty</Toggle>
              </span>
            </Field>
          </div>
        </>
      );
    case "cols":
      return (
        <>
          {b.cells.map((c, i) => (
            <div className="dz-cell" key={i}>
              <Field label={`Column ${i + 1} title`}><input value={c.label} onChange={(e) => set({ cells: b.cells.map((x, j) => (j === i ? { ...x, label: e.target.value.slice(0, 40) } : x)) }, `c:${b.id}:${i}l`)} /></Field>
              <Field label="Value"><TokenText kind="slip" value={c.value} onChange={(v) => set({ cells: b.cells.map((x, j) => (j === i ? { ...x, value: v } : x)) }, `c:${b.id}:${i}v`)} /></Field>
              {canEdit && b.cells.length > 1 && <button type="button" className="dz-tb danger" onClick={() => set({ cells: b.cells.filter((_, j) => j !== i) })}>Remove column</button>}
            </div>
          ))}
          {canEdit && b.cells.length < 4 && <button type="button" className="dz-tb" onClick={() => set({ cells: [...b.cells, { label: "Title", value: "{note}" }] })}>＋ Add a column</button>}
          <Field label="Font" wide><FontSelect value={b.font} onChange={(v) => set({ font: v })} /></Field>
          <div className="dz-grid2">
            <Field label="Size (pt)"><NumBox value={b.size} min={LIMITS.pt[0]} max={LIMITS.pt[1]} onChange={(n) => set({ size: n })} /></Field>
            <Field label="Empty"><Toggle on={b.hideEmpty} onChange={(v) => set({ hideEmpty: v })}>Hide row when all empty</Toggle></Field>
          </div>
          <p className="bd-m small">A column with no value shows “—”.</p>
        </>
      );
    case "barcode":
      return (
        <>
          <Field label="Barcode text" wide><TokenText kind="slip" value={b.value} onChange={(v) => set({ value: v }, `v:${b.id}`)} /></Field>
          <div className="dz-grid3">
            <Field label="Height (mm)"><NumBox value={b.heightMm} min={4} max={60} step={1} onChange={(n) => set({ heightMm: n })} /></Field>
            <Field label="Width (%)"><NumBox value={b.widthPct} min={20} max={100} step={5} onChange={(n) => set({ widthPct: Math.round(n) })} /></Field>
            <Field label="Place"><AlignSeg value={b.align} onChange={(v) => set({ align: v })} /></Field>
          </div>
          <Toggle on={b.human} onChange={(v) => set({ human: v })}>Print the text under the bars</Toggle>
        </>
      );
    case "qr":
      return (
        <>
          <Field label="QR text" wide><TokenText kind="slip" value={b.value} onChange={(v) => set({ value: v }, `v:${b.id}`)} /></Field>
          <div className="dz-grid2">
            <Field label="Size (mm)"><NumBox value={b.sizeMm} min={8} max={60} step={1} onChange={(n) => set({ sizeMm: n })} /></Field>
            <Field label="Place"><AlignSeg value={b.align} onChange={(v) => set({ align: v })} /></Field>
          </div>
        </>
      );
    case "image":
      return (
        <>
          <div className="dz-grid2">
            <Field label="Width (mm)"><NumBox value={b.widthMm} min={4} max={210} step={1} onChange={(n) => set({ widthMm: n })} /></Field>
            <Field label="Place"><AlignSeg value={b.align} onChange={(v) => set({ align: v })} /></Field>
          </div>
          {canEdit && (
            <>
              <label className="dz-inl"><input type="checkbox" checked={bw} onChange={(e) => setBw(e.target.checked)} /> Make it black &amp; white (best for thermal printers)</label>
              <button type="button" className="bd-btn" onClick={chooseLogo}>Choose a picture…</button>
            </>
          )}
        </>
      );
    case "divider":
      return <Field label="Style" wide><Seg value={b.style} onChange={(v) => set({ style: v })} options={[{ v: "solid", t: "Solid" }, { v: "thick", t: "Thick" }, { v: "dashed", t: "Dashed" }, { v: "dotted", t: "Dotted" }]} /></Field>;
    case "spacer":
      return <Field label="Height (mm)"><NumBox value={b.heightMm} min={0.5} max={60} step={0.5} onChange={(n) => set({ heightMm: n })} /></Field>;
    case "sign":
      return (
        <>
          {b.labels.map((l, i) => (
            <Field key={i} label={`Line ${i + 1}`}>
              <span className="dz-grp">
                <input value={l} onChange={(e) => set({ labels: b.labels.map((x, j) => (j === i ? e.target.value.slice(0, 40) : x)) }, `s:${b.id}:${i}`)} />
                {canEdit && b.labels.length > 1 && <button type="button" className="dz-tb danger" onClick={() => set({ labels: b.labels.filter((_, j) => j !== i) })} aria-label="Remove line">✕</button>}
              </span>
            </Field>
          ))}
          {canEdit && b.labels.length < 3 && <button type="button" className="dz-tb" onClick={() => set({ labels: [...b.labels, "Signature"] })}>＋ Add a line</button>}
          <div className="dz-grid2">
            <Field label="Size (pt)"><NumBox value={b.size} min={LIMITS.pt[0]} max={LIMITS.pt[1]} onChange={(n) => set({ size: n })} /></Field>
            <Field label="Space above (mm)"><NumBox value={b.gapMm} min={4} max={60} step={1} onChange={(n) => set({ gapMm: n })} /></Field>
          </div>
        </>
      );
  }
}
