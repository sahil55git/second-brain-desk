"use client";

// Weigh or move one of the shop's own barrels. Scan (or type) the label and the panel opens
// that barrel and suggests the next step:
//   no tare yet → weigh it EMPTY (that weight becomes its tare)
//   empty       → weigh it FULL after filling (net oil = full − tare)
//   full        → send it out (sale / transport / storage / refill), or weigh it again first
//   away        → bring it back
// Weights come from the platform scale (the bridge posts each steady reading; the browser never
// types the number). Typing a weight is a flagged fallback that needs a reason.

import { useEffect, useMemo, useRef, useState } from "react";
import { tickFresh } from "@/lib/barrels";
import { LOCATIONS, LOCATION_LABEL, PURPOSES, PURPOSE_LABEL, findFleetCode, type Location } from "@/lib/barrelFleet";
import { useScale } from "@/components/ScaleProvider";
import BarcodeScanner, { cameraScanSupported } from "@/components/barrels/BarcodeScanner";
import { api, kg, L, when, whenFull, type Tick } from "@/components/barrels/shared";
import { PRODUCTS, STATUS_CHIP, localNow, toNum, type FBarrel } from "@/components/barrels/fleet/types";

type Mode = "GROSS" | "EMPTY" | "MOVE";
interface Saved {
  ok: boolean;
  text: string;
  eventId?: string;
}
const MANUAL_REASONS = ["Scale not working", "Weighed at the weighbridge", "Other"];

function suggestMode(b: FBarrel): Mode {
  if (b.tareKg == null) return "EMPTY";
  if (b.location !== "SHOP") return "MOVE"; // away: bring it back
  if (b.status === "EMPTY") return "GROSS";
  return "MOVE"; // full in the shop: send it out
}

export default function FleetWeigh({
  barrels,
  parties,
  isOwner,
  presetCode,
  onSaved,
}: {
  barrels: FBarrel[];
  parties: string[];
  isOwner: boolean;
  presetCode?: string | null;
  onSaved: () => void;
}) {
  const [codeText, setCodeText] = useState(presetCode ?? "");
  const [scanning, setScanning] = useState(false);
  const [mode, setMode] = useState<Mode>("GROSS");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Saved | null>(null);
  const codeRef = useRef<HTMLInputElement>(null);

  // weighing fields
  const [product, setProduct] = useState(PRODUCTS[0]);
  const [otherProduct, setOtherProduct] = useState("");
  const [retare, setRetare] = useState(false);
  const [retareWhy, setRetareWhy] = useState("");
  const [manual, setManual] = useState(false);
  const [manualKg, setManualKg] = useState("");
  const [manualReason, setManualReason] = useState(MANUAL_REASONS[0]);
  const [manualWhy, setManualWhy] = useState("");
  const [manualAt, setManualAt] = useState(localNow());

  // move fields
  const [to, setTo] = useState<Location>("CUSTOMER");
  const [holder, setHolder] = useState("");
  const [vehicleNo, setVehicleNo] = useState("");
  const [purpose, setPurpose] = useState<string>("SALE");
  const [ref, setRef] = useState("");
  const [moveNote, setMoveNote] = useState("");

  useEffect(() => {
    if (presetCode) {
      setCodeText(presetCode);
      setMsg(null);
    }
  }, [presetCode]);

  // --- scale readings (same feed the supplier-lot desk uses) -------------------
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
  const parsed = findFleetCode(codeText);
  const target = useMemo(() => (parsed ? barrels.find((b) => b.code === parsed.code) ?? null : null), [parsed, barrels]);

  useEffect(() => {
    if (!target) return;
    setMode(suggestMode(target));
    setTo(target.location !== "SHOP" ? "SHOP" : "CUSTOMER");
    setHolder("");
    setRetare(false);
    setRetareWhy("");
    if (target.product) setProduct(PRODUCTS.includes(target.product) ? target.product : PRODUCTS[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target?.id]);

  const chosenProduct = product === "__other" ? otherProduct.trim() : product;
  const manualNote = manualReason === "Other" ? manualWhy.trim() : manualReason;
  const empty = mode === "EMPTY";
  const setsTare = empty && !!target && (target.tareKg == null || retare);

  // Why the save button cannot work yet, in words (never a silent grey button).
  const problem = useMemo(() => {
    if (!target) return null;
    if (!target.active || target.condition === "RETIRED") return `${target.code} is retired.`;
    if (mode === "GROSS" && target.tareKg == null) return `${target.code} has no tare yet. Weigh it empty first.`;
    if (mode === "GROSS" && chosenProduct.length < 2) return "Choose which oil is in the barrel.";
    if (mode === "EMPTY" && retare && retareWhy.trim().length < 3) return "Write why the tare is changing (for example: new dent, repaired).";
    return null;
  }, [target, mode, chosenProduct, retare, retareWhy]);

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

  const reset = () => {
    setCodeText("");
    setManualKg("");
    setManualWhy("");
    setManualReason(MANUAL_REASONS[0]);
    setManualAt(localNow());
    setManual(false);
    setRetare(false);
    setRetareWhy("");
    setHolder("");
    setVehicleNo("");
    setRef("");
    setMoveNote("");
    codeRef.current?.focus();
  };

  const saveWeight = async (viaManual: boolean) => {
    if (!target) return;
    setBusy(true);
    setMsg(null);
    try {
      const j = await api<{ data: FBarrel; eventId: string; kg: number; net: number | null; setsTare: boolean }>("/api/barrel-fleet/weigh", {
        method: "POST",
        json: {
          code: target.code,
          phase: mode,
          source: viaManual ? "MANUAL" : "SCALE",
          tickId: viaManual ? undefined : usable?.id,
          kg: viaManual ? toNum(manualKg) : undefined,
          weighedAt: viaManual && manualAt ? new Date(manualAt).toISOString() : undefined,
          note: viaManual ? manualNote : retare ? retareWhy.trim() : undefined,
          product: mode === "GROSS" ? chosenProduct : undefined,
          setTare: mode === "EMPTY" ? retare : undefined,
        },
      });
      const b = j.data;
      const text =
        mode === "GROSS"
          ? `${b.code}: ${kg(j.kg)} kg on the scale − ${kg(b.tareKg)} kg barrel = ${kg(j.net)} kg ${b.product ?? "oil"} ✓`
          : j.setsTare
            ? `${b.code}: empty weight ${kg(j.kg)} kg saved as this barrel's TARE ✓`
            : `${b.code}: empty ${kg(j.kg)} kg (tare ${kg(b.tareKg)} kg)${j.net != null ? ` · ${kg(j.net)} kg oil went out of it` : ""} ✓`;
      setMsg({ ok: true, text, eventId: j.eventId });
      reset();
      onSaved();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Could not save." });
    } finally {
      setBusy(false);
    }
  };

  const moveBlock = !target ? "First choose the barrel." : to !== "SHOP" && holder.trim().length < 2 ? "Write who is taking it: customer, supplier or vehicle." : null;
  const saveMove = async () => {
    if (!target) return;
    setBusy(true);
    setMsg(null);
    try {
      const j = await api<{ data: FBarrel; eventId: string }>("/api/barrel-fleet/move", {
        method: "POST",
        json: { code: target.code, to, holder: holder.trim() || undefined, vehicleNo: vehicleNo.trim() || undefined, purpose: to === "SHOP" ? undefined : purpose, ref: ref.trim() || undefined, note: moveNote.trim() || undefined },
      });
      const oil = target.status === "FULL" ? ` with ${kg(target.netKg)} kg ${target.product ?? "oil"}` : " (empty)";
      setMsg({
        ok: true,
        text: to === "SHOP" ? `${target.code} is back in the shop${oil} ✓` : `${target.code}${oil} → ${LOCATION_LABEL[to].en.toLowerCase()} ${holder.trim()} ✓`,
        eventId: j.eventId,
      });
      reset();
      onSaved();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Could not save." });
    } finally {
      setBusy(false);
    }
  };

  const pickList = useMemo(() => barrels.filter((b) => b.active), [barrels]);

  return (
    <div className="bd-card bd-weigh">
      <div className="bd-scanrow">
        <input
          ref={codeRef}
          className="bd-code"
          value={codeText}
          onChange={(e) => {
            const v = e.target.value;
            setCodeText(findFleetCode(v)?.code ?? v); // a scanned QR link turns into the plain code
            setMsg(null);
          }}
          placeholder="Scan or type the barrel label (BRL-07)…"
          inputMode="text"
          autoCapitalize="characters"
          autoComplete="off"
          aria-label="Barrel label code"
        />
        <button className="bd-btn big" onClick={() => setScanning(true)} disabled={!cameraScanSupported()} title={cameraScanSupported() ? "" : "This browser cannot read barcodes. Use a USB scanner or type."}>
          📷 <L en="Scan" kn="ಸ್ಕ್ಯಾನ್" />
        </button>
      </div>
      {!target && (
        <select className="bd-pick" value="" onChange={(e) => { setCodeText(e.target.value); setMsg(null); }} aria-label="Choose barrel">
          <option value="">— or choose the barrel from the list —</option>
          {pickList.map((b) => (
            <option key={b.code} value={b.code}>
              {b.code} · {b.status === "FULL" ? `full ${kg(b.netKg)} kg ${b.product ?? ""}` : b.status === "EMPTY" ? "empty" : "no tare yet"} · {LOCATION_LABEL[b.location as Location]?.en ?? b.location}
              {b.holder ? ` (${b.holder})` : ""}
            </option>
          ))}
        </select>
      )}
      {codeText && !parsed && <div className="bd-err">That does not look like one of our barrel labels (BRL-01, BRL-02 …). Barrels from a supplier lot are handled on the Barrel receiving page.</div>}
      {parsed && !target && <div className="bd-err">{parsed.code} is not registered yet. The owner can add it in Setup.</div>}

      {target && (
        <div className="bd-target">
          <b>{target.code}</b>
          {target.mark ? <span className="bd-m"> · {target.mark}</span> : null}{" "}
          <span className={`bd-chip ${STATUS_CHIP[target.status]?.cls ?? ""}`}>{STATUS_CHIP[target.status]?.en}</span>
          <div className="bd-m small">
            tare {target.tareKg != null ? `${kg(target.tareKg)} kg` : "not set"}
            {target.status === "FULL" ? ` · ${kg(target.netKg)} kg ${target.product ?? "oil"} (full ${kg(target.grossKg)} kg, ${when(target.grossAt)})` : ""}
            {" · "}
            {LOCATION_LABEL[target.location as Location]?.en ?? target.location}
            {target.holder ? ` · ${target.holder}` : ""}
            {target.awayDays != null ? ` · ${target.awayDays} day(s)` : ""}
          </div>
          {target.flags.length > 0 && (
            <ul className="bd-flags">
              {target.flags.map((f) => (
                <li key={f.code} className={f.level}>{f.msg}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {target && (
        <div className="bd-steps" role="tablist" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))" }}>
          <button role="tab" aria-selected={mode === "EMPTY"} className={mode === "EMPTY" ? "on" : ""} onClick={() => setMode("EMPTY")}>
            ⚖️ <L en="Empty weight" kn="ಖಾಲಿ ತೂಕ" />
            <small>{target.tareKg == null ? "sets the tare" : "check after pouring"}</small>
          </button>
          <button role="tab" aria-selected={mode === "GROSS"} className={mode === "GROSS" ? "on" : ""} onClick={() => setMode("GROSS")}>
            ⚖️ <L en="Full weight" kn="ತುಂಬಿದ ತೂಕ" />
            <small>after filling, net = full − tare</small>
          </button>
          <button role="tab" aria-selected={mode === "MOVE"} className={mode === "MOVE" ? "on" : ""} onClick={() => setMode("MOVE")}>
            🚚 <L en={target.location === "SHOP" ? "Send out" : "Move / bring back"} kn="ಕಳುಹಿಸಿ / ವಾಪಸ್" />
            <small>sale, transport, storage, return</small>
          </button>
        </div>
      )}

      {target && mode !== "MOVE" && (
        <>
          {mode === "GROSS" && (
            <div className="bd-form" style={{ marginTop: 8 }}>
              <label>
                Oil in the barrel
                <select value={product} onChange={(e) => setProduct(e.target.value)} aria-label="Oil in the barrel">
                  {PRODUCTS.map((p) => (
                    <option key={p}>{p}</option>
                  ))}
                  <option value="__other">Other…</option>
                </select>
              </label>
              {product === "__other" && (
                <label>
                  Oil name
                  <input value={otherProduct} onChange={(e) => setOtherProduct(e.target.value)} placeholder="e.g. Ekatva blend" aria-label="Oil name" />
                </label>
              )}
            </div>
          )}
          {empty && target.tareKg == null && <div className="bd-m small">This barrel has no tare yet. Put it on the scale <b>empty and dry</b>: this weight becomes its tare for every later net weight.</div>}
          {empty && target.tareKg != null && (
            <div className="bd-m small">
              Tare stays <b>{kg(target.tareKg)} kg</b>. This weighing checks the barrel after pouring and shows the oil that came out.
              {isOwner && (
                <label className="bd-check" style={{ display: "flex", marginTop: 6 }}>
                  <input type="checkbox" checked={retare} onChange={(e) => setRetare(e.target.checked)} /> Owner: use this weight as the barrel&apos;s new tare
                </label>
              )}
              {retare && <input className="bd-why" style={{ width: "100%" }} value={retareWhy} onChange={(e) => setRetareWhy(e.target.value)} placeholder="Why is the tare changing? (kept in the ledger)" aria-label="Reason for new tare" />}
            </div>
          )}

          <div className={`bd-scale ${usable ? "ready" : ""}`}>
            {usable ? (
              <>
                <div className="bd-big">{kg(usable.weightKg)} <small>kg</small></div>
                {mode === "GROSS" && target.tareKg != null && usable.weightKg > target.tareKg && (
                  <div className="bd-m">
                    − {kg(target.tareKg)} tare = <b>{kg(Math.round((usable.weightKg - target.tareKg) * 100) / 100)} kg oil</b>
                  </div>
                )}
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
            {bridgeOn && selectedReading && <div className="bd-m small">Live on the scale now: {kg(selectedReading.weight)} kg {selectedReading.stable ? "" : "(may still be moving)"}</div>}
          </div>
          {problem && <div className="bd-err">{problem}</div>}
          <button className="bd-btn primary huge" disabled={busy || !!problem || !usable} onClick={() => saveWeight(false)}>
            ✅ <L en={`Save ${mode === "GROSS" ? "full" : setsTare ? "tare (empty)" : "empty"} weight`} kn="ತೂಕ ಉಳಿಸಿ" />
            {usable ? ` — ${kg(usable.weightKg)} kg` : ""}
          </button>
          {!usable && !ticks.length && <div className="bd-m small">No reading has come from the scale in the last 15 minutes. Check that the scale bridge is running on the shop PC (see docs/BARREL-RECEIVING.md).</div>}

          <div className="bd-manual">
            <button className={`bd-btn ${manual ? "" : "big"}`} onClick={() => setManual((v) => !v)}>
              ✍️ {manual ? "Close" : <L en="Enter weight by hand" kn="ತೂಕವನ್ನು ಕೈಯಿಂದ ಬರೆಯಿರಿ" />}
            </button>
            {manual && (
              <div className="bd-mbox">
                <div className="bd-mstep">
                  <b>1 · {mode === "GROSS" ? "Full barrel weight (oil + barrel)" : "Empty barrel weight"}</b>
                  <div className="bd-mkg">
                    <input className="bd-mkg-in" inputMode="decimal" placeholder="0.000" value={manualKg} onChange={(e) => setManualKg(e.target.value)} aria-label="Weight in kg" />
                    <span>kg</span>
                  </div>
                </div>
                <div className="bd-mstep">
                  <b>2 · Weighed on</b>
                  <input type="datetime-local" className="bd-dt" value={manualAt} max={localNow()} onChange={(e) => setManualAt(e.target.value)} aria-label="Date and time of weighing" />
                </div>
                <div className="bd-mstep">
                  <b>3 · Reason</b>
                  <select value={manualReason} onChange={(e) => setManualReason(e.target.value)} aria-label="Reason for typing the weight">
                    {MANUAL_REASONS.map((r) => (
                      <option key={r}>{r}</option>
                    ))}
                  </select>
                  {manualReason === "Other" && <input className="bd-why" placeholder="Write the reason" value={manualWhy} onChange={(e) => setManualWhy(e.target.value)} />}
                </div>
                <button className="bd-btn primary huge" disabled={busy} onClick={() => (manualBlock ? setMsg({ ok: false, text: manualBlock }) : saveWeight(true))}>
                  ✅ <L en="Enter weight" kn="ತೂಕ ದಾಖಲಿಸಿ" />
                  {toNum(manualKg) > 0 ? ` — ${kg(toNum(manualKg))} kg` : ""}
                </button>
                {manualBlock && <div className="bd-m small">{manualBlock}</div>}
                <div className="bd-m small">A typed weight is marked “typed” in the ledger with your name and the time, and the owner sees a flag.</div>
              </div>
            )}
          </div>
        </>
      )}

      {target && mode === "MOVE" && (
        <div className="bd-mbox" style={{ marginTop: 10 }}>
          {target.status === "FULL" && target.location === "SHOP" && (
            <div className="bd-m small">
              Going out with <b>{kg(target.netKg)} kg {target.product ?? "oil"}</b> (last weighed full {when(target.grossAt)}). Weigh it full again first if it has been standing for a while.{" "}
              <button className="bd-linkbtn" onClick={() => setMode("GROSS")}>Weigh it full now</button>
            </div>
          )}
          {target.status === "EMPTY" && target.location === "SHOP" && <div className="bd-m small">This barrel is empty. Going out empty (for example to a supplier for refilling).</div>}
          <div className="bd-mstep">
            <b>Where is it going?</b>
            <div className="bd-row" style={{ marginTop: 4 }}>
              {LOCATIONS.map((l) => (
                <button key={l} className={`bd-chip${to === l ? " on" : ""}`} onClick={() => setTo(l)} disabled={l === target.location && l === "SHOP"}>
                  {LOCATION_LABEL[l].en}
                </button>
              ))}
            </div>
          </div>
          <div className="bd-form">
            <label>
              {to === "SHOP" ? "Brought back by (optional)" : to === "VEHICLE" ? "Driver / vehicle owner" : to === "REPAIR" ? "Repair shop" : to === "SUPPLIER" ? "Supplier" : "Customer"}
              <input value={holder} onChange={(e) => setHolder(e.target.value)} list="fleet-parties" placeholder="name" aria-label="Who has the barrel" />
            </label>
            <datalist id="fleet-parties">
              {parties.map((p) => (
                <option key={p} value={p} />
              ))}
            </datalist>
            {to !== "SHOP" && (
              <label>
                Purpose
                <select value={purpose} onChange={(e) => setPurpose(e.target.value)} aria-label="Purpose">
                  {PURPOSES.map((p) => (
                    <option key={p} value={p}>{PURPOSE_LABEL[p]}</option>
                  ))}
                </select>
              </label>
            )}
            <label>
              Vehicle no. (optional)
              <input value={vehicleNo} onChange={(e) => setVehicleNo(e.target.value)} placeholder="KA 38 B 1234" autoCapitalize="characters" aria-label="Vehicle number" />
            </label>
            <label>
              Bill / challan no. (optional)
              <input value={ref} onChange={(e) => setRef(e.target.value)} placeholder="INV-114" aria-label="Bill or challan number" />
            </label>
            <label className="wide">
              Note (optional)
              <input value={moveNote} onChange={(e) => setMoveNote(e.target.value)} aria-label="Note" />
            </label>
          </div>
          {moveBlock && <div className="bd-m small">{moveBlock}</div>}
          <button className="bd-btn primary huge" disabled={busy || !!moveBlock} onClick={saveMove}>
            ✅ <L en={to === "SHOP" ? "Save: back in the shop" : "Save: send out"} kn="ಉಳಿಸಿ" />
          </button>
        </div>
      )}

      {msg && (
        <div className={msg.ok ? "bd-ok" : "bd-err"}>
          {msg.text}
          {msg.ok && msg.eventId && (
            <>
              {" "}
              <a className="bd-linkbtn" href={`/barrels/fleet/print?slip=${encodeURIComponent(msg.eventId)}`} target="_blank" rel="noreferrer">
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
            const f = findFleetCode(c);
            setCodeText(f?.code ?? c);
            setScanning(false);
            setMsg(null);
          }}
        />
      )}
    </div>
  );
}
