"use client";

// Quick Register — small smart-entry pieces shared by its forms:
//   ChecksBox        live checks (alert / warn / info) in English + Kannada
//   ScaleBtn         "use scale weight" — only shown while the scale bridge is running
//   CodeBtn          scan / type an item barcode or QR code (USB scanner or phone camera)
//   useRecentEntries last 30 days of register entries, for the rate / duplicate checks
// All of it only HELPS the person fill a form — nothing here saves anything.
import { useEffect, useState } from "react";
import { useScale } from "@/components/ScaleProvider";
import BarcodeScanner, { cameraScanSupported } from "@/components/barrels/BarcodeScanner";
import { word } from "@/lib/registerI18n";
import { businessDate, type LangMode } from "@/lib/register";
import type { RegCheck, RegHistoryEntry } from "@/lib/registerChecks";
import type { ItemLike } from "@/lib/smartEntry";

const ICON = { alert: "🚨", warn: "⚠️", info: "ℹ️" } as const;

export function ChecksBox({ checks, lang }: { checks: RegCheck[]; lang: LangMode }) {
  if (!checks.length) return null;
  return (
    <div className="qr-chks" role="status" aria-label="Checks">
      {checks.map((c, i) => (
        <div key={i} className={`qr-chk ${c.level}`}>
          <span aria-hidden>{ICON[c.level]}</span>
          <span>
            {lang === "kn" ? c.kn : c.en}
            {lang === "both" && <span className="qr-sub">{c.kn}</span>}
          </span>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Scale
// ---------------------------------------------------------------------------
export const SCALE_FRESH_MS = 10_000;

function toKg(w: number, unit?: string): number {
  const u = (unit || "kg").toLowerCase();
  if (u === "g") return w / 1000;
  if (u === "lb" || u === "lbs") return w * 0.45359237;
  return w;
}

export function ScaleBtn({ lang, onUse }: { lang: LangMode; onUse: (kg: number) => void }) {
  const { connected, selectedReading: r } = useScale();
  const [, tick] = useState(0);
  // A reading goes stale with time, not only when a new one arrives.
  useEffect(() => {
    const t = setInterval(() => tick((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, []);
  if (!connected) return null;
  const fresh = !!r && Date.now() - r.receivedAt < SCALE_FRESH_MS;
  const kg = r ? toKg(r.weight, r.unit) : NaN;
  const steady = fresh && r!.stable !== false && Number.isFinite(kg) && kg > 0;
  return (
    <div className="qr-scale">
      <span className={`qr-dot ${fresh ? (steady ? "ok" : "mid") : "bad"}`} aria-hidden />
      <b>{fresh && Number.isFinite(kg) ? `${Math.round(kg * 100) / 100} kg` : word("scaleNone", lang)}</b>
      {fresh && !steady && <span className="qr-m">{word("scaleMoving", lang)}</span>}
      <button type="button" className="qr-mini" disabled={!steady} onClick={() => onUse(Math.round(kg * 100) / 100)}>
        ⚖️ {word("scaleUse", lang)}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Item codes
// ---------------------------------------------------------------------------
let itemsPromise: Promise<ItemLike[]> | null = null;
/** The Items master (barcode / SKU / name / unit), fetched once per page load. */
export function loadItems(): Promise<ItemLike[]> {
  if (!itemsPromise) {
    itemsPromise = fetch("/api/items")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("items"))))
      .then((j) => (Array.isArray(j.data) ? (j.data as ItemLike[]) : []))
      .catch(() => {
        itemsPromise = null; // try again next time
        return [] as ItemLike[];
      });
  }
  return itemsPromise;
}

export function CodeBtn({ lang, onCode }: { lang: LangMode; onCode: (code: string) => void }) {
  const [open, setOpen] = useState(false);
  const [cam, setCam] = useState(false);
  const [v, setV] = useState("");
  const send = (code: string) => {
    const c = code.trim();
    if (c) onCode(c);
    setV("");
  };
  if (!open)
    return (
      <div className="qr-f">
        <button type="button" className="qr-linkbtn" onClick={() => setOpen(true)}>
          🔍 {word("codeScan", lang)}
        </button>
      </div>
    );
  return (
    <div className="qr-f qr-coderow">
      <input
        className="qr-txt"
        value={v}
        autoFocus
        autoComplete="off"
        placeholder={word("codePlaceholder", lang)}
        aria-label={word("codeScan", lang)}
        onChange={(e) => setV(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault(); // a scanner's Enter must not submit or close the form
            send(v);
          }
        }}
      />
      {cameraScanSupported() && (
        <button type="button" className="qr-btn2" onClick={() => setCam(true)} aria-label={word("codeScan", lang)}>
          📷
        </button>
      )}
      {cam && (
        <BarcodeScanner
          title={word("codeScan", lang)}
          onClose={() => setCam(false)}
          onCode={(c) => {
            setCam(false);
            send(c);
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Recent entries for the checks
// ---------------------------------------------------------------------------
const recentCache = new Map<string, RegHistoryEntry[]>();

/** Register entries of the 30 days up to `date` (best effort — the checks just do less without them). */
export function useRecentEntries(date: string): RegHistoryEntry[] {
  const [rows, setRows] = useState<RegHistoryEntry[]>(() => recentCache.get(date) || []);
  useEffect(() => {
    let off = false;
    const from = businessDate(Date.parse(`${date}T12:00:00+05:30`) - 30 * 86_400_000);
    fetch(`/api/register/range?from=${from}&to=${date}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!j || !Array.isArray(j.data)) return;
        const data = (j.data as (RegHistoryEntry & { date: string })[]).map((e) => ({ ...e, date: e.date }));
        recentCache.set(date, data);
        if (!off) setRows(data);
      })
      .catch(() => {});
    return () => {
      off = true;
    };
  }, [date]);
  return rows;
}
