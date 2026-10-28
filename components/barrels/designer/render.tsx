"use client";

// Draws a designer layout. The same drawing is used in the designer, in the print window and in
// the picture sent to the printer, so what is designed is what comes out.
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { code128Ok, code128Svg } from "@/lib/code128";
import { qrSvg } from "@/lib/qr";
import { fontStack, parseSpec } from "@/lib/fonts";
import { injectFontFaces, loadFonts } from "@/lib/fontLoad";
import { barcodeDots, docFontSpec, fillTokens, qrFit, type BarcodeEl, type BarcodeBlock, type ColsBlock, type KvBlock, type LabelDoc, type LabelEl, type QrBlock, type QrEl, type SlipBlock, type SlipDoc, type TemplateDoc, type TextBlock, type TextEl, type TokenData } from "@/lib/labelTemplate";
import { customSize, type PaperSize } from "@/lib/printSizes";

const INK = { WebkitPrintColorAdjust: "exact", printColorAdjust: "exact" } as React.CSSProperties;

/** The paper a layout prints on. */
export function templatePaper(doc: TemplateDoc): PaperSize | null {
  return doc.kind === "label" ? customSize(doc.widthMm, doc.heightMm) : customSize(doc.widthMm, null, true);
}

/** @page rule for a layout (labels fill the paper; slips keep their own margin). */
export function templatePageCss(doc: TemplateDoc): string {
  if (doc.kind === "label") return `@page { size: ${doc.widthMm}mm ${doc.heightMm}mm; margin: 0 }`;
  return `@page { size: ${doc.widthMm}mm auto; margin: ${doc.marginMm}mm }`;
}

/** Loads the fonts a layout needs and returns a number that changes when they arrive (so text refits). */
export function useTemplateFonts(spec: string): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    injectFontFaces();
    let live = true;
    loadFonts(parseSpec(spec)).then(() => live && setTick((t) => t + 1));
    return () => {
      live = false;
    };
  }, [spec]);
  return tick;
}

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------
function Bars({ value, widthMm, heightMm, align = "center" }: { value: string; widthMm: number; heightMm: number; align?: "left" | "center" | "right" }) {
  if (!code128Ok(value)) {
    return <div style={{ fontSize: "5pt", color: "#000", border: "0.2mm dashed #000", padding: "0.5mm", boxSizing: "border-box", width: `${widthMm}mm`, height: `${heightMm}mm`, overflow: "hidden" }}>{`No barcode: "${value.slice(0, 18)}" cannot be drawn`}</div>;
  }
  const fit = barcodeDots(widthMm, value);
  const w = fit ? Math.min(widthMm, fit.widthMm) : widthMm;
  const { svg } = code128Svg(value, { moduleWidth: 1, height: 10 });
  // built by our own encoder from a validated string
  const html = svg.replace("<svg ", '<svg preserveAspectRatio="none" style="width:100%;height:100%;display:block" ');
  const justify = align === "left" ? "flex-start" : align === "right" ? "flex-end" : "center";
  return (
    <div style={{ width: `${widthMm}mm`, height: `${heightMm}mm`, display: "flex", justifyContent: justify }}>
      <div style={{ width: `${w}mm`, height: "100%", lineHeight: 0 }} dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}

function QrBox({ value, boxMm }: { value: string; boxMm: number }) {
  let svg = "";
  try {
    svg = qrSvg(value || " ", { moduleSize: 1 }).svg.replace("<svg ", '<svg style="width:100%;height:100%;display:block" ');
  } catch {
    return <div style={{ fontSize: "5pt", width: `${boxMm}mm`, height: `${boxMm}mm`, border: "0.2mm dashed #000", boxSizing: "border-box", overflow: "hidden" }}>QR text too long</div>;
  }
  const size = qrFit(boxMm, value).sizeMm;
  return <div style={{ width: `${size}mm`, height: `${size}mm`, lineHeight: 0 }} dangerouslySetInnerHTML={{ __html: svg }} />;
}

/** Text that shrinks to fit its box on one line (and a plain wrapping box when `fit` is off). */
function FitText({ text, el, tick }: { text: string; el: TextEl; tick: number }) {
  const box = useRef<HTMLDivElement>(null);
  const span = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const b = box.current;
    const s = span.current;
    if (!b || !s || !el.fit) return;
    const fits = (pt: number) => {
      s.style.fontSize = `${pt}pt`;
      return s.scrollWidth <= b.clientWidth + 0.5 && s.scrollHeight <= b.clientHeight + 0.5;
    };
    let lo = 3;
    let hi = el.size;
    if (fits(hi)) return;
    for (let i = 0; i < 9; i++) {
      const mid = (lo + hi) / 2;
      if (fits(mid)) lo = mid;
      else hi = mid;
    }
    s.style.fontSize = `${Math.floor(lo * 20) / 20}pt`;
  }, [text, el.fit, el.size, el.w, el.h, el.font, el.bold, el.italic, tick]);
  const justify = el.align === "left" ? "flex-start" : el.align === "right" ? "flex-end" : "center";
  const items = el.valign === "top" ? "flex-start" : el.valign === "bottom" ? "flex-end" : "center";
  return (
    <div ref={box} style={{ position: "absolute", inset: 0, display: "flex", justifyContent: justify, alignItems: items, overflow: "hidden", padding: el.invert ? "0 0.6mm" : 0, boxSizing: "border-box" }}>
      <span ref={span} style={{ fontSize: `${el.size}pt`, whiteSpace: el.fit ? "nowrap" : "pre-wrap", wordBreak: "break-word", textAlign: el.align, maxWidth: "100%", lineHeight: 1.15 }}>
        {text}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Label
// ---------------------------------------------------------------------------
export function LabelView({ doc, data, extraClass = "", tick: tickIn }: { doc: LabelDoc; data: TokenData; extraClass?: string; tick?: number }) {
  const spec = docFontSpec(doc, data);
  const own = useTemplateFonts(spec);
  const tick = (tickIn ?? 0) + own;
  return (
    <div className={`bd-label bd-tpl ${extraClass}`} data-fonts={spec} style={{ width: `${doc.widthMm}mm`, height: `${doc.heightMm}mm`, position: "relative", display: "block", padding: 0, overflow: "hidden", background: "#fff", color: "#000", fontFamily: fontStack("sans") }}>
      {doc.els.map((e) => (
        <div key={e.id} data-el={e.id} style={elBox(e)}>
          <LabelElView el={e} data={data} tick={tick} />
        </div>
      ))}
    </div>
  );
}

const elBox = (e: LabelEl): React.CSSProperties => ({ position: "absolute", left: `${e.x}mm`, top: `${e.y}mm`, width: `${e.w}mm`, height: `${e.h}mm`, boxSizing: "border-box", ...INK });

function LabelElView({ el, data, tick }: { el: LabelEl; data: TokenData; tick: number }) {
  switch (el.type) {
    case "text": {
      const text = fillTokens(el.text, data).text;
      return (
        <div style={{ position: "absolute", inset: 0, background: el.invert ? "#000" : "transparent", color: el.invert ? "#fff" : "#000", fontFamily: fontStack(el.font), fontWeight: el.bold ? 700 : 400, fontStyle: el.italic ? "italic" : "normal", ...INK }}>
          <FitText text={text} el={el} tick={tick} />
        </div>
      );
    }
    case "barcode":
      return <BarcodeElView el={el} data={data} />;
    case "qr":
      return <QrElView el={el} data={data} />;
    case "image":
      // eslint-disable-next-line @next/next/no-img-element
      return <img src={el.src} alt="" style={{ width: "100%", height: "100%", objectFit: el.fit, display: "block" }} />;
    case "rect":
      return <div style={{ position: "absolute", inset: 0, border: el.stroke > 0 ? `${el.stroke}mm solid #000` : "none", background: el.fill ? "#000" : "transparent", borderRadius: `${el.radius}mm`, boxSizing: "border-box", ...INK }} />;
    case "line": {
      const horizontal = el.w >= el.h;
      return <div style={horizontal ? { position: "absolute", left: 0, right: 0, top: "50%", height: `${el.thick}mm`, transform: "translateY(-50%)", background: "#000", ...INK } : { position: "absolute", top: 0, bottom: 0, left: "50%", width: `${el.thick}mm`, transform: "translateX(-50%)", background: "#000", ...INK }} />;
    }
  }
}

function BarcodeElView({ el, data }: { el: BarcodeEl; data: TokenData }) {
  const value = fillTokens(el.value, data).text;
  const textMm = el.human ? Math.min(4, Math.max(2.2, el.h * 0.22)) : 0;
  return (
    <div style={{ position: "absolute", inset: 0 }}>
      <Bars value={value} widthMm={el.w} heightMm={el.h - textMm} />
      {el.human && <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: `${textMm}mm`, textAlign: "center", fontFamily: fontStack("sans"), fontSize: `${textMm * 2.835 * 0.8}pt`, lineHeight: `${textMm}mm`, whiteSpace: "nowrap", overflow: "hidden" }}>{value}</div>}
    </div>
  );
}

function QrElView({ el, data }: { el: QrEl; data: TokenData }) {
  const value = fillTokens(el.value, data).text;
  return (
    <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <QrBox value={value} boxMm={Math.min(el.w, el.h)} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Slip
// ---------------------------------------------------------------------------
const justifyOf = (a: "left" | "center" | "right") => (a === "left" ? "flex-start" : a === "right" ? "flex-end" : "center");

export function SlipView({ doc, data, extraClass = "", selectedId }: { doc: SlipDoc; data: TokenData; extraClass?: string; selectedId?: string | null }) {
  const spec = docFontSpec(doc, data);
  useTemplateFonts(spec);
  const inner = doc.widthMm - 2 * doc.marginMm;
  return (
    <div className={`bd-slip bd-tpl ${extraClass}`} data-fonts={spec} style={{ width: `${inner}mm`, padding: 0, background: "#fff", color: "#000", fontFamily: fontStack("sans"), display: "flex", flexDirection: "column", gap: "0.8mm", boxSizing: "border-box", lineHeight: 1.2 }}>
      {doc.blocks.map((b) => {
        const node = BlockView({ block: b, data, inner });
        if (!node) return null;
        return (
          <div key={b.id} data-block={b.id} data-selected={selectedId === b.id ? "1" : undefined}>
            {node}
          </div>
        );
      })}
    </div>
  );
}

/** One slip block; null when it hides itself because its fields are empty. */
function BlockView({ block: b, data, inner }: { block: SlipBlock; data: TokenData; inner: number }): React.ReactNode {
  switch (b.type) {
    case "text":
      return TextBlockView(b, data);
    case "kv":
      return KvBlockView(b, data);
    case "cols":
      return ColsBlockView(b, data);
    case "barcode":
      return BarcodeBlockView(b, data, inner);
    case "qr":
      return QrBlockView(b, data);
    case "image":
      // eslint-disable-next-line @next/next/no-img-element
      return <div style={{ display: "flex", justifyContent: justifyOf(b.align) }}><img src={b.src} alt="" style={{ width: `${Math.min(b.widthMm, inner)}mm`, height: "auto", display: "block" }} /></div>;
    case "divider":
      return <div style={{ borderTop: b.style === "thick" ? "0.8mm solid #000" : `0.3mm ${b.style} #000`, margin: "0.6mm 0", ...INK }} />;
    case "spacer":
      return <div style={{ height: `${b.heightMm}mm` }} />;
    case "sign": {
      const labels = b.labels.map((l) => fillTokens(l, data).text);
      return (
        <div style={{ display: "flex", gap: "6mm", marginTop: `${b.gapMm}mm` }}>
          {labels.map((l, i) => (
            <span key={i} style={{ flex: 1, borderTop: "0.3mm solid #000", fontSize: `${b.size}pt`, paddingTop: "1mm", textAlign: "center" }}>{l}</span>
          ))}
        </div>
      );
    }
  }
}

function TextBlockView(b: TextBlock, data: TokenData): React.ReactNode {
  const f = fillTokens(b.text, data);
  if (b.hideEmpty && (f.empty || f.text.trim() === "")) return null;
  return (
    <div style={{ fontFamily: fontStack(b.font), fontSize: `${b.size}pt`, fontWeight: b.bold ? 700 : 400, fontStyle: b.italic ? "italic" : "normal", textAlign: b.align, background: b.invert ? "#000" : "transparent", color: b.invert ? "#fff" : "#000", padding: b.invert ? "0.6mm 1mm" : 0, whiteSpace: "pre-wrap", wordBreak: "break-word", ...INK }}>{f.text}</div>
  );
}

function KvBlockView(b: KvBlock, data: TokenData): React.ReactNode {
  const v = fillTokens(b.value, data);
  if (b.hideEmpty && (v.empty || v.text.trim() === "")) return null;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(12mm, 32%) 1fr", columnGap: "1.5mm", fontFamily: fontStack(b.font), fontSize: `${b.size}pt` }}>
      <span style={{ color: "#333" }}>{fillTokens(b.label, data).text}</span>
      <span style={{ fontWeight: b.bold ? 700 : 400, wordBreak: "break-word", whiteSpace: "pre-wrap" }}>{v.text}</span>
    </div>
  );
}

function ColsBlockView(b: ColsBlock, data: TokenData): React.ReactNode {
  const cells = b.cells.map((c) => ({ label: fillTokens(c.label, data).text, value: fillTokens(c.value, data) }));
  if (b.hideEmpty && cells.every((c) => c.value.empty || c.value.text.trim() === "")) return null;
  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(${cells.length}, 1fr)`, borderTop: "0.3mm solid #000", borderBottom: "0.3mm solid #000", fontFamily: fontStack(b.font), ...INK }}>
      {cells.map((c, i) => (
        <div key={i} style={{ padding: "1mm 0.6mm", textAlign: "center", borderLeft: i ? "0.2mm solid #999" : "none", minWidth: 0 }}>
          <div style={{ fontSize: `${Math.max(5, b.size * 0.58)}pt`, color: "#333" }}>{c.label}</div>
          <div style={{ fontSize: `${b.size}pt`, fontWeight: 700, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>{c.value.empty || c.value.text.trim() === "" ? "—" : c.value.text}</div>
        </div>
      ))}
    </div>
  );
}

function BarcodeBlockView(b: BarcodeBlock, data: TokenData, inner: number): React.ReactNode {
  const value = fillTokens(b.value, data).text;
  const w = (inner * b.widthPct) / 100;
  const textMm = b.human ? 3.2 : 0;
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: justifyOf(b.align) }}>
      <Bars value={value} widthMm={w} heightMm={b.heightMm} align={b.align} />
      {b.human && <div style={{ fontSize: "7pt", height: `${textMm}mm`, lineHeight: `${textMm}mm`, width: `${w}mm`, textAlign: "center" }}>{value}</div>}
    </div>
  );
}

function QrBlockView(b: QrBlock, data: TokenData): React.ReactNode {
  return (
    <div style={{ display: "flex", justifyContent: justifyOf(b.align) }}>
      <QrBox value={fillTokens(b.value, data).text} boxMm={b.sizeMm} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Either
// ---------------------------------------------------------------------------
export function TemplateView({ doc, data, extraClass }: { doc: TemplateDoc; data: TokenData; extraClass?: string }) {
  return doc.kind === "label" ? <LabelView doc={doc} data={data} extraClass={extraClass} /> : <SlipView doc={doc} data={data} extraClass={extraClass} />;
}
