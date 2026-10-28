"use client";

// The label designer: a canvas in millimetres where text, barcodes, QR codes, logos, boxes and lines
// are dragged, resized and styled. Works with a mouse and with a finger.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  LIMITS, alignEls, checkDoc, distributeEls, duplicateItems, matchSize, newDateCorner, newLabelEl, newWeightDate, r1, reorder, resizeBox, resizeLabel, snapBox, snapTo,
  type AlignMode, type Box, type Handle, type LabelDoc, type LabelEl, type LabelElType, type Order, type Rot, type TokenData,
} from "@/lib/labelTemplate";
import { LABEL_SIZES } from "@/lib/printSizes";
import { LabelView } from "@/components/barrels/designer/render";
import { AlignSeg, Field, FontSelect, NumBox, Seg, Toggle, TokenText, VAlignSeg } from "@/components/barrels/designer/fields";
import { fileToLogo } from "@/components/barrels/designer/logo";

const PX = 96 / 25.4; // CSS pixels per mm
const HANDLES: Handle[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];
const ADD: { t: LabelElType; icon: string; name: string }[] = [
  { t: "text", icon: "T", name: "Text" },
  { t: "barcode", icon: "▮▯▮", name: "Barcode" },
  { t: "qr", icon: "▦", name: "QR code" },
  { t: "rect", icon: "▭", name: "Box" },
  { t: "line", icon: "—", name: "Line" },
];

const summary = (e: LabelEl) => {
  switch (e.type) {
    case "text": return `“${e.text.replace(/\s+/g, " ").slice(0, 22) || "empty"}”`;
    case "barcode": return `Barcode ${e.value}`;
    case "qr": return "QR code";
    case "image": return "Logo / picture";
    case "rect": return e.fill ? "Black box" : "Box";
    case "line": return "Line";
  }
};
const icon = (e: LabelEl) => ({ text: "T", barcode: "▮▯▮", qr: "▦", image: "🖼", rect: "▭", line: "—" })[e.type];

interface Drag {
  mode: "move" | "resize" | "marquee";
  handle?: Handle;
  sx: number;
  sy: number;
  start: LabelDoc;
  ids: string[];
  moved: boolean;
  toggleId?: string;
}

export interface LabelEditorProps {
  doc: LabelDoc;
  data: TokenData;
  readOnly: boolean;
  onChange: (next: LabelDoc, key?: string | null) => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onResetStandard: () => void;
}

export default function LabelEditor({ doc, data, readOnly, onChange, onUndo, onRedo, canUndo, canRedo, onResetStandard }: LabelEditorProps) {
  const [sel, setSel] = useState<string[]>([]);
  const [draft, setDraft] = useState<LabelDoc | null>(null);
  const [guides, setGuides] = useState<{ x: number[]; y: number[] }>({ x: [], y: [] });
  const [marquee, setMarquee] = useState<Box | null>(null);
  const [grid, setGrid] = useState(0.5);
  const [magnets, setMagnets] = useState(true);
  const [zoomIn, setZoomIn] = useState<number | null>(null);
  const [wrapW, setWrapW] = useState(600);
  const [msg, setMsg] = useState<string | null>(null);
  const [bw, setBw] = useState(true);
  const wrap = useRef<HTMLDivElement>(null);
  const paper = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const replaceId = useRef<string | null>(null);

  const view = draft ?? doc;
  const W = doc.widthMm;
  const H = doc.heightMm;

  // keep the selection to items that still exist (undo / delete)
  useEffect(() => {
    setSel((s) => {
      const keep = s.filter((id) => doc.els.some((e) => e.id === id));
      return keep.length === s.length ? s : keep;
    });
  }, [doc]);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWrapW(el.clientWidth));
    ro.observe(el);
    setWrapW(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const fitZ = Math.max(0.5, Math.min(12, Math.min((wrapW - 28) / (W * PX), 520 / (H * PX))));
  const zoom = zoomIn ?? fitZ;
  const s = PX * zoom; // screen pixels per mm

  const warnings = useMemo(() => checkDoc(doc, data), [doc, data]);
  const selEls = view.els.filter((e) => sel.includes(e.id));
  const one = selEls.length === 1 ? selEls[0] : null;

  // ---- editing helpers --------------------------------------------------
  const commit = useCallback((els: LabelEl[], key?: string | null) => onChange({ ...doc, els }, key), [doc, onChange]);
  const patch = (id: string, p: Partial<LabelEl>, key?: string) => commit(doc.els.map((e) => (e.id === id ? ({ ...e, ...p } as LabelEl) : e)), key ?? `p:${id}:${Object.keys(p).join(",")}`);
  const remove = (ids: string[]) => {
    commit(doc.els.filter((e) => !ids.includes(e.id)));
    setSel([]);
  };
  const add = (t: LabelElType) => {
    if (doc.els.length >= LIMITS.maxEls) return setMsg(`A label can hold at most ${LIMITS.maxEls} items.`);
    const e = newLabelEl(t, doc);
    commit([...doc.els, e]);
    setSel([e.id]);
    setMsg(null);
  };
  const addWeightDate = () => {
    if (doc.els.length + 2 > LIMITS.maxEls) return setMsg(`A label can hold at most ${LIMITS.maxEls} items.`);
    const two = newWeightDate(doc);
    commit([...doc.els, ...two]);
    setSel(two.map((e) => e.id));
    setMsg(null);
  };
  const addDateCorner = () => {
    if (doc.els.length >= LIMITS.maxEls) return setMsg(`A label can hold at most ${LIMITS.maxEls} items.`);
    const e = newDateCorner(doc);
    commit([...doc.els, e]);
    setSel([e.id]);
    setMsg(null);
  };
  const duplicate = (ids: string[]) => {
    if (doc.els.length + ids.length > LIMITS.maxEls) return setMsg(`A label can hold at most ${LIMITS.maxEls} items.`);
    const r = duplicateItems(doc.els, ids);
    commit(r.list);
    setSel(r.ids);
  };
  const nudge = (dx: number, dy: number) => {
    if (!sel.length) return;
    commit(doc.els.map((e) => (sel.includes(e.id) ? { ...e, x: r1(Math.min(W - e.w, Math.max(0, e.x + dx))), y: r1(Math.min(H - e.h, Math.max(0, e.y + dy))) } : e)), `nudge:${sel.join(",")}`);
  };

  const pickLogo = async (file: File | undefined) => {
    if (!file) return;
    try {
      const src = await fileToLogo(file, { blackWhite: bw });
      const dim = await new Promise<{ w: number; h: number }>((res) => {
        const i = new Image();
        i.onload = () => res({ w: i.naturalWidth, h: i.naturalHeight });
        i.onerror = () => res({ w: 1, h: 1 });
        i.src = src;
      });
      if (replaceId.current) {
        patch(replaceId.current, { src } as Partial<LabelEl>, "logo");
        replaceId.current = null;
      } else {
        if (doc.els.length >= LIMITS.maxEls) return setMsg(`A label can hold at most ${LIMITS.maxEls} items.`);
        const e = newLabelEl("image", doc);
        const scale = (Math.min(W, H) * 0.45) / Math.max(dim.w, dim.h);
        const w = r1(Math.max(4, Math.min(W - 1, dim.w * scale)));
        const h = r1(Math.max(4, Math.min(H - 1, w * (dim.h / dim.w))));
        commit([...doc.els, { ...e, src, w, h, x: r1((W - w) / 2), y: r1((H - h) / 2) } as LabelEl]);
        setSel([e.id]);
      }
      setMsg(null);
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Could not use that picture.");
    }
  };

  // ---- pointer drag -------------------------------------------------------
  const beginMove = (e: React.PointerEvent, id: string) => {
    if (readOnly) return setSel([id]);
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const additive = e.shiftKey || e.ctrlKey || e.metaKey;
    let ids = sel;
    let toggleId: string | undefined;
    if (!sel.includes(id)) ids = additive ? [...sel, id] : [id];
    else if (additive) toggleId = id;
    setSel(ids);
    drag.current = { mode: "move", sx: e.clientX, sy: e.clientY, start: doc, ids, moved: false, toggleId };
    wrap.current?.focus({ preventScroll: true });
  };
  const beginResize = (e: React.PointerEvent, handle: Handle) => {
    if (readOnly || !one) return;
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { mode: "resize", handle, sx: e.clientX, sy: e.clientY, start: doc, ids: [one.id], moved: false };
  };
  const beginMarquee = (e: React.PointerEvent) => {
    if (e.target !== e.currentTarget) return;
    wrap.current?.focus({ preventScroll: true });
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const r = paper.current?.getBoundingClientRect();
    if (!r) return;
    const x = (e.clientX - r.left) / s;
    const y = (e.clientY - r.top) / s;
    drag.current = { mode: "marquee", sx: x, sy: y, start: doc, ids: [], moved: false };
    if (!(e.shiftKey || e.ctrlKey || e.metaKey)) setSel([]);
  };

  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    if (d.mode === "marquee") {
      const r = paper.current?.getBoundingClientRect();
      if (!r) return;
      const x = (e.clientX - r.left) / s;
      const y = (e.clientY - r.top) / s;
      if (Math.abs(x - d.sx) + Math.abs(y - d.sy) > 1) d.moved = true;
      const box = { x: Math.min(x, d.sx), y: Math.min(y, d.sy), w: Math.abs(x - d.sx), h: Math.abs(y - d.sy) };
      setMarquee(box);
      setSel(d.start.els.filter((el) => el.x < box.x + box.w && el.x + el.w > box.x && el.y < box.y + box.h && el.y + el.h > box.y).map((el) => el.id));
      return;
    }
    const dx = (e.clientX - d.sx) / s;
    const dy = (e.clientY - d.sy) / s;
    if (!d.moved && Math.hypot(e.clientX - d.sx, e.clientY - d.sy) < 3) return;
    d.moved = true;
    if (d.mode === "resize" && d.handle) {
      const el = d.start.els.find((x) => x.id === d.ids[0]);
      if (!el) return;
      const box = resizeBox(el, d.handle, dx, dy, { W, H, grid, min: el.type === "line" ? 0.3 : 2, keepRatio: el.type === "qr" || el.type === "image" || e.shiftKey });
      const lineKeep = el.type === "line" ? (el.w >= el.h ? { y: el.y, h: el.h } : { x: el.x, w: el.w }) : {};
      setDraft({ ...d.start, els: d.start.els.map((x) => (x.id === el.id ? ({ ...x, ...box, ...lineKeep } as LabelEl) : x)) });
      return;
    }
    // move
    const moving = d.start.els.filter((x) => d.ids.includes(x.id));
    if (!moving.length) return;
    const bb: Box = { x: Math.min(...moving.map((m) => m.x)), y: Math.min(...moving.map((m) => m.y)), w: 0, h: 0 };
    bb.w = Math.max(...moving.map((m) => m.x + m.w)) - bb.x;
    bb.h = Math.max(...moving.map((m) => m.y + m.h)) - bb.y;
    let nx = bb.x + dx;
    let ny = bb.y + dy;
    let gx: number[] = [];
    let gy: number[] = [];
    if (grid > 0) {
      nx = snapTo(nx, grid);
      ny = snapTo(ny, grid);
    }
    if (magnets && !e.altKey) {
      const others = d.start.els.filter((x) => !d.ids.includes(x.id));
      const sn = snapBox({ ...bb, x: nx, y: ny }, others, W, H, 5 / s);
      nx += sn.dx;
      ny += sn.dy;
      gx = sn.guidesX;
      gy = sn.guidesY;
    }
    nx = Math.min(W - bb.w, Math.max(0, nx));
    ny = Math.min(H - bb.h, Math.max(0, ny));
    const ox = nx - bb.x;
    const oy = ny - bb.y;
    setGuides({ x: gx, y: gy });
    setDraft({ ...d.start, els: d.start.els.map((x) => (d.ids.includes(x.id) ? { ...x, x: r1(x.x + ox), y: r1(x.y + oy) } : x)) });
  };

  const onUp = () => {
    const d = drag.current;
    drag.current = null;
    setMarquee(null);
    setGuides({ x: [], y: [] });
    if (!d) return;
    if (d.mode === "move" && !d.moved && d.toggleId) setSel((v) => v.filter((id) => id !== d.toggleId));
    if (d.mode === "marquee" && !d.moved) setSel([]);
    if (draft && d.moved) onChange(draft);
    setDraft(null);
  };

  // ---- keyboard -------------------------------------------------------------
  const onKey = (e: React.KeyboardEvent) => {
    const t = e.target as HTMLElement;
    if (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT") return;
    const mod = e.ctrlKey || e.metaKey;
    const step = e.shiftKey ? 2 : grid > 0 ? grid : 0.5;
    if (mod && e.key.toLowerCase() === "z") {
      e.preventDefault();
      return e.shiftKey ? onRedo() : onUndo();
    }
    if (mod && e.key.toLowerCase() === "y") {
      e.preventDefault();
      return onRedo();
    }
    if (readOnly) return;
    if (mod && e.key.toLowerCase() === "a") {
      e.preventDefault();
      return setSel(doc.els.map((x) => x.id));
    }
    if (mod && e.key.toLowerCase() === "d") {
      e.preventDefault();
      return sel.length ? duplicate(sel) : undefined;
    }
    if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      return sel.length ? remove(sel) : undefined;
    }
    if (e.key === "Escape") return setSel([]);
    const dirs: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    if (dirs[e.key]) {
      e.preventDefault();
      nudge(...dirs[e.key]);
    }
  };

  // ---- properties -------------------------------------------------------------
  const align = (m: AlignMode) => commit(alignEls(doc.els, sel, m, W, H));
  const order = (o: Order) => commit(reorder(doc.els, sel, o));
  const canEdit = !readOnly;

  const text = one?.type === "text" ? one : null;
  const setSize = (w: number, h: number) => onChange(resizeLabel(doc, w, h), "paper");

  return (
    <div className="dz-editor">
      <div className="dz-toolbar" role="toolbar" aria-label="Label tools">
        {canEdit && (
          <>
            <span className="dz-grp">
              {ADD.map((a) => (
                <button key={a.t} type="button" className="dz-tb" onClick={() => add(a.t)} title={`Add ${a.name.toLowerCase()}`}>
                  <b>{a.icon}</b> {a.name}
                </button>
              ))}
              <button type="button" className="dz-tb" onClick={addWeightDate} title="Add the empty weight on top and its date just below, as two separate items">
                <b>⚖</b> Weight + date
              </button>
              <button type="button" className="dz-tb" onClick={addDateCorner} title="Add just the date, small, in the top right corner">
                <b>📅</b> Date
              </button>
              <button type="button" className="dz-tb" onClick={() => { replaceId.current = null; fileRef.current?.click(); }} title="Add a logo or picture">
                <b>🖼</b> Logo
              </button>
              <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden onChange={(e) => { void pickLogo(e.target.files?.[0]); e.target.value = ""; }} />
            </span>
            <span className="dz-grp">
              <button type="button" className="dz-tb" disabled={!canUndo} onClick={onUndo} title="Undo (Ctrl+Z)">↶ Undo</button>
              <button type="button" className="dz-tb" disabled={!canRedo} onClick={onRedo} title="Redo (Ctrl+Y)">↷ Redo</button>
            </span>
            <span className="dz-grp">
              <button type="button" className="dz-tb" disabled={!sel.length} onClick={() => duplicate(sel)} title="Copy (Ctrl+D)">⧉ Copy</button>
              <button type="button" className="dz-tb danger" disabled={!sel.length} onClick={() => remove(sel)} title="Delete">🗑 Delete</button>
            </span>
          </>
        )}
        <span className="dz-grp">
          <button type="button" className="dz-tb" onClick={() => setZoomIn(Math.max(0.5, zoom / 1.25))} aria-label="Zoom out">−</button>
          <button type="button" className="dz-tb" onClick={() => setZoomIn(null)} title="Fit to the screen">{Math.round(zoom * 100)}%</button>
          <button type="button" className="dz-tb" onClick={() => setZoomIn(Math.min(14, zoom * 1.25))} aria-label="Zoom in">＋</button>
        </span>
        <span className="dz-grp">
          <label className="dz-inl">Snap <select value={grid} onChange={(e) => setGrid(Number(e.target.value))}><option value={0}>off</option><option value={0.5}>0.5 mm</option><option value={1}>1 mm</option><option value={2}>2 mm</option></select></label>
          <Toggle on={magnets} onChange={setMagnets} title="Lines up with the edges and centre of the label and other items">Guides</Toggle>
        </span>
      </div>
      {msg && <div className="bd-err">{msg}</div>}

      <div className="dz-main">
        <div className="dz-canvas" ref={wrap} tabIndex={0} onKeyDown={onKey} aria-label="Label canvas">
          <div className="dz-paper" ref={paper} style={{ width: W * s, height: H * s }}>
            <div style={{ transform: `scale(${zoom})`, transformOrigin: "0 0", width: `${W}mm`, height: `${H}mm`, pointerEvents: "none" }}>
              <LabelView doc={view} data={data} />
            </div>
            <div className="dz-overlay" onPointerDown={beginMarquee} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
              {view.els.map((e) => {
                const on = sel.includes(e.id);
                return (
                  <div
                    key={e.id}
                    className={`dz-box${on ? " on" : ""}`}
                    style={{ left: e.x * s, top: e.y * s, width: Math.max(e.w * s, 6), height: Math.max(e.h * s, 6) }}
                    onPointerDown={(ev) => beginMove(ev, e.id)}
                    onDoubleClick={() => e.type === "text" && setTimeout(() => textRef.current?.focus(), 0)}
                    title={summary(e)}
                  >
                    {on && one?.id === e.id && canEdit && HANDLES.map((h) => <i key={h} className={`dz-h ${h}`} onPointerDown={(ev) => beginResize(ev, h)} />)}
                  </div>
                );
              })}
              {guides.x.map((g, i) => <b key={`gx${i}`} className="dz-guide v" style={{ left: g * s }} />)}
              {guides.y.map((g, i) => <b key={`gy${i}`} className="dz-guide h" style={{ top: g * s }} />)}
              {marquee && <div className="dz-marquee" style={{ left: marquee.x * s, top: marquee.y * s, width: marquee.w * s, height: marquee.h * s }} />}
            </div>
          </div>
          <div className="dz-hint">
            {W} × {H} mm · {canEdit ? "tap an item to select it, drag to move, drag the dots to resize. Arrow keys nudge, Delete removes." : "You can look but not change: only the owner edits layouts."}
          </div>
        </div>

        <aside className="dz-props" aria-label="Properties">
          {warnings.length > 0 && (
            <ul className="dz-warn">
              {warnings.map((w) => <li key={w}>⚠ {w}</li>)}
            </ul>
          )}

          {!sel.length && (
            <>
              <h3>Label paper</h3>
              <div className="dz-grid2">
                <Field label="Width (mm)"><NumBox value={W} min={LIMITS.labelW[0]} max={LIMITS.labelW[1]} step={1} onChange={(n) => canEdit && setSize(n, H)} /></Field>
                <Field label="Height (mm)"><NumBox value={H} min={LIMITS.labelH[0]} max={LIMITS.labelH[1]} step={1} onChange={(n) => canEdit && setSize(W, n)} /></Field>
              </div>
              {canEdit && (
                <Field label="Common sizes" wide>
                  <select value="" onChange={(e) => { const z = LABEL_SIZES.find((x) => x.id === e.target.value); if (z && z.h) setSize(z.w, z.h); }}>
                    <option value="">Change to…</option>
                    {LABEL_SIZES.filter((z) => z.h && z.cls !== "a4").map((z) => <option key={z.id} value={z.id}>{z.name}</option>)}
                  </select>
                </Field>
              )}
              <p className="bd-m small">Changing the size scales everything with it. Select an item to change it; drag on an empty spot to select several.</p>
              {canEdit && <button type="button" className="bd-btn" onClick={onResetStandard}>↺ Start again from the standard layout</button>}
            </>
          )}

          {sel.length > 1 && canEdit && (
            <>
              <h3>{sel.length} items selected</h3>
              <div className="dz-grp wrapgrp">
                {([["left", "⇤ Left"], ["hcenter", "↔ Centre"], ["right", "⇥ Right"], ["top", "⇧ Top"], ["vcenter", "↕ Middle"], ["bottom", "⇩ Bottom"]] as [AlignMode, string][]).map(([m, t]) => (
                  <button key={m} type="button" className="dz-tb" onClick={() => align(m)}>{t}</button>
                ))}
              </div>
              {sel.length > 2 && (
                <div className="dz-grp">
                  <button type="button" className="dz-tb" onClick={() => commit(distributeEls(doc.els, sel, "h"))}>Space evenly ↔</button>
                  <button type="button" className="dz-tb" onClick={() => commit(distributeEls(doc.els, sel, "v"))}>Space evenly ↕</button>
                  <button type="button" className="dz-tb" onClick={() => commit(matchSize(doc.els, sel, "w", W, H))} title="Make all the chosen items as wide as the first one you chose">Same width</button>
                  <button type="button" className="dz-tb" onClick={() => commit(matchSize(doc.els, sel, "h", W, H))} title="Make all the chosen items as tall as the first one you chose">Same height</button>
                </div>
              )}
              <div className="dz-grp">
                <button type="button" className="dz-tb" onClick={() => order("front")}>Bring to front</button>
                <button type="button" className="dz-tb" onClick={() => order("back")}>Send to back</button>
              </div>
            </>
          )}

          {one && (
            <>
              <h3>{summary(one)}</h3>
              {text && (
                <>
                  <Field label="Text (use fields like {code})" wide>
                    <TokenText kind="label" multiline rows={2} areaRef={textRef} value={text.text} onChange={(v) => canEdit && patch(text.id, { text: v } as Partial<LabelEl>, `t:${text.id}`)} />
                  </Field>
                  <Field label="Font" wide><FontSelect value={text.font} onChange={(v) => canEdit && patch(text.id, { font: v } as Partial<LabelEl>)} /></Field>
                  <div className="dz-grid2">
                    <Field label="Size (pt)"><NumBox value={text.size} min={LIMITS.pt[0]} max={LIMITS.pt[1]} step={0.5} onChange={(n) => canEdit && patch(text.id, { size: n } as Partial<LabelEl>)} /></Field>
                    <Field label="Style">
                      <span className="dz-grp">
                        <Toggle on={text.bold} onChange={(v) => canEdit && patch(text.id, { bold: v } as Partial<LabelEl>)} title="Bold"><b>B</b></Toggle>
                        <Toggle on={text.italic} onChange={(v) => canEdit && patch(text.id, { italic: v } as Partial<LabelEl>)} title="Italic"><i>I</i></Toggle>
                        <Toggle on={!!text.underline} onChange={(v) => canEdit && patch(text.id, { underline: v || undefined } as Partial<LabelEl>)} title="Underline"><u>U</u></Toggle>
                      </span>
                    </Field>
                    <Field label="Background">
                      <Seg label="Background" value={text.invert ? "black" : "none"} onChange={(v) => canEdit && patch(text.id, { invert: v === "black" } as Partial<LabelEl>)} options={[{ v: "none", t: "None", title: "No background: black letters on the white label" }, { v: "black", t: "Black", title: "Black box with white letters" }]} />
                    </Field>
                    <Field label="Frame (mm)"><NumBox value={text.border ?? 0} min={0} max={1.5} step={0.1} onChange={(n) => canEdit && patch(text.id, { border: n || undefined } as Partial<LabelEl>)} /></Field>
                    <Field label="Across"><AlignSeg value={text.align} onChange={(v) => canEdit && patch(text.id, { align: v } as Partial<LabelEl>)} /></Field>
                    <Field label="Up / down"><VAlignSeg value={text.valign} onChange={(v) => canEdit && patch(text.id, { valign: v } as Partial<LabelEl>)} /></Field>
                  </div>
                  <Toggle on={text.fit} onChange={(v) => canEdit && patch(text.id, { fit: v } as Partial<LabelEl>)} title="Makes the letters smaller, if needed, so the text fits the box on one line">Shrink to fit one line</Toggle>
                </>
              )}
              {one.type === "barcode" && (
                <>
                  <Field label="Barcode text" wide><TokenText kind="label" value={one.value} onChange={(v) => canEdit && patch(one.id, { value: v } as Partial<LabelEl>, `v:${one.id}`)} /></Field>
                  <Toggle on={one.human} onChange={(v) => canEdit && patch(one.id, { human: v } as Partial<LabelEl>)}>Print the text under the bars</Toggle>
                  <p className="bd-m small">Bars are drawn in whole printer dots so a 203 dpi printer prints them sharp. Wider is easier to scan.</p>
                </>
              )}
              {one.type === "qr" && <Field label="QR text" wide><TokenText kind="label" value={one.value} onChange={(v) => canEdit && patch(one.id, { value: v } as Partial<LabelEl>, `v:${one.id}`)} /></Field>}
              {one.type === "image" && (
                <>
                  <Field label="Fit" wide><Seg value={one.fit} onChange={(v) => canEdit && patch(one.id, { fit: v } as Partial<LabelEl>)} options={[{ v: "contain", t: "Whole picture" }, { v: "cover", t: "Fill the box" }]} /></Field>
                  {canEdit && (
                    <>
                      <label className="dz-inl"><input type="checkbox" checked={bw} onChange={(e) => setBw(e.target.checked)} /> Make it black &amp; white (best for thermal printers)</label>
                      <button type="button" className="bd-btn" onClick={() => { replaceId.current = one.id; fileRef.current?.click(); }}>Choose another picture…</button>
                    </>
                  )}
                </>
              )}
              {one.type === "rect" && (
                <div className="dz-grid2">
                  <Field label="Border (mm)"><NumBox value={one.stroke} min={0} max={3} step={0.1} onChange={(n) => canEdit && patch(one.id, { stroke: n } as Partial<LabelEl>)} /></Field>
                  <Field label="Round corners (mm)"><NumBox value={one.radius} min={0} max={20} step={0.5} onChange={(n) => canEdit && patch(one.id, { radius: n } as Partial<LabelEl>)} /></Field>
                  <Field label="Fill"><Toggle on={one.fill} onChange={(v) => canEdit && patch(one.id, { fill: v } as Partial<LabelEl>)}>Solid black</Toggle></Field>
                </div>
              )}
              {one.type === "line" && <Field label="Thickness (mm)"><NumBox value={one.thick} min={0.1} max={5} step={0.1} onChange={(n) => canEdit && patch(one.id, { thick: n } as Partial<LabelEl>)} /></Field>}

              {(one.type === "text" || one.type === "barcode" || one.type === "qr" || one.type === "image") && (
                <Field label="Turn (degrees)" wide>
                  <Seg label="Turn" value={String(one.rot ?? 0)} onChange={(v) => canEdit && patch(one.id, { rot: (Number(v) || undefined) as Rot | undefined } as Partial<LabelEl>)} options={[{ v: "0", t: "0°", title: "Upright" }, { v: "90", t: "90°", title: "Turn a quarter clockwise" }, { v: "180", t: "180°", title: "Upside down" }, { v: "270", t: "270°", title: "Turn a quarter anticlockwise" }]} />
                </Field>
              )}
              <h4>Position and size (mm)</h4>
              <div className="dz-grid4">
                <Field label="Left"><NumBox value={one.x} min={0} max={Math.max(0, W - one.w)} onChange={(n) => canEdit && patch(one.id, { x: n })} /></Field>
                <Field label="Top"><NumBox value={one.y} min={0} max={Math.max(0, H - one.h)} onChange={(n) => canEdit && patch(one.id, { y: n })} /></Field>
                <Field label="Width"><NumBox value={one.w} min={0.5} max={W - one.x} onChange={(n) => canEdit && patch(one.id, { w: n })} /></Field>
                <Field label="Height"><NumBox value={one.h} min={0.5} max={H - one.y} onChange={(n) => canEdit && patch(one.id, { h: n })} /></Field>
              </div>
              {canEdit && (
                <>
                  <div className="dz-grp wrapgrp">
                    {([["left", "⇤"], ["hcenter", "↔"], ["right", "⇥"], ["top", "⇧"], ["vcenter", "↕"], ["bottom", "⇩"]] as [AlignMode, string][]).map(([m, t]) => (
                      <button key={m} type="button" className="dz-tb" title={`Align to the label: ${m}`} onClick={() => align(m)}>{t}</button>
                    ))}
                  </div>
                  <div className="dz-grp">
                    <button type="button" className="dz-tb" onClick={() => order("forward")}>Forward</button>
                    <button type="button" className="dz-tb" onClick={() => order("backward")}>Backward</button>
                    <button type="button" className="dz-tb" onClick={() => order("front")}>To front</button>
                    <button type="button" className="dz-tb" onClick={() => order("back")}>To back</button>
                  </div>
                </>
              )}
            </>
          )}

          <h4>Items on this label</h4>
          <ol className="dz-layers">
            {[...doc.els].reverse().map((e) => (
              <li key={e.id} className={sel.includes(e.id) ? "on" : ""}>
                <button type="button" onClick={(ev) => setSel(ev.shiftKey ? (sel.includes(e.id) ? sel.filter((i) => i !== e.id) : [...sel, e.id]) : [e.id])}>
                  <b>{icon(e)}</b> {summary(e)}
                </button>
              </li>
            ))}
            {!doc.els.length && <li className="bd-m small">Nothing yet. Add text, a barcode or a QR code from the bar above.</li>}
          </ol>
        </aside>
      </div>
    </div>
  );
}
