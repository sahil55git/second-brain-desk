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

const MANUAL_REASONS = ["Scale not working", "Weighed at the weighbridge", "Other"];

/** "191.300" or "191,3" → number (0 when empty / not a number). */
const toNum = (v: string) => {
  const n = Number(v.trim().replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};

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
  const [manualReason, setManualReason] = useState(MANUAL_REASONS[0]);
  const [manualAt, setManualAt] = useState(localNow());
  const [reweigh, setReweigh] = useState(false);
  const [scanPhase, setScanPhase] = useState<Phase | null>(null); // a FULL / EMPTY weight label says which weight it is for
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

  useEffect(() => {
    if (target && scanPhase) setPhase(scanPhase);
  }, [target?.id, scanPhase]); // eslint-disable-line react-hooks/exhaustive-deps

  const problem = useMemo(() => {
    if (!target || !targetLot) return null;
    const n = pad(target.seq);
    if (targetLot.status === "CLOSED") return `Lot ${targetLot.lotNo} is closed${isOwner ? " — reopen it first." : ". Ask the owner."}`;
    if (phase === "GROSS" && target.grossKg != null && !reweigh) return `Barrel ${n} is already weighed full (${kg(target.grossKg)} kg).`;
    if (phase === "EMPTY" && target.grossKg == null) return `Barrel ${n} has not been weighed full yet.`;
    if (phase === "EMPTY" && target.emptyKg != null && !reweigh) return `Barrel ${n} is already weighed empty (${kg(target.emptyKg)} kg).`;
    return null;
  }, [target, targetLot, phase, reweigh, isOwner]);

  const manualNote = manualReason === "Other" ? manualWhy.trim() : manualReason;

  // Barrels that can take this weight right now — so a weight can be typed without scanning.
  const pickList = useMemo(() => {
    const out: { code: string; text: string }[] = [];
    for (const l of hintLot ? [hintLot] : lots) {
      if (l.status === "CLOSED") continue;
      for (const b of l.barrels) {
        const needs = phase === "GROSS" ? b.grossKg == null : b.grossKg != null && b.emptyKg == null;
        if (needs) out.push({ code: b.code, text: `Barrel ${pad(b.seq)} · ${l.supplierName} · ${l.product} · ${l.lotNo}` });
      }
    }
    return out;
  }, [lots, hintLot, phase]);

  // Why the "Enter weight" button cannot save yet — shown in words, never a silent grey button.
  const manualBlock = !target
    ? "First choose the barrel: scan it, type its label, or pick it from the list."
    : problem
      ? problem
      : !(toNum(manualKg) > 0)
        ? "Type the weight in kg in the big box."
        : manualNote.length < 3
          ? "Write the reason."
          : !manualAt
            ? "Set the date and time of weighing."
            : null;

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
          kg: viaManual ? toNum(manualKg) : undefined,
          weighedAt: viaManual && manualAt ? new Date(manualAt).toISOString() : undefined,
          note: viaManual ? manualNote : reweigh ? why : undefined,
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
      setManualReason(MANUAL_REASONS[0]);
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
            const f = findBarrelCode(v);
            setCodeText(f?.code ?? v); // a scanned QR link turns into the plain code
            setScanPhase(f?.phase ?? null);
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

      <div className="bd-manual">
        <button className={`bd-btn ${manual ? "" : "big"}`} onClick={() => setManual((v) => !v)}>
          ✍️ {manual ? "Close" : <L en="Enter weight by hand" kn="ತೂಕವನ್ನು ಕೈಯಿಂದ ಬರೆಯಿರಿ" />}
        </button>
        {manual && (
          <div className="bd-mbox">
            <div className="bd-mstep">
              <b>1 · Barrel</b>
              {target ? (
                <span>
                  Barrel {pad(target.seq)} · {target.code}
                </span>
              ) : (
                <select className="bd-pick" value="" onChange={(e) => { setCodeText(e.target.value); setMsg(null); }} aria-label="Choose barrel">
                  <option value="">{pickList.length ? "— choose the barrel —" : "No barrel is waiting for this weight"}</option>
                  {pickList.map((o) => (
                    <option key={o.code} value={o.code}>
                      {o.text}
                    </option>
                  ))}
                </select>
              )}
              {target && (
                <button className="bd-linkbtn" onClick={() => setCodeText("")}>
                  change
                </button>
              )}
            </div>
            <div className="bd-mstep">
              <b>2 · {phase === "GROSS" ? "Full barrel weight (oil + barrel)" : "Empty barrel weight"}</b>
              <div className="bd-mkg">
                <input
                  className="bd-mkg-in"
                  inputMode="decimal"
                  placeholder="0.000"
                  value={manualKg}
                  onChange={(e) => setManualKg(e.target.value)}
                  aria-label="Weight in kg"
                />
                <span>kg</span>
              </div>
            </div>
            <div className="bd-mstep">
              <b>3 · Weighed on</b>
              <input type="datetime-local" className="bd-dt" value={manualAt} max={localNow()} onChange={(e) => setManualAt(e.target.value)} aria-label="Date and time of weighing" />
            </div>
            <div className="bd-mstep">
              <b>4 · Reason</b>
              <select value={manualReason} onChange={(e) => setManualReason(e.target.value)} aria-label="Reason for typing the weight">
                {MANUAL_REASONS.map((r) => (
                  <option key={r}>{r}</option>
                ))}
              </select>
              {manualReason === "Other" && <input className="bd-why" placeholder="Write the reason" value={manualWhy} onChange={(e) => setManualWhy(e.target.value)} />}
            </div>
            <button className="bd-btn primary huge" disabled={busy} onClick={() => (manualBlock ? setMsg({ ok: false, text: manualBlock }) : save(true))}>
              ✅ <L en={`Enter ${phase === "GROSS" ? "full" : "empty"} weight`} kn="ತೂಕ ದಾಖಲಿಸಿ" />
              {toNum(manualKg) > 0 ? ` — ${kg(toNum(manualKg))} kg` : ""}
            </button>
            {manualBlock && <div className="bd-m small">{manualBlock}</div>}
            <div className="bd-m small">A typed weight is marked “typed” in the record with your name and the time, and the owner sees a flag.</div>
          </div>
        )}
      </div>

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

      {scanning && (
        <BarcodeScanner
          onClose={() => setScanning(false)}
          onCode={(c) => {
            const f = findBarrelCode(c);
            setCodeText(f?.code ?? c);
            setScanPhase(f?.phase ?? null);
            setScanning(false);
            setMsg(null);
          }}
        />
      )}
    </div>
  );
}

