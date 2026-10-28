"use client";

// The frame of every label / slip print page: numbered steps on one side, a real-size preview on the other.
//   <PrintStudio title subtitle steps={[{ title, body }]} size={size}>{the labels or slips}</PrintStudio>
// On screen: steps left (stacked on a phone), preview right with zoom. When printing only the children print.
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import type { PaperSize } from "@/lib/printSizes";

export interface Step {
  title: string;
  hint?: string;
  body: ReactNode;
  /** a step the person rarely needs starts folded (printer help) */
  folded?: boolean;
}

interface Props {
  title: ReactNode;
  subtitle?: ReactNode;
  steps: Step[];
  size: PaperSize;
  /** shown above the preview, e.g. the test-label switch */
  previewActions?: ReactNode;
  notes?: ReactNode;
  children: ReactNode;
}

const ZOOMS = [0.5, 0.75, 1, 1.5, 2];
const MM = 96 / 25.4; // css px per mm

export default function PrintStudio({ title, subtitle, steps, size, previewActions, notes, children }: Props) {
  const [zoom, setZoom] = useState(1);
  const stage = useRef<HTMLDivElement>(null);
  const fit = () => {
    const el = stage.current;
    if (!el) return;
    const wPx = size.w * MM + 24;
    const hPx = (size.h ?? 80) * MM + 24;
    const z = Math.min(el.clientWidth / wPx, 640 / hPx, 2);
    setZoom(Math.max(0.4, Math.round(z * 20) / 20));
  };
  // start at a size that shows the whole label on a phone
  useEffect(() => {
    if (typeof window !== "undefined" && window.innerWidth <= 760) fit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size.id]);

  const dim = size.id === "a4" ? "A4 sheet" : size.h == null ? `${size.w} mm roll` : `${size.w} × ${size.h} mm`;
  return (
    <div className="bd-studio">
      <aside className="bd-studio-side bd-noprint">
        <header className="bd-studio-head">
          <b>{title}</b>
          {subtitle && <span className="bd-m"> {subtitle}</span>}
        </header>
        {steps.map((s, i) =>
          s.folded ? (
            <details key={i} className="bd-step folded">
              <summary><span className="bd-stepn">{i + 1}</span> {s.title}</summary>
              {s.body}
            </details>
          ) : (
            <section key={i} className="bd-step">
              <h3><span className="bd-stepn">{i + 1}</span> {s.title}{s.hint && <small> {s.hint}</small>}</h3>
              {s.body}
            </section>
          )
        )}
        {notes && <div className="bd-m small bd-studio-notes">{notes}</div>}
      </aside>

      <section className="bd-studio-main">
        <div className="bd-stagebar bd-noprint">
          <span><b>Preview</b> <span className="bd-m">· real size · {dim}</span></span>
          <span className="bd-zoom" role="group" aria-label="Preview size">
            {ZOOMS.map((z) => (
              <button key={z} className={`bd-chip${zoom === z ? " on" : ""}`} onClick={() => setZoom(z)}>{Math.round(z * 100)}%</button>
            ))}
            <button className="bd-chip" onClick={fit}>Fit</button>
          </span>
          {previewActions}
        </div>
        <div ref={stage} className="bd-stage" style={{ "--pz": zoom } as CSSProperties}>
          {children}
        </div>
      </section>
    </div>
  );
}
