"use client";

// "📤 Share" for a list, a report or a card: WhatsApp, Telegram, SMS, email, Gmail, copy, and the
// phone's own share sheet (which also offers Bluetooth, Nearby Share, Drive, any other app) with
// the text, a picture of it or an Excel (CSV) file. `area` is a CSS selector of what to share;
// `text` gives the message directly instead.
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { shareFileName, shareLink, shareMessage, tableCsv, tableText, type ShareTarget } from "@/lib/share";
import "./share.css";

const JUNK = "button, select, input, textarea, script, style, svg, canvas, iframe, .pa-hide, .bd-noprint, .sh-btn, [aria-hidden='true'], [hidden]";

/** Rows of every table inside el (header first), leaving out button-only columns. */
function tablesOf(el: HTMLElement): string[][] {
  const rows: string[][] = [];
  el.querySelectorAll("table").forEach((t, i) => {
    if (i > 0 && rows.length) rows.push([]);
    t.querySelectorAll("tr").forEach((tr) => {
      const cells = Array.from(tr.querySelectorAll("th,td")).map((c) => {
        const k = c.cloneNode(true) as HTMLElement;
        k.querySelectorAll(JUNK).forEach((x) => x.remove());
        return (k.textContent || "").replace(/\s+/g, " ").trim();
      });
      if (cells.some(Boolean)) rows.push(cells);
    });
  });
  return rows;
}

/** Readable text of an element: laid out off screen so line breaks follow the page, without buttons. */
function textOf(el: HTMLElement): string {
  const k = el.cloneNode(true) as HTMLElement;
  k.querySelectorAll(JUNK).forEach((x) => x.remove());
  k.style.cssText = `position:fixed;left:-10000px;top:0;width:${Math.max(320, el.clientWidth)}px;`;
  document.body.appendChild(k);
  const t = k.innerText;
  k.remove();
  return t;
}

export interface ShareSource {
  title: string;
  text: string;
  rows: string[][];
  el: HTMLElement | null;
}

export function readShare(area: string | undefined, title: string, text?: string): ShareSource {
  const el = area ? document.querySelector<HTMLElement>(area) : null;
  if (text != null) return { title, text, rows: [], el };
  if (!el) return { title, text: document.title, rows: [], el: null };
  const rows = tablesOf(el);
  // a page that is mostly one table: share the table; otherwise the readable text
  const body = rows.length >= 2 ? tableText(rows) : textOf(el);
  return { title, text: body, rows, el };
}

async function pictureOf(el: HTMLElement): Promise<Blob> {
  const { toBlob } = await import("html-to-image");
  const bg = getComputedStyle(document.body).backgroundColor || "#ffffff";
  const b = await toBlob(el, { pixelRatio: Math.min(2, window.devicePixelRatio || 1), backgroundColor: bg === "rgba(0, 0, 0, 0)" ? "#ffffff" : bg, filter: (n) => !(n instanceof HTMLElement && (n.classList.contains("sh-btn") || n.classList.contains("pa-hide"))) });
  if (!b) throw new Error("Could not make the picture.");
  return b;
}

function download(blob: Blob, name: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 3000);
}

/** Send a file through the phone's share sheet (Bluetooth, WhatsApp, Drive...), else save it. */
async function shareFile(blob: Blob, name: string, title: string): Promise<"shared" | "saved"> {
  const file = new File([blob], name, { type: blob.type });
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (nav.share && nav.canShare?.({ files: [file] })) {
    await nav.share({ files: [file], title });
    return "shared";
  }
  download(blob, name);
  return "saved";
}

const TARGETS: { t: ShareTarget; icon: string; name: string }[] = [
  { t: "whatsapp", icon: "🟢", name: "WhatsApp" },
  { t: "telegram", icon: "✈️", name: "Telegram" },
  { t: "sms", icon: "💬", name: "SMS" },
  { t: "gmail", icon: "📧", name: "Gmail" },
  { t: "email", icon: "✉️", name: "Email app" },
];

export default function ShareButton({
  area,
  text,
  title,
  label = "📤 Share",
  className = "hub-btn",
  url,
}: {
  area?: string;
  text?: string;
  /** first line of the message and the file name */
  title?: string;
  label?: string;
  className?: string;
  /** link added under the message (default: this page) */
  url?: string | false;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const [canNative, setCanNative] = useState(false);
  useEffect(() => setCanNative(typeof navigator !== "undefined" && typeof navigator.share === "function"), []);
  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => {
      const t = e.target as Node;
      if (box.current?.contains(t) || btn.current?.contains(t)) return;
      setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", esc);
    window.addEventListener("scroll", close, true);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", esc);
      window.removeEventListener("scroll", close, true);
    };
  }, [open]);

  const name = () => title || document.title.replace(/\s+—.*$/, "") || "Report";
  const link = () => (url === false ? undefined : url || window.location.href.replace(/[?&]embed=1/, ""));
  const src = () => readShare(area, name(), text);
  const flash = (t: string) => {
    setMsg(t);
    setTimeout(() => setMsg(""), 3500);
  };
  const run = async (f: () => Promise<void> | void) => {
    setBusy(true);
    try {
      await f();
    } catch (e) {
      if (!(e instanceof DOMException && e.name === "AbortError")) flash(e instanceof Error ? e.message : "Could not share.");
    } finally {
      setBusy(false);
    }
  };

  const toggle = () => {
    const r = btn.current?.getBoundingClientRect();
    if (r) {
      const w = 260;
      setPos({ top: Math.min(r.bottom + 6, window.innerHeight - 420), left: Math.max(8, Math.min(r.right - w, window.innerWidth - w - 8)) });
    }
    setOpen((o) => !o);
  };

  const table = () => {
    const x = src();
    return x.rows.length >= 2 ? x.rows : null;
  };

  const menu = (
    <div ref={box} className="sh-menu" role="menu" style={{ top: pos.top, left: pos.left }}>
      <div className="sh-h">Share {name()}</div>
      {canNative && (
        <button role="menuitem" className="sh-i main" disabled={busy} onClick={() => run(async () => { const x = src(); await navigator.share({ title: x.title, text: shareMessage(x.title, x.text, undefined, 6000), url: link() }); setOpen(false); })}>
          📲 <span>Share… <small>any app: WhatsApp, Bluetooth, Drive</small></span>
        </button>
      )}
      <div className="sh-grid">
        {TARGETS.map((x) => (
          <a key={x.t} role="menuitem" className="sh-i" href="#" onClick={(e) => { e.preventDefault(); const v = src(); window.open(shareLink(x.t, shareMessage(v.title, v.text, link(), x.t === "sms" ? 900 : 3500), v.title), x.t === "sms" || x.t === "email" ? "_self" : "_blank", "noopener"); setOpen(false); }}>
            {x.icon} <span>{x.name}</span>
          </a>
        ))}
      </div>
      <div className="sh-sep" />
      {area && (
        <button role="menuitem" className="sh-i" disabled={busy} onClick={() => run(async () => { const v = src(); if (!v.el) throw new Error("Nothing to take a picture of."); const how = await shareFile(await pictureOf(v.el), shareFileName(v.title, "png"), v.title); flash(how === "saved" ? "Picture saved to Downloads." : "Shared ✓"); setOpen(false); })}>
          🖼️ <span>As a picture <small>photo of this part of the screen</small></span>
        </button>
      )}
      {area && (
        <button role="menuitem" className="sh-i" disabled={busy} onClick={() => run(async () => { const rows = table(); if (!rows) throw new Error("There is no table here to make an Excel file from. Try As a picture."); const how = await shareFile(new Blob([tableCsv(rows)], { type: "text/csv" }), shareFileName(name(), "csv"), name()); flash(how === "saved" ? "Excel file saved to Downloads." : "Shared ✓"); setOpen(false); })}>
          📊 <span>As Excel (CSV) <small>the table, opens in Excel / Sheets</small></span>
        </button>
      )}
      <button role="menuitem" className="sh-i" onClick={() => run(async () => { const v = src(); await navigator.clipboard.writeText(shareMessage(v.title, v.text, link(), 20000)); flash("Copied. Paste it anywhere."); setOpen(false); })}>
        📋 <span>Copy text</span>
      </button>
      <button role="menuitem" className="sh-i" onClick={() => run(async () => { await navigator.clipboard.writeText(link() || window.location.href); flash("Link copied."); setOpen(false); })}>
        🔗 <span>Copy link</span>
      </button>
    </div>
  );

  return (
    <>
      <button ref={btn} type="button" className={`${className} sh-btn pa-hide`} aria-haspopup="menu" aria-expanded={open} onClick={toggle} disabled={busy}>
        {busy ? "…" : label}
      </button>
      {open && typeof document !== "undefined" && createPortal(menu, document.body)}
      {msg && typeof document !== "undefined" && createPortal(<div className="sh-toast" role="status">{msg}</div>, document.body)}
    </>
  );
}
