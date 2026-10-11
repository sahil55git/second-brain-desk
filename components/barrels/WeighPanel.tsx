"use client";

// Weigh a barrel — full OR empty — from anywhere. Scan (or type) a barrel label and
// the panel finds the barrel in whichever lot it belongs to and picks the next step:
// a barrel with no weight gets its FULL weight, a full one gets its EMPTY weight.
// Barrels may wait days between the two, so nothing here depends on the lot being
// the one currently open on screen.
//
// Weights come from the scale itself (the bridge posts each steady reading; the
// browser never types the number). Typing a weight is a flagged fallback.

import { useEffect, useMemo, useRef, useState } from "react";
import { findBarrelCode, tickFresh, type Phase } from "@/lib/barrels";
import { useScale } from "@/components/ScaleProvider";
import BarcodeScanner, { cameraScanSupported } from "@/components/barrels/BarcodeScanner";
import { api, kg, L, pad, when, whenFull, type BarrelRow, type Lot, type Tick } from "@/components/barrels/shared";

interface Saved {
  ok: boolean;
  text: string;
  slipCode?: string;
}

/** `datetime-local` value for "now" in the browser's clock. */
function localNow(): string {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

export default function WeighPanel({
  lots,
  isOwner,
  presetCode,
  hintLot,
  onSaved,
}: {
  lots: Lot[];
  isOwner: boolean;
  /** Fill the code box (from a table button, a deep link, or a scanned QR). */
  presetCode?: string | null;
  /** When the panel sits inside one lot, offer that lot's next barrels. */
  hintLot?: Lot;
  onSaved: (lot: Lot) => void;
}) {
  const [phase, setPhase] = useState<Phase>("GROSS");
  const [codeText, setCodeText] = useState(presetCode ?? "");
  const [scanning, setScanning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Saved | null>(null);
  const [manual, setManual] = useState(false);
  const [manualKg, setManualKg] = useState("");
  const [manualWhy, setManualWhy] = useState("");
  const [manualAt, setManualAt] = useState(localNow());
  const [reweigh, setReweigh] = useState(false);
  const [why, setWhy] = useState("");
  const codeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (presetCode) {
      setCodeText(presetCode);
      setMsg(null);
    }
  }, [presetCode]);

  // --- scale readings ---------------------------------------------------------
  const [ticks, setTicks] = useState<Tick[]>([]);
  const [skew, setSkew] = useState(0);
  const [, force] = useState(0);
  const { selectedReading, connected: bridgeOn } = useScale();
  useEffect(() => {
    let alive = true;
    const pull = () =>
      api<{ data: Tick[]; serverNow: number }>("/api/scale-ticks")
        .then((j) => {
          if (!alive) return;
          setTicks(j.data);
          setSkew(j.serverNow - Date.now());
        })
        .catch(() => {});
    pull();
    const t = setInterval(() => document.visibilityState === "visible" && pull(), 2500);
    const t2 = setInterval(() => force((n) => n + 1), 1000);
    return () => {
      alive = false;
      clearInterval(t);
      clearInterval(t2);
    };
  }, []);
  const nowServer = Date.now() + skew;
  const usable = ticks.find((t) => !t.usedAt && tickFresh(new Date(t.settledAt).getTime(), nowServer));
  const usableAge = usable ? Math.max(0, Math.round((nowServer - new Date(usable.settledAt).getTime()) / 1000)) : null;

  // --- which barrel -----------------------------------------------------------
  const parsed = findBarrelCode(codeText);
  const hit = useMemo(() => {
    if (!parsed) return null;
    for (const l of lots) {
      const b = l.barrels.find((x) => x.code === parsed.code);
      if (b) return { lot: l, barrel: b as BarrelRow };
    }
    return null;
  }, [parsed, lots]);
  const target = hit?.barrel;
  const targetLot = hit?.lot;

  // Pick the next step for the barrel that was just identified.
  useEffect(() => {
    if (!target) return;
    setPhase(target.grossKg == null ? "GROSS" : "EMPTY");
    setReweigh(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target?.id, target?.grossKg, target?.emptyKg]);

  const problem = useMemo(() => {
    if (!target || !targetLot) return null;
    const n = pad(target.seq);
    if (targetLot.status === "CLOSED") return `Lot ${targetLot.lotNo} is closed${isOwner ? " — reopen it first." : ". Ask the owner."}`;
    if (phase === "GROSS" && target.grossKg != null && !reweigh) return `Barrel ${n} is already weighed full (${kg(target.grossKg)} kg).`;
    if (phase === "EMPTY" && target.grossKg == null) return `Barrel ${n} has not been weighed full yet.`;
    if (phase === "EMPTY" && target.emptyKg != null && !reweigh) return `Barrel ${n} is already weighed empty (${kg(target.emptyKg)} kg).`;
    return null;
  }, [target, targetLot, phase, reweigh, isOwner]);

  const save = async (viaManual: boolean) => {
    if (!target || !targetLot) return;
    setBusy(true);
    setMsg(null);
    try {
      const j = await api<{ data: Lot; barrel: BarrelRow; kg: number }>("/api/barrels/weigh", {
        method: "POST",
        json: {
          code: target.code,
          phase,
          source: viaManual ? "MANUAL" : "SCALE",
          tickId: viaManual ? undefined : usable?.id,
          kg: viaManual ? Number(manualKg) : undefined,
          weighedAt: viaManual && manualAt ? new Date(manualAt).toISOString() : undefined,
          note: viaManual ? manualWhy : reweigh ? why : undefined,
          reweigh,
        },
      });
      onSaved(j.data);
      const b = j.barrel;
      const n = pad(target.seq);
      const text =
        phase === "GROSS"
          ? `Barrel ${n}: full (oil + barrel) ${kg(j.kg)} kg saved ✓ — pour it out, then scan it again to weigh the empty barrel.`
          : b.grossKg != null
            ? `Barrel ${n}: ${kg(b.grossKg)} (full) − ${kg(j.kg)} (empty barrel) = ${kg(b.net)} kg oil ✓`
            : `Barrel ${n}: empty ${kg(j.kg)} kg saved ✓`;
      setMsg({ ok: true, text, slipCode: target.code });
      setCodeText("");
      setManualKg("");
      setManualWhy("");
      setManualAt(localNow());
      setWhy("");
      setReweigh(false);
      setManual(false);
      codeRef.current?.focus();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Could not save." });
    } finally {
      setBusy(false);
    }
  };

  const nextFull = hintLot?.barrels.find((b) => b.state === "NEW");
  const nextEmpty = hintLot?.barrels.find((b) => b.state === "FULL");

  return (
    <div className="bd-card bd-weigh">
      <div className="bd-steps" role="tablist">
        <button role="tab" aria-selected={phase === "GROSS"} className={phase === "GROSS" ? "on" : ""} onClick={() => { setPhase("GROSS"); setReweigh(false); }}>
          ① <L en="Full barrel" kn="ತುಂಬಿದ ಬ್ಯಾರಲ್" />
          <small>oil + barrel, before pouring</small>
        </button>
        <button role="tab" aria-selected={phase === "EMPTY"} className={phase === "EMPTY" ? "on" : ""} onClick={() => { setPhase("EMPTY"); setReweigh(false); }}>
          ② <L en="Empty barrel" kn="ಖಾಲಿ ಬ್ಯಾರಲ್" />
          <small>tare, after pouring &amp; draining — any day</small>
        </button>
      </div>

      <div className="bd-scanrow">
        <input
          ref={codeRef}
          className="bd-code"
          value={codeText}
          onChange={(e) => {
            const v = e.target.value;
            setCodeText(findBarrelCode(v)?.code ?? v); // a scanned QR link turns into the plain code
            setMsg(null);
          }}
          placeholder="Scan or type the barrel label…"
          inputMode="text"
          autoCapitalize="characters"
          autoComplete="off"
          aria-label="Barrel label code"
        />
        <button className="bd-btn big" onClick={() => setScanning(true)} disabled={!cameraScanSupported()} title={cameraScanSupported() ? "" : "This browser cannot read barcodes. Use a USB scanner or type."}>
          📷 <L en="Scan" kn="ಸ್ಕ್ಯಾನ್" />
        </button>
      </div>
      {hintLot && phase === "GROSS" && nextFull && !codeText && (
        <div className="bd-m small">Next unweighed: Barrel {pad(nextFull.seq)} <button className="bd-linkbtn" onClick={() => setCodeText(nextFull.code)}>use</button></div>
      )}
      {hintLot && phase === "EMPTY" && nextEmpty && !codeText && (
        <div className="bd-m small">Waiting to be weighed empty: Barrel {pad(nextEmpty.seq)} <button className="bd-linkbtn" onClick={() => setCodeText(nextEmpty.code)}>use</button></div>
      )}

      {codeText && !parsed && <div className="bd-err">That does not look like a barrel label.</div>}
      {parsed && !hit && <div className="bd-err">No barrel with this label in the open lots. If its lot was closed, ask the owner to reopen it.</div>}
      {target && targetLot && (
        <div className="bd-target">
          <b>Barrel {pad(target.seq)}</b> · {target.code}
          <span className="bd-m"> · {targetLot.supplierName} · {targetLot.product}</span>
          <div className="bd-m small">
            full {kg(target.grossKg)} kg{target.grossAt ? ` (${when(target.grossAt)})` : ""} · empty {kg(target.emptyKg)} kg{target.emptyAt ? ` (${when(target.emptyAt)})` : ""}
            {target.grossAt && target.emptyKg == null ? ` · waiting ${Math.max(0, Math.floor((Date.now() - new Date(target.grossAt).getTime()) / 86_400_000))} day(s)` : ""}
          </div>
        </div>
      )}
      {problem && (
        <div className="bd-err">
          {problem}{" "}
          {isOwner && !reweigh && targetLot?.status !== "CLOSED" && (
            <button className="bd-linkbtn" onClick={() => setReweigh(true)}>
              Weigh again (owner)
            </button>
          )}
        </div>
      )}
      {reweigh && isOwner && <input className="bd-why" value={why} onChange={(e) => setWhy(e.target.value)} placeholder="Why weigh again? (kept in the record)" />}

      <div className={`bd-scale ${usable ? "ready" : ""}`}>
        {usable ? (
          <>
            <div className="bd-big">{kg(usable.weightKg)} <small>kg</small></div>
            <div className="bd-m">
              <span className="bd-dot on" /> <L en="Steady" kn="ಸ್ಥಿರ" /> · {usable.source} · weighed {whenFull(usable.settledAt)} ({usableAge}s ago)
            </div>
          </>
        ) : (
          <>
            <div className="bd-big dim">— <small>kg</small></div>
            <div className="bd-m">
              <span className="bd-dot" /> <L en="Waiting for a steady reading…" kn="ಸ್ಥಿರ ತೂಕಕ್ಕಾಗಿ ಕಾಯುತ್ತಿದೆ…" />
            </div>
            <div className="bd-m small">Put the barrel on the platform and keep it still for a few seconds.</div>
          </>
        )}
        {bridgeOn && selectedReading && (
          <div className="bd-m small">Live on the scale now: {kg(selectedReading.weight)} kg {selectedReading.stable ? "" : "(may still be moving)"}</div>
        )}
      </div>

      <button className="bd-btn primary huge" disabled={busy || !target || !!problem || !usable || (reweigh && why.trim().length < 3)} onClick={() => save(false)}>
        ✅ <L en={`Save ${phase === "GROSS" ? "full" : "empty"} weight`} kn="ತೂಕ ಉಳಿಸಿ" />
        {usable && target ? ` — ${kg(usable.weightKg)} kg` : ""}
      </button>
      {!usable && !ticks.length && (
        <div className="bd-m small">No reading has come from the scale in the last 15 minutes. Check that the scale bridge is running on the shop PC (see docs/BARREL-RECEIVING.md).</div>
      )}

      {msg && (
        <div className={msg.ok ? "bd-ok" : "bd-err"}>
          {msg.text}
          {msg.ok && msg.slipCode && (
            <>
              {" "}
              <a className="bd-linkbtn" href={`/barrels/print?slip=${encodeURIComponent(msg.slipCode)}`} target="_blank" rel="noreferrer">
                🖨️ Print slip
              </a>
            </>
          )}
        </div>
      )}

      <div className="bd-manual">
        <button className="bd-linkbtn" onClick={() => setManual((v) => !v)}>
          {manual ? "Hide" : "Scale not working? Type the weight"}
        </button>
        {manual && (
          <>
            <div className="bd-row">
              <input className="bd-n" inputMode="decimal" placeholder="kg" value={manualKg} onChange={(e) => setManualKg(e.target.value)} aria-label="Weight in kg" />
              <label className="bd-inline small">
                Weighed on
                <input type="datetime-local" className="bd-dt" value={manualAt} max={localNow()} onChange={(e) => setManualAt(e.target.value)} aria-label="Date and time of weighing" />
              </label>
            </div>
            <div className="bd-row">
              <input className="bd-why" placeholder="Why? (required — e.g. scale not working, weighed at weighbridge)" value={manualWhy} onChange={(e) => setManualWhy(e.target.value)} />
              <button className="bd-btn" disabled={busy || !target || !!problem || !Number(manualKg) || manualWhy.trim().length < 3 || !manualAt} onClick={() => save(true)}>
                Save typed weight
              </button>
            </div>
            <div className="bd-m small">A typed weight is marked in the record, the owner is shown a warning, and the real time it was saved is kept next to the time you enter.</div>
          </>
        )}
      </div>

      {scanning && (
        <BarcodeScanner
          onClose={() => setScanning(false)}
          onCode={(c) => {
            setCodeText(findBarrelCode(c)?.code ?? c);
            setScanning(false);
            setMsg(null);
          }}
        />
      )}
    </div>
  );
}

