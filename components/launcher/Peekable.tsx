"use client";

// Wraps a tab or button so the owner's chosen mouse / touch shortcuts work on it:
// hover → small details window, right-click → menu, long touch, triple tap/click.
// What each gesture does is set in the round button's "Mouse & touch" tab.
// The small window and menu offer "Add / edit" (opens the matching form in a pop
// window), "Open full page" and "Open in pop window".
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useLauncher, type PopSpec } from "./LauncherProvider";
import type { Gesture } from "@/lib/launcher";

export type PkAction = { label: string; pop?: PopSpec; href?: string; run?: () => void };

export default function Peekable({
  title, lines = [], pop, href, add, extra = [], children, className = "", tripleClick = true,
}: {
  title: string;
  lines?: { k: string; v: string }[];
  /** How to show this in a pop window (e.g. the desk page). */
  pop?: PopSpec;
  /** The full page, for "Open full page". */
  href?: string;
  /** The add / edit form for this thing (a Quick Register function in a pop window). */
  add?: PkAction;
  extra?: PkAction[];
  children: ReactNode;
  className?: string;
  /** Plain links navigate on the first click, so triple-click can't work there. */
  tripleClick?: boolean;
}) {
  const { prefs, embedded, openPop } = useLauncher();
  const [card, setCard] = useState<null | "peek" | "menu">(null);
  const ref = useRef<HTMLSpanElement>(null);
  const cardRef = useRef<HTMLSpanElement>(null);
  const [at, setAt] = useState<CSSProperties>({ visibility: "hidden" });
  const hideT = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holdT = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clicks = useRef({ n: 0, at: 0 });
  const swallow = useRef(false);
  const lastPointer = useRef("mouse");

  const clearHide = () => hideT.current && clearTimeout(hideT.current);
  useEffect(() => {
    if (!card) return;
    const down = (e: PointerEvent) => {
      const t = e.target as Node;
      if (ref.current && !ref.current.contains(t) && !(cardRef.current && cardRef.current.contains(t))) setCard(null);
    };
    const key = (e: KeyboardEvent) => e.key === "Escape" && setCard(null);
    document.addEventListener("pointerdown", down);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("pointerdown", down);
      document.removeEventListener("keydown", key);
    };
  }, [card]);
  useEffect(() => () => {
    clearHide();
    if (holdT.current) clearTimeout(holdT.current);
  }, []);

  // The card is drawn on the page itself (not inside the tab bar) so nothing clips or covers it.
  useLayoutEffect(() => {
    if (!card || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    const w = Math.min(card === "menu" ? 220 : 250, window.innerWidth - 16);
    const left = Math.max(8, Math.min(r.left + r.width / 2 - w / 2, window.innerWidth - w - 8));
    const above = r.top > window.innerHeight * 0.55;
    setAt(above ? { left, bottom: window.innerHeight - r.top + 6, width: w } : { left, top: r.bottom + 6, width: w });
  }, [card]);

  const runAction = (a: PkAction) => {
    setCard(null);
    if (a.run) a.run();
    else if (a.pop) openPop(a.pop);
    else if (a.href) window.location.href = a.href;
  };
  const doGesture = (g: Gesture) => {
    if (g === "none") return;
    if (g === "peek") setCard("peek");
    else if (g === "menu") setCard("menu");
    else if (g === "edit") {
      if (add) runAction(add);
      else setCard("peek");
    } else if (g === "pop") {
      if (pop) runAction({ label: "", pop });
      else setCard("peek");
    } else if (g === "full") {
      if (href) window.location.href = href;
      else setCard("peek");
    }
  };

  if (embedded) return <span className={className}>{children}</span>;

  return (
    <span
      ref={ref}
      className={`pk ${className}`}
      onMouseEnter={() => {
        if (lastPointer.current === "touch" || prefs.gest.hover !== "peek") return;
        clearHide();
        setCard("peek");
      }}
      onMouseLeave={() => {
        clearHide();
        hideT.current = setTimeout(() => setCard(null), 220);
      }}
      onPointerDown={(e) => {
        lastPointer.current = e.pointerType;
        swallow.current = false;
        if (holdT.current) clearTimeout(holdT.current);
        if (prefs.gest.long === "none") return;
        holdT.current = setTimeout(() => {
          swallow.current = true;
          doGesture(prefs.gest.long);
        }, 600);
      }}
      onPointerUp={() => holdT.current && clearTimeout(holdT.current)}
      onPointerLeave={() => holdT.current && clearTimeout(holdT.current)}
      onPointerCancel={() => holdT.current && clearTimeout(holdT.current)}
      onContextMenu={(e) => {
        // A touch long-press raises this too; the long-touch timer already handled it.
        if (lastPointer.current === "touch" || prefs.gest.right === "none") {
          if (lastPointer.current === "touch" && prefs.gest.long !== "none") e.preventDefault();
          return;
        }
        e.preventDefault();
        doGesture(prefs.gest.right);
      }}
      onClickCapture={(e) => {
        if (swallow.current) {
          swallow.current = false;
          e.preventDefault();
          e.stopPropagation();
          return;
        }
        if (!tripleClick || prefs.gest.triple === "none") return;
        const now = Date.now();
        const c = clicks.current;
        c.n = now - c.at < 600 ? c.n + 1 : 1;
        c.at = now;
        if (c.n >= 3) {
          c.n = 0;
          e.preventDefault();
          e.stopPropagation();
          doGesture(prefs.gest.triple);
        }
      }}
    >
      {children}
      {card &&
        createPortal(
          <span
            ref={cardRef}
            className={`pk-card${card === "menu" ? " menu" : ""}`}
            style={at}
            role={card === "menu" ? "menu" : "dialog"}
            aria-label={title}
            onMouseEnter={clearHide}
            onMouseLeave={() => {
              hideT.current = setTimeout(() => setCard(null), 220);
            }}
          >
            <b className="pk-t">{title}</b>
            {card === "peek" &&
              lines.map((l) => (
                <span key={l.k} className="pk-l"><span>{l.k}</span><b>{l.v}</b></span>
              ))}
            {add && <button onClick={() => runAction(add)}>＋ {add.label}</button>}
            {pop && <button onClick={() => runAction({ label: "", pop })}>❐ Open in pop window</button>}
            {href && <button onClick={() => (window.location.href = href)}>↗ Open full page</button>}
            {extra.map((a) => <button key={a.label} onClick={() => runAction(a)}>{a.label}</button>)}
          </span>,
          document.body,
        )}
    </span>
  );
}
