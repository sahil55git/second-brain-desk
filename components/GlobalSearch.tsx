"use client";

// Search bar for the main desk header. Searches the data already loaded on
// the page (parties, bills, items, job-work). Keyboard: "/" focuses it from
// anywhere, arrow keys move through results, Enter opens one, Escape clears.
import { useEffect, useMemo, useRef, useState } from "react";
import HoverCard from "./HoverCard";
import { searchAll, type SearchData, type SearchDesk, type SearchHit } from "@/lib/globalSearch";

export default function GlobalSearch({
  data,
  onOpen,
}: {
  data: SearchData;
  onOpen: (desk: SearchDesk) => void;
}) {
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const hits: SearchHit[] = useMemo(() => searchAll(query, data), [query, data]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      e.preventDefault();
      inputRef.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const open = (hit: SearchHit) => {
    onOpen(hit.desk);
    setQuery("");
    inputRef.current?.blur();
  };

  return (
    <div className="relative w-full max-w-md">
      <label className="sr-only" htmlFor="global-search">Search everything</label>
      <input
        id="global-search"
        ref={inputRef}
        type="search"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setCursor(0);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setCursor((c) => Math.min(c + 1, Math.max(hits.length - 1, 0)));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setCursor((c) => Math.max(c - 1, 0));
          } else if (e.key === "Enter" && hits[cursor]) {
            e.preventDefault();
            open(hits[cursor]);
          } else if (e.key === "Escape") {
            setQuery("");
            inputRef.current?.blur();
          }
        }}
        placeholder="Search parties, bills, items, job-work  ( / )"
        className="w-full rounded-xl border border-black/10 dark:border-white/15 bg-transparent px-3 py-2 text-sm"
        autoComplete="off"
      />
      {query.trim() && (
        <div
          role="listbox"
          aria-label="Search results"
          className="absolute left-0 right-0 top-full mt-2 z-40 max-h-96 overflow-auto rounded-2xl border border-black/10 dark:border-white/15 bg-[var(--background)] p-2 shadow-2xl"
        >
          {hits.length === 0 && <p className="px-3 py-4 text-sm opacity-70">No match for “{query.trim()}”.</p>}
          {hits.map((hit, i) => (
            <div
              key={hit.key}
              role="option"
              aria-selected={i === cursor}
              className={`flex items-center justify-between gap-3 rounded-xl px-3 py-2 ${i === cursor ? "bg-[var(--accent)]/15" : ""}`}
              onMouseEnter={() => setCursor(i)}
            >
              <HoverCard
                trigger={
                  <button type="button" onClick={() => open(hit)} className="text-left">
                    <span className="block text-[11px] uppercase tracking-wide opacity-60">{hit.kind}</span>
                    <span className="block font-semibold">{hit.title}</span>
                    <span className="block text-xs opacity-70">{hit.subtitle}</span>
                  </button>
                }
              >
                <p className="font-semibold">{hit.title}</p>
                <ul className="mt-2 space-y-1 text-xs opacity-90">
                  {hit.details.map((d) => (
                    <li key={d}>{d}</li>
                  ))}
                </ul>
                <div className="mt-3 flex gap-2">
                  <button type="button" onClick={() => open(hit)} className="rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-[var(--accent-contrast)]">
                    Open {hit.kind === "Party" ? "party" : hit.kind === "Bill" ? "bill" : hit.kind === "Item" ? "item" : "job"}
                  </button>
                </div>
              </HoverCard>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
