"use client";

// Proof of payment pieces for the Quick Register: a signature pad and the
// "Proof of payment" panel shown on Payment / Purchase / Expense forms.
// The proofs are only CAPTURED here; they are saved (and filed in Google
// Drive) right after the entry itself is saved — see EntrySheet.save().

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useSession } from "next-auth/react";
import { pairLabel, word, words, type WordKey } from "@/lib/registerI18n";
import type { LangMode } from "@/lib/register";
import { PROOF_META, type ProofKind } from "@/lib/proofs";
import {
  canPickFolder,
  forgetFolder,
  geoOn,
  getGeo,
  phoneCopyOn,
  pickFolder,
  preparePhoto,
  savedFolderName,
  setGeoOn,
  setPhoneCopy,
  signatureToDataUrl,
  stampLines,
  type Captured,
} from "@/lib/proofClient";

function T({ k, lang }: { k: WordKey; lang: LangMode }) {
  const w = words(k, lang);
  return (
    <>
      {w.main}
      {w.sub && <span className="qr-sub">{w.sub}</span>}
    </>
  );
}

// ---------------------------------------------------------------------------
// Signature pad — full-screen box, finger or stylus.
// ---------------------------------------------------------------------------
export function SignaturePad({ lang, stamp, onUse, onCancel }: { lang: LangMode; stamp: string[]; onUse: (dataUrl: string) => void; onCancel: () => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [ink, setInk] = useState(false);
  const last = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const r = c.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = Math.round(r.width * dpr);
    c.height = Math.round(r.height * dpr);
    const g = c.getContext("2d")!;
    g.fillStyle = "#fff";
    g.fillRect(0, 0, c.width, c.height);
    g.lineCap = "round";
    g.lineJoin = "round";
    g.strokeStyle = "#0b1f4d";
    g.lineWidth = 2.6 * dpr;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onCancel();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  // Ratio of canvas pixels to on-screen box: also correct under page zoom.
  const pos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const c = e.currentTarget;
    const r = c.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * c.width, y: ((e.clientY - r.top) / r.height) * c.height };
  };
  const down = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    last.current = pos(e);
    const g = e.currentTarget.getContext("2d")!;
    g.beginPath();
    g.arc(last.current.x, last.current.y, g.lineWidth / 2, 0, Math.PI * 2);
    g.fillStyle = "#0b1f4d";
    g.fill();
    setInk(true);
  };
  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!last.current) return;
    const p = pos(e);
    const g = e.currentTarget.getContext("2d")!;
    g.beginPath();
    g.moveTo(last.current.x, last.current.y);
    g.lineTo(p.x, p.y);
    g.stroke();
    last.current = p;
  };
  const up = () => {
    last.current = null;
  };
  const clear = () => {
    const c = ref.current;
    if (!c) return;
    const g = c.getContext("2d")!;
    g.fillStyle = "#fff";
    g.fillRect(0, 0, c.width, c.height);
    setInk(false);
  };

  // Rendered on <body> (inside a .qr wrapper for the colours) so it is never
  // clipped by a floating / see-through workspace panel.
  return createPortal(
    <div className="qr qr-portal">
      <div className="qr-sigwrap" role="dialog" aria-modal aria-label={word("signHere", lang)}>
        <div className="qr-sigbox">
          <div className="qr-sighead">
            ✍️ <T k="signHere" lang={lang} />
          </div>
          {stamp.map((l) => (
            <div key={l} className="qr-hint">
              {l}
            </div>
          ))}
          <canvas ref={ref} className="qr-sigcanvas" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onPointerLeave={up} />
          <div className="qr-sigline" aria-hidden>
            ✕ ______________________________
          </div>
          <div className="qr-sigbtns">
            <button type="button" className="qr-btn2" onClick={onCancel}>
              ✕ {word("close", lang)}
            </button>
            <button type="button" className="qr-btn2" onClick={clear}>
              ↺ <T k="signClear" lang={lang} />
            </button>
            <button
              type="button"
              className="qr-btn2 qr-sigok"
              onClick={() => (ink && ref.current ? onUse(signatureToDataUrl(ref.current, stamp)) : alert(word("signEmpty", lang)))}
            >
              ✓ <T k="signUse" lang={lang} />
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ---------------------------------------------------------------------------
// "Proof of payment" panel inside a money-out form.
// ---------------------------------------------------------------------------
export function PaymentProof({
  lang,
  title,
  amount,
  party,
  required,
  value,
  onChange,
  toast,
}: {
  lang: LangMode;
  title: string; // e.g. "Payment / Salary" — printed under the proof
  amount: number;
  party: string;
  required: boolean;
  value: Captured[];
  onChange: (v: Captured[]) => void;
  toast: (m: string) => void;
}) {
  const { data: session } = useSession();
  const by = session?.user?.name || null;
  const [signing, setSigning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [copy, setCopy] = useState(false);
  const photoRef = useRef<HTMLInputElement>(null);
  const thumbRef = useRef<HTMLInputElement>(null);
  useEffect(() => setCopy(phoneCopyOn()), []);

  const stamp = (kind: ProofKind) => stampLines({ title: `Mahadev Traders · ${title}`, kind, amountInr: amount, party: party.trim() || null, by });

  const add = async (kind: ProofKind, dataUrl: string) => {
    const geo = geoOn() ? await getGeo() : null;
    onChange([...value.filter((v) => v.kind !== kind || kind !== "SIGNATURE"), { kind, dataUrl, capturedAt: new Date().toISOString(), geo }]);
  };

  const onFile = async (kind: ProofKind, f: File | undefined) => {
    if (!f) return;
    setBusy(true);
    try {
      await add(kind, await preparePhoto(f, stamp(kind)));
    } catch (e) {
      toast(e instanceof Error ? e.message : word("error", lang));
    } finally {
      setBusy(false);
    }
  };

  const btn = (kind: ProofKind, onClick: () => void) => {
    const m = PROOF_META[kind];
    const l = pairLabel(m.en, m.kn, lang);
    const have = value.some((v) => v.kind === kind);
    return (
      <button type="button" className={`qr-chip${have ? " sel" : ""}`} onClick={onClick} disabled={busy}>
        <span className="ci" aria-hidden>
          {m.icon}
        </span>
        {l.main}
        {l.sub && <span className="qr-sub">{l.sub}</span>}
      </button>
    );
  };

  return (
    <div className={`qr-f qr-proof${required && !value.length ? " need" : ""}`}>
      <label>
        🛡️ <T k="proofTitle" lang={lang} />
        {required && <span className="qr-need"> · {word("proofRequired", lang)}</span>}
      </label>
      <div className="qr-hint" style={{ marginTop: 0, marginBottom: 6 }}>
        {word("proofHint", lang)}
      </div>
      <div className="qr-chips compact">
        {btn("SIGNATURE", () => setSigning(true))}
        {btn("RECIPIENT_PHOTO", () => photoRef.current?.click())}
        {btn("THUMB_PAPER", () => thumbRef.current?.click())}
      </div>
      <input
        ref={photoRef}
        hidden
        type="file"
        accept="image/*"
        capture="environment"
        onChange={(e) => {
          onFile("RECIPIENT_PHOTO", e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      <input
        ref={thumbRef}
        hidden
        type="file"
        accept="image/*"
        capture="environment"
        onChange={(e) => {
          onFile("THUMB_PAPER", e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      {busy && <div className="qr-hint">⏳ …</div>}
      {value.length > 0 && (
        <div className="qr-thumbs">
          {value.map((v, i) => (
            <div className="qr-thumb" key={v.capturedAt + i}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={v.dataUrl} alt={PROOF_META[v.kind].en} />
              <span className="cap">
                {PROOF_META[v.kind].icon} {lang === "kn" ? PROOF_META[v.kind].kn : PROOF_META[v.kind].en}
              </span>
              <button
                type="button"
                className="x"
                aria-label={word("removeQ", lang)}
                onClick={() => window.confirm(word("removeQ", lang)) && onChange(value.filter((_, j) => j !== i))}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
      <label className="qr-check">
        <input
          type="checkbox"
          checked={copy}
          onChange={(e) => {
            setCopy(e.target.checked);
            setPhoneCopy(e.target.checked);
          }}
        />{" "}
        📱 {word("savePhone", lang)}
      </label>
      {signing && (
        <SignaturePad
          lang={lang}
          stamp={stamp("SIGNATURE")}
          onCancel={() => setSigning(false)}
          onUse={(d) => {
            setSigning(false);
            add("SIGNATURE", d);
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// This device's copy settings (shown in the scanner and in Settings).
// ---------------------------------------------------------------------------
export function DeviceCopySettings({ lang, compact }: { lang: LangMode; compact?: boolean }) {
  const [copy, setCopy] = useState(false);
  const [geo, setGeo] = useState(true);
  const [folder, setFolder] = useState<string | null>(null);
  const [canPick, setCanPick] = useState(false);
  useEffect(() => {
    setCopy(phoneCopyOn());
    setGeo(geoOn());
    setCanPick(canPickFolder());
    savedFolderName().then(setFolder);
  }, []);
  return (
    <div className="qr-devcopy">
      <label className="qr-check">
        <input
          type="checkbox"
          checked={copy}
          onChange={(e) => {
            setCopy(e.target.checked);
            setPhoneCopy(e.target.checked);
          }}
        />{" "}
        📱 {word("savePhone", lang)}
      </label>
      {copy && canPick && (
        <div className="qr-hint">
          📁{" "}
          {folder ? (
            <>
              Folder: <b>{folder}</b> → 06_Scans_&amp;_Proofs / …{" "}
            </>
          ) : (
            "Copies go to Downloads. "
          )}
          <button
            type="button"
            className="qr-linkbtn"
            onClick={() =>
              pickFolder()
                .then((n) => n && setFolder(n))
                .catch(() => {})
            }
          >
            {folder ? "Change folder" : "Choose a folder"}
          </button>
          {folder && (
            <>
              {" · "}
              <button type="button" className="qr-linkbtn" onClick={() => forgetFolder().then(() => setFolder(null))}>
                Use Downloads
              </button>
            </>
          )}
        </div>
      )}
      {copy && !canPick && !compact && (
        <div className="qr-hint">Phone copies go to Downloads, named Payment_Signatures__…, Bills_&amp;_Invoices__… so each kind stays together.</div>
      )}
      {!compact && (
        <label className="qr-check">
          <input
            type="checkbox"
            checked={geo}
            onChange={(e) => {
              setGeo(e.target.checked);
              setGeoOn(e.target.checked);
            }}
          />{" "}
          📍 Record location with each proof (if the phone allows)
        </label>
      )}
    </div>
  );
}
