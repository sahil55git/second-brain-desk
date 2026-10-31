"use client";

// The slim bar on top of every page: ← Back, ⌂ Home, 🔍 search the whole app (pages and entry
// forms, English or ಕನ್ನಡ; Ctrl+K), ☰ shortcuts (the quick window), 📤 share this page. It can be
// folded into a small button (remembered on this device). Not shown inside a quick window, on the
// sign-in pages or on paper.
import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { navSearch, type NavHit } from "@/lib/navSearch";
import { useLauncher } from "@/components/launcher/LauncherProvider";
import ShareButton from "@/components/share/ShareButton";
import "./nav.css";

const KEY = "sbd_dock_v1";

export default function NavDock() {
  const path = usePathname() || "/";
  const router = useRouter();
  const { data: session, status } = useSession();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const isOwner = (session?.user as any)?.role === "OWNER";
  const { embedded, openBig } = useLauncher();
  const [folded, setFolded] = useState(false);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [cur, setCur] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      setFolded(localStorage.getItem(KEY) === "folded");
    } catch {}
  }, []);
  const fold = (v: boolean) => {
    setFolded(v);
    try { localStorage.setItem(KEY, v ? "folded" : "bar"); } catch {}
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        fold(false);
        setOpen(true);
        setTimeout(() => input.current?.focus(), 0);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => !wrap.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);
  useEffect(() => { setOpen(false); setQ(""); }, [path]);

  const hits = useMemo<NavHit[]>(() => (open ? navSearch(q, isOwner, 10) : []), [q, isOwner, open]);
  const hidden = embedded || status !== "authenticated" || path.startsWith("/login") || path.startsWith("/setup");
  if (hidden) return null;

  const go = (h: NavHit) => {
    setOpen(false);
    setQ("");
    if (h.href.startsWith("/?") || h.href === "/") window.location.href = h.href; // the home page reads ?desk= on load
    else router.push(h.href);
  };
  const back = () => (window.history.length > 1 ? router.back() : router.push("/"));

  if (folded) {
    return (
      <button className="nd-mini" onClick={() => fold(false)} aria-label="Show the top bar: back, home, search" title="Back · Home · Search">
        ☰
      </button>
    );
  }
  return (
    <div className="nd-bar" role="navigation" aria-label="Back, home and search">
      <button className="nd-b" onClick={back} aria-label="Back" title="Back">←</button>
      {path !== "/" && <a className="nd-b" href="/" aria-label="Home" title="Home">⌂</a>}
      <div className="nd-search" ref={wrap}>
        <input
          ref={input}
          type="search"
          value={q}
          placeholder="Search the app… sale, barrel, cash, ಸ್ಟಾಕ್"
          aria-label="Search pages and entries"
          onFocus={() => setOpen(true)}
          onChange={(e) => { setQ(e.target.value); setCur(0); setOpen(true); }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") { e.preventDefault(); setCur((c) => Math.min(c + 1, hits.length - 1)); }
            else if (e.key === "ArrowUp") { e.preventDefault(); setCur((c) => Math.max(0, c - 1)); }
            else if (e.key === "Enter" && hits[cur]) { e.preventDefault(); go(hits[cur]); }
            else if (e.key === "Escape") { e.preventDefault(); setOpen(false); input.current?.blur(); }
          }}
        />
        {open && hits.length > 0 && (
          <ul className="nd-hits" role="listbox">
            {hits.map((h, i) => (
              <li key={h.id} role="option" aria-selected={i === cur}>
                <button className={i === cur ? "on" : ""} onMouseEnter={() => setCur(i)} onClick={() => go(h)}>
                  <span className="ic" aria-hidden>{h.icon}</span>
                  <span className="tx"><b>{h.title}</b> <small>{h.kn}</small><em>{h.sub}</em></span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {open && q && hits.length === 0 && <div className="nd-hits nd-none">Nothing found for “{q}”.</div>}
      </div>
      <button className="nd-b" onClick={() => openBig("Function")} aria-label="Shortcuts" title="Shortcuts and quick windows">☰</button>
      <ShareButton area="main, .hub, .bd-wrap, .qr, body" className="nd-b" label="📤" title={typeof document !== "undefined" ? document.title.replace(/\s+—.*$/, "") : "Page"} />
      <button className="nd-b nd-fold" onClick={() => fold(true)} aria-label="Fold the top bar" title="Fold this bar">▴</button>
    </div>
  );
}
