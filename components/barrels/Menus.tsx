"use client";

// Drop-down menus for the barrel screens: one Print menu, one ⋯ menu for changing a weight.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { api, type Lot } from "@/components/barrels/shared";

/** A button that opens a floating menu. The menu is fixed-position so tables never clip it. */
export function Dropdown({ label, title, className = "bd-btn", children, width = 260 }: { label: ReactNode; title?: string; className?: string; children: (close: () => void) => ReactNode; width?: number }) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!pos) return;
    const off = () => setPos(null);
    const key = (e: KeyboardEvent) => e.key === "Escape" && off();
    window.addEventListener("scroll", off, true);
    window.addEventListener("resize", off);
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("scroll", off, true);
      window.removeEventListener("resize", off);
      window.removeEventListener("keydown", key);
    };
  }, [pos]);
  const toggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (pos) return setPos(null);
    const r = btn.current!.getBoundingClientRect();
    const left = Math.max(8, Math.min(r.right - width, window.innerWidth - width - 8));
    const top = r.bottom + 6 + 320 > window.innerHeight && r.top > 330 ? Math.max(8, r.top - 6 - 320) : r.bottom + 6;
    setPos({ top, left });
  };
  return (
    <>
      <button ref={btn} type="button" className={className} title={title} aria-haspopup="menu" aria-expanded={!!pos} onClick={toggle}>
        {label}
      </button>
      {pos && createPortal(
        <div className="bd-wrap bd-portal">
          <div className="bd-menuback" onClick={(e) => { e.stopPropagation(); setPos(null); }} />
          <div className="bd-menu" role="menu" style={{ top: pos.top, left: pos.left, width }} onClick={(e) => e.stopPropagation()}>
            {children(() => setPos(null))}
          </div>
        </div>,
        document.body
      )}
    </>
  );
}

export function MenuHead({ children }: { children: ReactNode }) {
  return <div className="bd-mh">{children}</div>;
}
export function MenuLink({ href, children, off, why }: { href: string; children: ReactNode; off?: boolean; why?: string }) {
  if (off) return <span className="bd-mi off" title={why}>{children}</span>;
  return (
    <a className="bd-mi" role="menuitem" href={href} target="_blank" rel="noreferrer">
      {children}
    </a>
  );
}
export function MenuBtn({ onClick, children, danger, off, why }: { onClick: () => void; children: ReactNode; danger?: boolean; off?: boolean; why?: string }) {
  return (
    <button type="button" role="menuitem" className={`bd-mi${danger ? " red" : ""}${off ? " off" : ""}`} title={why} disabled={off} onClick={onClick}>
      {children}
    </button>
  );
}

/** Every label and receipt of ONE barrel in one menu. */
export function BarrelPrintMenu({ lotQ, seq, code, hasGross, hasEmpty }: { lotQ: string; seq: number; code: string; hasGross: boolean; hasEmpty: boolean }) {
  const lab = (t: string) => `/barrels/labels?lot=${lotQ}&seq=${seq}&type=${t}`;
  const c = encodeURIComponent(code);
  return (
    <span className="bd-noprint" onClick={(e) => e.stopPropagation()}>
      <Dropdown label="🖨️ Print ▾" title="Labels and receipts for this barrel">
        {() => (
          <>
            <MenuHead>STICKER LABELS</MenuHead>
            <MenuLink href={lab("id")}>🏷️ Barrel ID label</MenuLink>
            <MenuLink href={lab("full")}>🏷️ FULL-weight label</MenuLink>
            <MenuLink href={lab("empty")}>🏷️ EMPTY-weight label</MenuLink>
            <MenuLink href={lab("sum")} off={!(hasGross && hasEmpty)} why="Weigh full and empty first">🏷️ FULL + EMPTY + NET label</MenuLink>
            <MenuHead>RECEIPTS</MenuHead>
            <MenuLink href={`/barrels/print?slip=${c}&phase=GROSS`} off={!hasGross} why="Weigh the full barrel first">🧾 FULL-weight receipt</MenuLink>
            <MenuLink href={`/barrels/print?slip=${c}&phase=EMPTY`} off={!hasEmpty} why="Weigh the empty barrel first">🧾 EMPTY-weight receipt</MenuLink>
            <MenuLink href={`/barrels/print?slip=${c}`} off={!hasGross} why="Weigh the full barrel first">🧾 Weighment slip (full + empty + net)</MenuLink>
          </>
        )}
      </Dropdown>
    </span>
  );
}

/** Every label, receipt and report of the whole lot. */
export function LotPrintMenu({ lotQ }: { lotQ: string }) {
  return (
    <Dropdown label="🖨️ Print ▾" className="bd-btn primary" width={280}>
      {() => (
        <>
          <MenuHead>STICKER LABELS · whole lot</MenuHead>
          <MenuLink href={`/barrels/labels?lot=${lotQ}`}>🏷️ Barrel ID labels</MenuLink>
          <MenuLink href={`/barrels/labels?lot=${lotQ}&type=full`}>🏷️ FULL-weight labels</MenuLink>
          <MenuLink href={`/barrels/labels?lot=${lotQ}&type=empty`}>🏷️ EMPTY-weight labels</MenuLink>
          <MenuLink href={`/barrels/labels?lot=${lotQ}&type=sum`}>🏷️ FULL + EMPTY + NET labels</MenuLink>
          <MenuHead>RECEIPTS · REPORTS</MenuHead>
          <MenuLink href={`/barrels/print?slips=${lotQ}`}>🧾 All weighment slips</MenuLink>
          <MenuLink href={`/barrels/print?report=${lotQ}`}>📄 Lot weighment report (A4)</MenuLink>
        </>
      )}
    </Dropdown>
  );
}

/** ⋯ next to a saved weight: edit it or delete it, always with a reason that goes into History. */
export function WeightMenu({ lotRef, code, phase, kg, otherKg, onDone }: { lotRef: string; code: string; phase: "GROSS" | "EMPTY"; kg: number; otherKg: number | null; onDone: (l: Lot) => void }) {
  const [mode, setMode] = useState<"edit" | "delete" | null>(null);
  const [val, setVal] = useState(String(kg));
  const [why, setWhy] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const word = phase === "GROSS" ? "full (gross)" : "empty (tare)";
  const blockDelete = phase === "GROSS" && otherKg != null;
  const open = (m: "edit" | "delete") => {
    setVal(String(kg));
    setWhy("");
    setErr(null);
    setMode(m);
  };
  const go = async () => {
    setBusy(true);
    setErr(null);
    try {
      const j = await api<{ data: Lot }>(`/api/barrels/${encodeURIComponent(lotRef)}`, {
        method: "PATCH",
        json: mode === "edit" ? { action: "editWeight", code, phase, kg: Number(val.replace(",", ".")), reason: why } : { action: "deleteWeight", code, phase, reason: why },
      });
      onDone(j.data);
      setMode(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <span className="bd-noprint" onClick={(e) => e.stopPropagation()}>
      <Dropdown label="⋯" className="bd-dots" title={`Edit or delete the ${word} weight`} width={200}>
        {(close) => (
          <>
            <MenuBtn onClick={() => { close(); open("edit"); }}>✎ Edit weight</MenuBtn>
            <MenuBtn danger off={blockDelete} why="Delete the empty weight first" onClick={() => { close(); open("delete"); }}>🗑 Delete weight</MenuBtn>
          </>
        )}
      </Dropdown>
      {mode && createPortal(
        <div className="bd-wrap bd-portal"><div className="bd-modalback" onClick={() => !busy && setMode(null)}>
          <div className="bd-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <h3>{mode === "edit" ? "Edit" : "Delete"} {word} weight · {code}</h3>
            <p className="bd-m">
              {mode === "edit" ? `Saved now: ${kg} kg. Type the correct weight and say why.` : `This removes ${kg} kg from the barrel. The old figure stays in History. You can weigh it again after.`}
            </p>
            {mode === "edit" && (
              <label>
                New weight (kg)
                <input inputMode="decimal" value={val} onChange={(e) => setVal(e.target.value)} autoFocus />
              </label>
            )}
            <label>
              Reason (at least 3 letters)
              <input value={why} onChange={(e) => setWhy(e.target.value)} placeholder="e.g. typed wrong, weighed again" autoFocus={mode === "delete"} />
            </label>
            <div className="bd-m small">Saved in History with your name, the time, the old and the new figure. The owner sees it.</div>
            {err && <div className="bd-err">{err}</div>}
            <div className="bd-row">
              <button className="bd-btn" disabled={busy} onClick={() => setMode(null)}>Cancel</button>
              <button className={`bd-btn ${mode === "delete" ? "danger" : "primary"}`} disabled={busy || why.trim().length < 3 || (mode === "edit" && !(Number(val.replace(",", ".")) > 0))} onClick={go}>
                {busy ? "…" : mode === "edit" ? "Save change" : "Delete weight"}
              </button>
            </div>
          </div>
        </div></div>,
        document.body
      )}
    </span>
  );
}
