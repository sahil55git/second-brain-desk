"use client";

// Settings → 🖨️ Printers (also on the Print centre). The printers saved in this browser for the label and
// receipt pages: see how each one connects and whether it is there right now, rename it, choose the default
// for its kind, or delete it; printers found on this device but not saved yet can be saved with one tap.
// Stored in this device's localStorage ("bd-print-v1"), so changes here apply only on this device.
import { useCallback, useEffect, useState } from "react";
import { buildOptions, detect, nameForNew, nothingDetected, savedDetail, suitsKind, type Detected, type PrinterOption } from "@/lib/printerDetect";
import { PRINT_MODES } from "@/lib/printHelper";
import { PRINTER_LANGS } from "@/lib/printerLang";
import { defaultPrinter, makeDefault, readBook, removePrinter, renamePrinter, savePrinter, type PrinterBook, type PrintKind, type SavedPrinter } from "@/lib/savedPrinters";

const KEY = "bd-print-v1";
const KINDS: { kind: PrintKind; title: string; page: string }[] = [
  { kind: "label", title: "🏷️ Label printers", page: "/barrels/fleet/printers?kind=label" },
  { kind: "slip", title: "🧾 Slip / receipt printers", page: "/barrels/fleet/printers?kind=slip" },
];

const modeName = (p: SavedPrinter) => (p.mode === "direct" && p.via ? (p.via === "bluetooth" ? "Bluetooth" : "USB") : PRINT_MODES.find((m) => m.id === p.mode)?.name ?? p.mode);

function load(): { raw: Record<string, unknown>; book: PrinterBook } {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || "null") || {};
    return { raw, book: readBook(raw.book) };
  } catch {
    return { raw: {}, book: readBook(null) };
  }
}

function store(raw: Record<string, unknown>, book: PrinterBook) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...raw, book }));
  } catch {}
}

export default function PrintersCard({ flash }: { flash: (m: string) => void }) {
  const [book, setBook] = useState<PrinterBook | null>(null);
  const [raw, setRaw] = useState<Record<string, unknown>>({});
  const [editing, setEditing] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [askDelete, setAskDelete] = useState<string | null>(null);
  const [err, setErr] = useState("");
  const [found, setFound] = useState<Detected>(nothingDetected());
  const [looking, setLooking] = useState(false);

  const look = useCallback(async (code?: string) => {
    setLooking(true);
    try {
      setFound(await detect({ helperCode: code }));
    } catch {
      /* nothing found */
    } finally {
      setLooking(false);
    }
  }, []);
  useEffect(() => {
    const l = load();
    setRaw(l.raw);
    setBook(l.book);
    void look(typeof l.raw.hcode === "string" ? l.raw.hcode : undefined);
  }, [look]);

  const keep = (o: PrinterOption, kind: PrintKind) => {
    if (!book) return;
    try {
      const r = savePrinter(book, {
        name: nameForNew(o, book, kind),
        for: kind,
        mode: o.mode,
        ...(o.via ? { via: o.via, deviceId: o.deviceId, cfg: { lang: kind === "label" ? "tspl" : "escpos" } } : {}),
        ...(o.helper ? { helper: o.helper } : {}),
      });
      update(r.book, `Saved ${r.saved.name}${r.book.defaults[kind] === r.saved.id ? " as the default" : ""} ✓`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not save.");
    }
  };

  const update = (next: PrinterBook, msg: string) => {
    store(raw, next);
    setBook(next);
    setErr("");
    flash(msg);
  };

  if (!book) return <section className="hub-card"><h3>🖨️ Printers</h3><div className="hub-empty">Not available in this browser</div></section>;

  const total = book.printers.length;
  return (
    <section className="hub-card">
      <h3>🖨️ Printers</h3>
      <div className="hub-m small" style={{ marginBottom: 8 }}>
        Printers saved in this browser ({total} of 12). They work only on this device. A printer is saved by itself the first time it prints; to add a new one open <a href="/barrels/fleet/printers"><b>Printer setup</b></a>.{" "}
        <button className="bd-linkbtn" onClick={() => void look(typeof raw.hcode === "string" ? raw.hcode : undefined)}>{looking ? "Looking for printers…" : "↻ Look for printers"}</button>
      </div>
      {err && <div className="hub-banner">{err}</div>}
      {KINDS.map(({ kind, title, page }) => {
        const list = book.printers.filter((p) => p.for === kind);
        const def = defaultPrinter(book, kind);
        const fresh = buildOptions(book, kind, found).filter((o) => (o.source === "usb" || o.source === "bluetooth" || o.source === "helper" || o.source === "queue") && !(suitsKind(o.name, kind === "label" ? "slip" : "label") && !suitsKind(o.name, kind)));
        return (
          <div key={kind} style={{ marginTop: 12 }}>
            <div className="set-row"><span className="lab"><b>{title}</b></span><a href={page} className="hub-m small">Set up →</a></div>
            {!list.length && !fresh.length && <div className="hub-empty">None saved yet. Print once from a {kind === "label" ? "label" : "slip"} page, or set one up.</div>}
            {list.map((p) => (
              <div key={p.id} className="set-row" style={{ flexWrap: "wrap", gap: 6 }}>
                {editing === p.id ? (
                  <span style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    <input value={name} maxLength={40} autoFocus onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && doRename(p)} aria-label="New name" />
                    <button className="bd-btn primary" onClick={() => doRename(p)} disabled={!name.trim()}>Save name</button>
                    <button className="bd-linkbtn" onClick={() => setEditing(null)}>Cancel</button>
                  </span>
                ) : (
                  <span>
                    <b>{def?.id === p.id ? "★ " : ""}{p.name}</b>
                    <span className="hub-m small"> · {modeName(p)}{p.cfg?.lang ? ` · ${PRINTER_LANGS.find((l) => l.id === p.cfg?.lang)?.name ?? p.cfg.lang}` : ""} · <ReadyText p={p} found={found} /></span>
                  </span>
                )}
                <span style={{ display: "flex", gap: 10, flexWrap: "wrap", marginLeft: "auto" }}>
                  {def?.id !== p.id && <button className="bd-linkbtn" onClick={() => update(makeDefault(book, p.id), `${p.name} is now the default`)}>★ Make default</button>}
                  <button className="bd-linkbtn" onClick={() => { setEditing(p.id); setName(p.name); setAskDelete(null); }}>Rename</button>
                  {askDelete === p.id ? (
                    <>
                      <button className="bd-linkbtn" style={{ color: "#c0392b" }} onClick={() => { setAskDelete(null); update(removePrinter(book, p.id), `${p.name} deleted`); }}>Yes, delete</button>
                      <button className="bd-linkbtn" onClick={() => setAskDelete(null)}>Keep</button>
                    </>
                  ) : (
                    <button className="bd-linkbtn" style={{ color: "#c0392b" }} onClick={() => setAskDelete(p.id)}>Delete</button>
                  )}
                </span>
              </div>
            ))}
            {fresh.map((o) => (
              <div key={o.key} className="set-row" style={{ flexWrap: "wrap", gap: 6 }}>
                <span>
                  <span className="bd-chip g">found</span> <b>{o.name}</b>
                  <span className="hub-m small"> · {o.detail}</span>
                </span>
                <button className="bd-linkbtn" style={{ marginLeft: "auto" }} onClick={() => keep(o, kind)}>💾 Save as {kind} printer</button>
              </div>
            ))}
          </div>
        );
      })}
    </section>
  );

  function doRename(p: SavedPrinter) {
    try {
      const next = renamePrinter(book!, p.id, name);
      setEditing(null);
      update(next, "Name saved ✓");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not save the name.");
    }
  }
}

function ReadyText({ p, found }: { p: SavedPrinter; found: Detected }) {
  const d = savedDetail(p, found);
  return <span style={{ color: d.ready === true ? "#1e8a4c" : d.ready === false ? "#c8352e" : undefined }}>{d.ready === true ? "● " : d.ready === false ? "○ " : ""}{d.detail.replace(/^(USB|Bluetooth|PC helper|Shop PC) · /, "")}</span>;
}
