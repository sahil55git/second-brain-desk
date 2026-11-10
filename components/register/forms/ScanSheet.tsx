"use client";

import { useRef, useState } from "react";
import { type LangMode, type RegisterKind } from "@/lib/register";
import { pairLabel, word } from "@/lib/registerI18n";
import { DeviceCopySettings } from "@/components/register/ProofParts";
import { PROOF_META, SCAN_FIELDS, SCAN_KINDS, scanEntryKind, scanSummary, scanWarnings, type ScanFields, type ScanKind } from "@/lib/proofs";
import { getGeo, geoOn, preparePhoto, uploadProof, type Captured } from "@/lib/proofClient";
import { G } from "@/components/register/Glyph";
import { EntryInit, api, Txt, Chips, SheetFrame } from "./shared";



export default function ScanSheet({
  lang,
  date,
  onClose,
  onSaved,
  onMakeEntry,
  toast,
}: {
  lang: LangMode;
  date: string;
  onClose: () => void;
  onSaved: (msg?: string) => void;
  onMakeEntry: (kind: RegisterKind, init: EntryInit) => void;
  toast: (m: string) => void;
}) {
  const [kind, setKind] = useState<ScanKind>("WEIGHBRIDGE");
  const [photo, setPhoto] = useState<Captured | null>(null);
  const [reading, setReading] = useState(false);
  const [vals, setVals] = useState<Record<string, string>>({});
  const [aiFields, setAiFields] = useState<ScanFields | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [confidence, setConfidence] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const camRef = useRef<HTMLInputElement>(null);
  const galRef = useRef<HTMLInputElement>(null);

  const typed = (k: ScanKind, v: Record<string, string>): ScanFields => {
    const out: ScanFields = {};
    for (const f of SCAN_FIELDS[k]) {
      const raw = (v[f.key] ?? "").trim();
      out[f.key] = raw === "" ? null : f.type === "number" ? (Number.isFinite(Number(raw)) ? Number(raw) : null) : raw;
    }
    return out;
  };

  async function read(k: ScanKind, dataUrl: string) {
    setReading(true);
    setAiError(null);
    setConfidence(null);
    try {
      const r = await api<{ fields: ScanFields; aiError?: string; confidence?: string }>("/api/scan", {
        method: "POST",
        body: JSON.stringify({ kind: k, dataUrl }),
      });
      const next: Record<string, string> = {};
      for (const f of SCAN_FIELDS[k]) next[f.key] = r.fields[f.key] == null ? "" : String(r.fields[f.key]);
      setVals(next);
      setAiFields(r.aiError ? null : r.fields);
      setAiError(r.aiError || null);
      setConfidence(r.confidence || null);
    } catch (e) {
      setAiError(e instanceof Error ? e.message : word("error", lang));
    } finally {
      setReading(false);
    }
  }

  async function onFile(f: File | undefined) {
    if (!f) return;
    try {
      const dataUrl = await preparePhoto(f);
      const geo = geoOn() ? await getGeo(2500) : null;
      const c: Captured = { kind, dataUrl, capturedAt: new Date().toISOString(), geo };
      setPhoto(c);
      read(kind, dataUrl);
    } catch (e) {
      toast(e instanceof Error ? e.message : word("error", lang));
    }
  }

  const fields = typed(kind, vals);
  const warnings = photo ? scanWarnings(kind, fields) : [];
  const sum = scanSummary(kind, fields);

  async function save(makeEntry: boolean) {
    if (!photo) return;
    setBusy(true);
    try {
      const r = await uploadProof(
        { ...photo, kind },
        {
          date,
          partyName: sum.party,
          amountInr: sum.amountInr,
          refNo: sum.ref,
          fields,
          aiFields,
          notes: notes.trim() || null,
        }
      );
      const where = r.drive.ok ? word("driveSaved", lang) : word("proofKept", lang);
      if (makeEntry) {
        const k = scanEntryKind(kind);
        const extra = [
          `${PROOF_META[kind].en}${sum.ref ? " " + sum.ref : ""}`,
          typeof fields.vehicleNo === "string" ? fields.vehicleNo : "",
          kind === "WEIGHBRIDGE" && typeof fields.material === "string" ? fields.material : "",
          kind === "RECEIPT" && typeof fields.purpose === "string" ? fields.purpose : "",
        ]
          .filter(Boolean)
          .join(" · ");
        onMakeEntry(k, {
          // A weighbridge slip gives the weight, not the price of the goods.
          amount: kind === "WEIGHBRIDGE" ? undefined : sum.amountInr ?? undefined,
          qty: k === "PURCHASE" && sum.qtyKg ? sum.qtyKg : undefined,
          unit: k === "PURCHASE" && sum.qtyKg ? "kg" : undefined,
          party: sum.party ?? undefined,
          linkProofId: r.saved.id,
          note: extra,
        });
      } else {
        onSaved(`${word("saved", lang)} · ${where}`);
      }
    } catch (e) {
      toast(e instanceof Error ? e.message : word("error", lang));
      setBusy(false);
    }
  }

  const kindOpts = SCAN_KINDS.map((k) => ({ key: k, icon: PROOF_META[k].icon, en: PROOF_META[k].en, kn: PROOF_META[k].kn }));

  return (
    <SheetFrame icon="📸" k="scan" lang={lang} onClose={onClose}>
      <div className="qr-f">
        <label>
          <Txt k="scanType" lang={lang} />
        </label>
        <Chips
          compact
          lang={lang}
          value={kind}
          options={kindOpts}
          onPick={(k) => {
            setKind(k);
            if (photo) read(k, photo.dataUrl);
            else setVals({});
          }}
        />
      </div>

      {!photo ? (
        <div className="qr-f qr-grid2">
          <button type="button" className="qr-btn2 qr-bigbtn" onClick={() => camRef.current?.click()}>
            <G e="📷" /> <Txt k="scanTake" lang={lang} />
          </button>
          <button type="button" className="qr-btn2 qr-bigbtn" onClick={() => galRef.current?.click()}>
            <G e="🖼️" /> <Txt k="scanGallery" lang={lang} />
          </button>
        </div>
      ) : (
        <div className="qr-f qr-scanview">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={photo.dataUrl} alt={PROOF_META[kind].en} />
          <button
            type="button"
            className="qr-mini"
            onClick={() => {
              setPhoto(null);
              setVals({});
              setAiError(null);
              setAiFields(null);
            }}
          >
            ↺ <Txt k="scanRetake" lang={lang} />
          </button>
        </div>
      )}
      <input ref={camRef} hidden type="file" accept="image/*" capture="environment" onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ""; }} />
      <input ref={galRef} hidden type="file" accept="image/*" onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ""; }} />

      {photo && (
        <>
          {reading ? (
            <div className="qr-hint">⏳ {word("scanReading", lang)}</div>
          ) : (
            <div className={`qr-hint ${aiError || confidence === "low" ? "qr-warnline" : ""}`}>
              {aiError ? `⚠️ ${word("scanNoAi", lang)} (${aiError.slice(0, 120)})` : confidence === "low" ? `⚠️ ${word("scanLow", lang)}` : `👀 ${word("scanCheck", lang)}`}
            </div>
          )}
          <div className="qr-scanfields">
            {SCAN_FIELDS[kind].map((f) => {
              const l = pairLabel(f.en, f.kn, lang);
              const warn = warnings.some((w) => w.key === f.key);
              const changed = aiFields && String(aiFields[f.key] ?? "") !== (vals[f.key] ?? "");
              return (
                <div key={f.key} className={`qr-sf${warn ? " warn" : ""}`}>
                  <label className="qr-lbl">
                    {l.main}
                    {l.sub && <span className="qr-sub">{l.sub}</span>}
                    {changed && <span className="qr-m"> ✎</span>}
                  </label>
                  <input
                    className={f.type === "number" ? "qr-num" : "qr-txt"}
                    type={f.type === "number" ? "number" : f.type === "date" ? "date" : "text"}
                    inputMode={f.type === "number" ? "decimal" : undefined}
                    value={vals[f.key] ?? ""}
                    disabled={reading}
                    onChange={(e) => setVals((v) => ({ ...v, [f.key]: e.target.value }))}
                  />
                </div>
              );
            })}
          </div>
          {warnings.map((w) => (
            <div key={w.key + w.en} className="qr-warnline">
              <G e="⚠️" /> {lang === "kn" ? w.kn : w.en}
            </div>
          ))}
          <div className="qr-f">
            <label>
              <Txt k="note" lang={lang} />
            </label>
            <input className="qr-txt" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <DeviceCopySettings lang={lang} compact />
          <div className="qr-grid2">
            <button className="qr-save tool" disabled={busy || reading} onClick={() => save(false)}>
              ✓ {word(busy ? "saving" : "scanSave", lang)}
            </button>
            <button className="qr-save out" disabled={busy || reading} onClick={() => save(true)}>
              ✓ {word("scanSaveEntry", lang)}
            </button>
          </div>
          <div className="qr-hint">
            {scanEntryKind(kind) === "EXPENSE" ? `→ ${word("EXPENSE", lang)}` : `→ ${word("PURCHASE", lang)}`}
          </div>
        </>
      )}
    </SheetFrame>
  );
}
