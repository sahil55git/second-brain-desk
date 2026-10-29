"use client";

// Settings → 🖨️ Printers. The printers saved in this browser for the label and receipt pages: see how each
// one connects, rename it, choose the default for its kind, or delete it. Stored in this device's
// localStorage ("bd-print-v1"), so changes here apply only on this device.
import { useEffect, useState } from "react";
import { PRINT_MODES } from "@/lib/printHelper";
import { PRINTER_LANGS } from "@/lib/printerLang";
import { defaultPrinter, makeDefault, readBook, removePrinter, renamePrinter, type PrinterBook, type PrintKind, type SavedPrinter } from "@/lib/savedPrinters";

const KEY = "bd-print-v1";
const KINDS: { kind: PrintKind; title: string; page: string }[] = [
  { kind: "label", title: "🏷️ Label printers", page: "/barrels/fleet/labels" },
  { kind: "slip", title: "🧾 Slip / receipt printers", page: "/barrels/fleet/print" },
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

  useEffect(() => {
    const l = load();
    setRaw(l.raw);
    setBook(l.book);
  }, []);

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
        Printers saved in this browser ({total} of 12). They work only on this device. To add one, open a label or slip page, choose how it prints, and press <b>Save this printer</b>.
      </div>
      {err && <div className="hub-banner">{err}</div>}
      {KINDS.map(({ kind, title, page }) => {
        const list = book.printers.filter((p) => p.for === kind);
        const def = defaultPrinter(book, kind);
        return (
          <div key={kind} style={{ marginTop: 12 }}>
            <div className="set-row"><span className="lab"><b>{title}</b></span><a href={page} className="hub-m small">Open the page →</a></div>
            {!list.length && <div className="hub-empty">None saved yet.</div>}
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
                    <span className="hub-m small"> · {modeName(p)}{p.cfg?.lang ? ` · ${PRINTER_LANGS.find((l) => l.id === p.cfg?.lang)?.name ?? p.cfg.lang}` : ""}</span>
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
