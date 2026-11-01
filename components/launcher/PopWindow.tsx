"use client";

// One quick window: a page of the app (or a web link) in a small window that stays open over every
// page until closed. Drag it by the title, swipe the title left / right to switch between open
// windows (phone), ← back and ⌂ home inside it, ◐ size and see-through, — keep it as a bubble.
import { useRef, useState } from "react";
import { Icon } from "@/components/ui/Icons";
import { POP_SIZES, embedUrl, type PopState } from "@/lib/popWindows";

export default function PopWindow({ pop, index, count, change, front, cycle, close }: {
  pop: PopState;
  index: number;
  count: number;
  change: (p: Partial<PopState>) => void;
  front: () => void;
  cycle: (dir: 1 | -1) => void;
  close: () => void;
}) {
  const [max, setMax] = useState(false);
  const [opts, setOpts] = useState(false);
  const [live, setLive] = useState({ x: pop.x, y: pop.y });
  const drag = useRef<{ sx: number; sy: number; ox: number; oy: number; moved: boolean } | null>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const internal = pop.url.startsWith("/");
  const src = internal ? embedUrl(pop.url) : pop.url;
  const phone = typeof window !== "undefined" && window.matchMedia("(max-width: 760px)").matches;
  const inner = () => {
    try {
      return frame.current?.contentWindow ?? null;
    } catch {
      return null;
    }
  };
  const back = () => {
    try {
      inner()?.history.back();
    } catch {
      /* another site: no back from here */
    }
  };
  const home = () => {
    if (frame.current) frame.current.src = embedUrl("/go");
  };
  const top = index === count - 1;
  return (
    <div
      className={`ql-pop sz-${pop.size}${max ? " max" : ""}${top ? " top" : ""}`}
      style={max ? { opacity: pop.opacity } : { left: phone ? undefined : `calc(50% - var(--qw, 280px) + ${index * 34 + live.x}px)`, top: phone ? undefined : `calc(9vh + ${index * 30 + live.y}px)`, zIndex: 9001 + index, opacity: pop.opacity }}
      role="dialog"
      aria-label={pop.title}
      onPointerDownCapture={() => !top && front()}
    >
      <div
        className="ql-pt"
        onPointerDown={(e) => {
          if (max || (e.target as HTMLElement).closest("button")) return;
          drag.current = { sx: e.clientX, sy: e.clientY, ox: live.x, oy: live.y, moved: false };
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d || phone) return;
          d.moved = true;
          setLive({ x: d.ox + e.clientX - d.sx, y: d.oy + e.clientY - d.sy });
        }}
        onPointerUp={(e) => {
          const d = drag.current;
          drag.current = null;
          if (!d) return;
          const dx = e.clientX - d.sx;
          // phone: a sideways swipe on the title brings the next open window to the front
          if (phone && Math.abs(dx) > 60 && Math.abs(e.clientY - d.sy) < 40 && count > 1) cycle(dx < 0 ? 1 : -1);
          else if (d.moved) change({ x: live.x, y: live.y });
        }}
      >
        <span className={`ql-dot k-${pop.kind || "App"}`} />
        {internal && <button onClick={back} title="Back" aria-label="Back">←</button>}
        {internal && <button onClick={home} title="Quick links" aria-label="Home"><Icon name="home" size={15} /></button>}
        <b>{pop.title}{count > 1 && phone ? <small className="ql-cnt"> · {index + 1}/{count} ⇆</small> : null}</b>
        <button onClick={() => setOpts((o) => !o)} title="Size and see-through" aria-label="Size and see-through" aria-expanded={opts}>◐</button>
        <button onClick={() => change({ min: true })} title="Keep as a bubble" aria-label="Keep as a bubble">—</button>
        <button onClick={() => window.open(pop.url, "_blank", internal ? undefined : "noopener,noreferrer")} title="Open in a new tab" aria-label="Open in a new tab"><Icon name="external" size={15} /></button>
        <button onClick={() => setMax(!max)} title={max ? "Smaller" : "Full screen"} aria-label={max ? "Smaller" : "Full screen"}>{max ? "▭" : "⤢"}</button>
        <button onClick={close} aria-label="Close">✕</button>
      </div>
      {opts && (
        <div className="ql-opts">
          <span className="ql-seg" role="radiogroup" aria-label="Window size">
            {POP_SIZES.map((x) => (
              <button key={x.id} role="radio" aria-checked={pop.size === x.id} className={pop.size === x.id ? "on" : ""} onClick={() => { setMax(false); change({ size: x.id }); }}>{x.name}</button>
            ))}
          </span>
          <label className="ql-op">
            See-through
            <input type="range" min={35} max={100} step={5} value={Math.round(pop.opacity * 100)} onChange={(e) => change({ opacity: Number(e.target.value) / 100 })} />
          </label>
        </div>
      )}
      <iframe
        ref={frame}
        title={pop.title}
        src={src}
        referrerPolicy={internal ? undefined : "no-referrer"}
        sandbox={internal ? undefined : "allow-scripts allow-forms allow-popups"}
      />
      {!internal && <div className="ql-note">If this stays blank, the site doesn’t allow being shown inside a window. Use “Open in a new tab” (↗ above).</div>}
    </div>
  );
}
