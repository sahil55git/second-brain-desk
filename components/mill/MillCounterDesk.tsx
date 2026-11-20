"use client";

// Mill Counter Desk (/mill/counter): the barrel receiving counter for the mill.
//   Receive a lot (supplier, oil, barrels) → put each barrel on the scale: FULL = gross → pour it out →
//   weigh it EMPTY = tare → net oil = gross − tare. Big buttons, live weight on top, Kannada beside English.
//
// It keeps NO records of its own. Lots and barrels are the app's own OilReceipt / Barrel rows (the same ones
// /barrels shows), written through the same routes (/api/barrels, /api/barrels/weigh), so there is one barrel
// register, one audit trail, and no duplicates: every barrel has a fixed label code, a scale reading can be
// used for ONE weighing, and a repeated tap is answered "already saved". Staff receive "blind": the challan
// quantity, rate and shortage are shown to the owner only (the server removes them for staff).
import { useKeepAwake } from "@/lib/keepAwake";
import { scaleTapPlan } from "@/lib/mill/scaleTap";
import { scaleSetupHref } from "@/lib/scaleSetup";
import "./millCounter.css";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useScale } from "@/components/ScaleProvider";
import { api, kg, kg1, pad, when, STATE_CHIP, type BarrelRow, type Lot, type Tick } from "@/components/barrels/shared";
import { tickFresh, type Phase } from "@/lib/barrels";
import { businessDate } from "@/lib/register";
import { MANUAL_REASONS, lotTotals, netOnDay, newClientId, nextBarrel, stepOf, waitingBarrels, weighProblem, weighResult } from "@/lib/mill/millCounter";

const PRODUCTS = ["Sunflower oil", "Rice bran oil", "Soyabean oil", "Groundnut oil", "Mustard oil", "Karadi (safflower) oil", "Goldrop"];
const FRESH_MS = 3000;

type Tab = "lots" | "waiting";
type Sheet = { t: "new" } | { t: "weigh"; lotId: string; code: string } | null;

const Kn = ({ children }: { children: React.ReactNode }) => <span className="mc-kn">{children}</span>;
const Barrel = ({ level, size = 28 }: { level: 0 | 1; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 48 48" fill="none" aria-hidden>
    <path d="M11 10v26c0 2.8 5.8 5 13 5s13-2.2 13-5V10" stroke="currentColor" strokeWidth="2.4" />
    <ellipse cx="24" cy="10" rx="13" ry="5" stroke="currentColor" strokeWidth="2.4" fill={level ? "currentColor" : "none"} fillOpacity=".25" />
    <path d="M11 20c0 2.8 5.8 5 13 5s13-2.2 13-5M11 30c0 2.8 5.8 5 13 5s13-2.2 13-5" stroke="currentColor" strokeWidth="2" />
    {level ? <path d="M12 24h24v12c0 2.4-5.4 4.4-12 4.4S12 38.400 12 36z" fill="currentColor" fillOpacity=".35" /> : null}
  </svg>
);

export default function MillCounterDesk() {
  useKeepAwake();
  const [lots, setLots] = useState<Lot[]>([]);
  const [isOwner, setIsOwner] = useState(false);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("lots");
  const [lotId, setLotId] = useState<string | null>(null);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [toast, setToast] = useState<{ ok: boolean; text: string } | null>(null);
  const [ticks, setTicks] = useState<Tick[]>([]);
  const [skew, setSkew] = useState(0);
  const [usedIds, setUsedIds] = useState<string[]>([]); // readings this screen already used
  const [, force] = useState(0);
  const sheetOpenRef = useRef(false); // while a sheet is open the lot list is not refreshed under it
  const { selectedReading, connected, bt } = useScale();

  // ---- the barrel lots (open lots; the owner's closed lots stay in /barrels)
  const load = useCallback(async () => {
    try {
      const j = await api<{ data: Lot[]; isOwner: boolean }>("/api/barrels");
      setLots(j.data);
      setIsOwner(j.isOwner);
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not load the lots.");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
    const t = setInterval(() => document.visibilityState === "visible" && !sheetOpenRef.current && void load(), 6000);
    return () => clearInterval(t);
  }, [load]);

  // ---- settled scale readings (the same ones /barrels uses: one reading can be used for one weighing)
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
    void pull();
    const t = setInterval(() => document.visibilityState === "visible" && void pull(), 2000);
    const t2 = setInterval(() => force((n) => n + 1), 1000);
    return () => {
      alive = false;
      clearInterval(t);
      clearInterval(t2);
    };
  }, []);
  const nowServer = Date.now() + skew;
  const usable = ticks.find((t) => !t.usedAt && !usedIds.includes(t.id) && tickFresh(new Date(t.settledAt).getTime(), nowServer)) || null;
  const usableAge = usable ? Math.max(0, Math.round((nowServer - new Date(usable.settledAt).getTime()) / 1000)) : null;

  const live = selectedReading && Date.now() - selectedReading.receivedAt < FRESH_MS ? selectedReading : null;
  const today = businessDate(Date.now());
  const lot = lots.find((l) => l.id === lotId) || null;
  const waiting = useMemo(() => waitingBarrels(lots, Date.now()), [lots]); // eslint-disable-line react-hooks/exhaustive-deps
  const netToday = netOnDay(lots, today);

  const say = (ok: boolean, text: string) => {
    setToast({ ok, text });
    setTimeout(() => setToast((t) => (t && t.text === text ? null : t)), ok ? 6000 : 9000);
  };
  const putLot = (l: Lot) => setLots((all) => (all.some((x) => x.id === l.id) ? all.map((x) => (x.id === l.id ? l : x)) : [l, ...all]));

  const openWeigh = (l: Lot, code: string) => {
    sheetOpenRef.current = true;
    setLotId(l.id);
    setSheet({ t: "weigh", lotId: l.id, code });
  };
  const closeSheet = () => {
    sheetOpenRef.current = false;
    setSheet(null);
    void load();
  };

  const scalePill = (
    <button
      className="mc-scale"
      onClick={() => {
        const plan = scaleTapPlan({ support: bt.support, hasConfig: !!bt.config, status: bt.state.status, error: bt.state.error, name: bt.config?.name || "" });
        say(!plan.bad, plan.text);
        if (plan.act === "setup") window.location.href = scaleSetupHref("/mill/counter");
        else if (plan.act === "connect") bt.connect();
        else if (plan.act === "retry") bt.retryNow();
      }}
      title="Scale"
    >
      <span className={`mc-dot ${live ? (live.stable ? "ok" : "mid") : connected ? "mid" : "bad"}`} />
      <b>{live ? `${kg1(live.weight)}` : "—"}</b> kg
      <small>{live ? (live.stable ? "steady" : "moving…") : connected ? "no reading" : "scale off · tap"}</small>
    </button>
  );

  return (
    <div className="mc">
      <header className="mc-top">
        {lot ? (
          <button className="mc-back" onClick={() => setLotId(null)} aria-label="Back to lots">
            ‹
          </button>
        ) : (
          <Link className="mc-back" href="/mill" aria-label="Mill Desk">
            ‹
          </Link>
        )}
        <h1>
          Mill · Counter Desk <Kn>ಮಿಲ್ ಕೌಂಟರ್</Kn>
          <small>{lot ? `Lot ${lot.lotNo}` : "Barrel lots received"}</small>
        </h1>
        {scalePill}
      </header>

      {err && <div className="mc-err">{err}</div>}
      {bt.config && !bt.checked && <div className="mc-warn">This phone&apos;s scale has not been checked against the scale&apos;s own display yet, so weights are not saved. Do the check in Scale set-up.</div>}

      {!lot && (
        <main className="mc-main">
          <div className="mc-cards">
            <div className="mc-card">
              <b>{lots.filter((l) => l.status === "OPEN").length}</b>
              <span>Open lots <Kn>ಲಾಟ್</Kn></span>
            </div>
            <div className="mc-card">
              <b>{waiting.length}</b>
              <span>Full, to empty <Kn>ಖಾಲಿ ಮಾಡಬೇಕು</Kn></span>
            </div>
            <div className="mc-card">
              <b>{kg1(netToday)}</b>
              <span>Net oil today, kg <Kn>ಇಂದಿನ ಎಣ್ಣೆ</Kn></span>
            </div>
          </div>

          <button
            className="mc-big"
            onClick={() => {
              sheetOpenRef.current = true;
              setSheet({ t: "new" });
            }}
          >
            <Barrel level={1} size={34} /> Receive barrels <Kn>ಬ್ಯಾರೆಲ್ ಸ್ವೀಕಾರ</Kn>
          </button>

          <div className="mc-tabs">
            <button className={tab === "lots" ? "on" : ""} onClick={() => setTab("lots")}>Lots <Kn>ಲಾಟ್</Kn></button>
            <button className={tab === "waiting" ? "on" : ""} onClick={() => setTab("waiting")}>Waiting to empty ({waiting.length}) <Kn>ಖಾಲಿ ಬಾಕಿ</Kn></button>
          </div>

          {loading && <p className="mc-note">Loading…</p>}

          {tab === "lots" && (
            <div className="mc-list">
              {!loading && !lots.length && <p className="mc-note">No barrel lots yet. Tap “Receive barrels” when a vehicle arrives.</p>}
              {lots.map((l) => {
                const t = lotTotals(l.barrels);
                const chip = STATE_CHIP[l.summary.state] || STATE_CHIP.NOT_STARTED;
                return (
                  <button key={l.id} className="mc-lot" onClick={() => setLotId(l.id)}>
                    <div className="mc-lot-h">
                      <b>{l.lotNo}</b>
                      <span className={`mc-chip ${chip.cls}`}>{chip.en}</span>
                    </div>
                    <div className="mc-lot-s">{l.supplierName} · {l.product}{l.vehicleNo ? ` · ${l.vehicleNo}` : ""}</div>
                    <div className="mc-prog">
                      <span>Full {t.fullWeighed}/{t.barrels}</span>
                      <span>Empty {t.done}/{t.barrels}</span>
                      <span className="net">Net {kg1(t.netKg)} kg</span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {tab === "waiting" && (
            <div className="mc-list">
              {!waiting.length && <p className="mc-note">No full barrels are waiting. Nothing to empty.</p>}
              {waiting.map((w) => (
                <button key={w.code} className="mc-lot" onClick={() => { const l = lots.find((x) => x.id === w.lotId); if (l) openWeigh(l, w.code); }}>
                  <div className="mc-lot-h">
                    <b>Barrel {pad(w.seq)} · {w.lotNo}</b>
                    <span className="mc-chip o">{w.days ? `${w.days} d` : "today"}</span>
                  </div>
                  <div className="mc-lot-s">{w.supplierName} · {w.product}</div>
                  <div className="mc-prog"><span>Full {kg(w.grossKg)} kg</span><span>{when(w.since)}</span><span className="net">Weigh empty ›</span></div>
                </button>
              ))}
            </div>
          )}
        </main>
      )}

      {lot && <LotView lot={lot} isOwner={isOwner} onPick={(b) => openWeigh(lot, b.code)} />}

      {toast && <div className={`mc-toast ${toast.ok ? "ok" : "bad"}`}>{toast.text}</div>}

      {sheet?.t === "new" && (
        <NewLot
          lots={lots}
          isOwner={isOwner}
          onClose={closeSheet}
          onCreated={(l) => {
            putLot(l);
            sheetOpenRef.current = false;
            setSheet(null);
            setLotId(l.id);
            say(true, `Lot ${l.lotNo} started with ${l.barrels.length} barrels. Print the labels, stick one on each barrel, then weigh each barrel full.`);
          }}
          onDuplicate={() => {
            sheetOpenRef.current = false;
            setSheet(null);
            void load();
            say(true, "That lot was already saved.");
          }}
        />
      )}

      {sheet?.t === "weigh" && lot && lot.barrels.find((b) => b.code === sheet.code) && (
        <WeighSheet
          key={sheet.code}
          lot={lot}
          barrel={lot.barrels.find((b) => b.code === sheet.code) as BarrelRow}
          usable={usable}
          usableAge={usableAge}
          live={live ? { kg: live.weight, stable: !!live.stable } : null}
          scaleOn={connected}
          onClose={closeSheet}
          onUsed={(id) => setUsedIds((u) => [...u, id].slice(-30))}
          onSaved={(updated, saved, phase, text) => {
            putLot(updated);
            say(true, text);
            const nb = nextBarrel(updated.barrels, saved.seq, phase);
            if (nb) setSheet({ t: "weigh", lotId: updated.id, code: nb.code });
            else {
              sheetOpenRef.current = false;
              setSheet(null);
              say(true, phase === "GROSS" ? `${text} · every barrel of this lot is weighed full.` : `${text} · every barrel of this lot is emptied and weighed.`);
            }
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// One lot: totals, the barrel buttons, the table, print links
// ---------------------------------------------------------------------------
function LotView({ lot, isOwner, onPick }: { lot: Lot; isOwner: boolean; onPick: (b: BarrelRow) => void }) {
  const t = lotTotals(lot.barrels);
  const s = lot.summary;
  const lotQ = encodeURIComponent(lot.lotNo);
  return (
    <main className="mc-main">
      <div className="mc-lot-s big">
        {lot.supplierName} · {lot.product}
        {lot.vehicleNo ? ` · ${lot.vehicleNo}` : ""}
        {lot.challanNo ? ` · challan ${lot.challanNo}` : ""}
      </div>

      <div className="mc-tot">
        <div><small>Gross (full) <Kn>ತುಂಬಿದ</Kn></small><b>{kg1(t.grossKg)}</b></div>
        <div><small>Tare (empty) <Kn>ಖಾಲಿ</Kn></small><b>{kg1(t.tareKg)}</b></div>
        <div className="net"><small>Net oil <Kn>ಎಣ್ಣೆ</Kn></small><b>{kg1(t.netKg)}</b><em>kg</em></div>
      </div>
      <p className="mc-note">
        Barrels done {t.done}/{t.barrels}. Full {t.fullWeighed}, waiting to empty {t.waiting}. Totals add only barrels that have both weights, so gross − tare = net.
      </p>

      {isOwner && s.declaredNetKg != null && (
        <div className={`mc-own ${s.diffKg != null && s.shortKg && s.shortKg > 0 ? "bad" : ""}`}>
          Challan {kg1(s.declaredNetKg)} kg · measured {kg1(s.measuredNetKg)} kg
          {s.diffKg != null ? ` · difference ${s.diffKg > 0 ? "+" : ""}${kg1(s.diffKg)} kg` : " · lot not finished yet"}
        </div>
      )}
      {s.flags.length > 0 && (
        <div className="mc-flags">
          {s.flags.slice(0, 5).map((f, i) => (
            <div key={i} className={f.level === "alert" ? "bad" : "mid"}>{f.msg}</div>
          ))}
        </div>
      )}

      <div className="mc-grid">
        {lot.barrels.map((b) => {
          const st = stepOf(b);
          return (
            <button key={b.code} className={`mc-b ${st === "DONE" ? "done" : st === "EMPTY" ? "full" : "new"}`} onClick={() => onPick(b)}>
              <Barrel level={st === "EMPTY" ? 1 : 0} />
              <b>{pad(b.seq)}</b>
              <small>{st === "DONE" ? `${kg1(b.net)} kg` : st === "EMPTY" ? `full ${kg1(b.grossKg)}` : "tap to weigh"}</small>
            </button>
          );
        })}
      </div>

      <div className="mc-table">
        <div className="mc-tr h"><span>Barrel</span><span>Gross</span><span>Tare</span><span>Net</span></div>
        {lot.barrels.map((b) => (
          <button key={b.code} className="mc-tr" onClick={() => onPick(b)}>
            <span>{pad(b.seq)}{b.grossSource === "MANUAL" || b.emptySource === "MANUAL" ? " ✋" : ""}</span>
            <span>{kg(b.grossKg)}</span>
            <span>{kg(b.emptyKg)}</span>
            <span className="n">{kg(b.net)}</span>
          </button>
        ))}
        <div className="mc-tr f"><span>Total ({t.done})</span><span>{kg1(t.grossKg)}</span><span>{kg1(t.tareKg)}</span><span className="n">{kg1(t.netKg)}</span></div>
      </div>

      <div className="mc-links">
        <a href={`/barrels/labels?lot=${lotQ}`} target="_blank" rel="noreferrer">🏷️ Labels</a>
        <a href={`/barrels/print?slips=${lotQ}`} target="_blank" rel="noreferrer">🧾 Slips</a>
        <a href={`/barrels/print?report=${lotQ}`} target="_blank" rel="noreferrer">📄 Lot report</a>
        <Link href="/barrels">🛢️ Barrel desk (challan photo, reweigh, close lot)</Link>
      </div>
    </main>
  );
}

// ---------------------------------------------------------------------------
// Receive barrels: start a lot
// ---------------------------------------------------------------------------
function NewLot({ lots, isOwner, onClose, onCreated, onDuplicate }: { lots: Lot[]; isOwner: boolean; onClose: () => void; onCreated: (l: Lot) => void; onDuplicate: () => void }) {
  const [supplier, setSupplier] = useState("");
  const [product, setProduct] = useState(PRODUCTS[0]);
  const [count, setCount] = useState(8);
  const [vehicle, setVehicle] = useState("");
  const [challan, setChallan] = useState("");
  const [declared, setDeclared] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const clientId = useRef(newClientId());
  const recent = useMemo(() => Array.from(new Set(lots.map((l) => l.supplierName))).slice(0, 6), [lots]);

  const save = async () => {
    if (busy) return;
    if (!supplier.trim()) return setMsg("Who is the supplier?");
    if (count < 1 || count > 80) return setMsg("Barrels must be 1 to 80.");
    setBusy(true);
    setMsg(null);
    try {
      const j = await api<{ data: Lot | null; duplicate?: boolean }>("/api/barrels", {
        method: "POST",
        json: {
          clientId: clientId.current,
          supplierName: supplier.trim(),
          product,
          barrelCount: count,
          vehicleNo: vehicle.trim() || undefined,
          challanNo: challan.trim() || undefined,
          declaredNetKg: isOwner && Number(declared) > 0 ? Number(declared) : undefined,
        },
      });
      if (j.duplicate || !j.data) return onDuplicate();
      onCreated(j.data);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Could not start the lot.");
      clientId.current = newClientId(); // nothing was saved: a corrected try is a fresh one
      setBusy(false);
    }
  };

  return (
    <div className="mc-sheet" role="dialog">
      <div className="mc-sheet-in">
        <div className="mc-sheet-h">
          <b>Receive barrels <Kn>ಬ್ಯಾರೆಲ್ ಸ್ವೀಕಾರ</Kn></b>
          <button onClick={onClose} aria-label="Close">✕</button>
        </div>
        <label>Supplier <Kn>ಸರಬರಾಜುದಾರ</Kn></label>
        <input className="mc-in" value={supplier} onChange={(e) => setSupplier(e.target.value)} placeholder="Supplier name" autoComplete="off" />
        {recent.length > 0 && (
          <div className="mc-chips">
            {recent.map((s) => (
              <button key={s} className={supplier === s ? "on" : ""} onClick={() => setSupplier(s)}>{s}</button>
            ))}
          </div>
        )}
        <label>Oil <Kn>ಎಣ್ಣೆ</Kn></label>
        <div className="mc-chips">
          {PRODUCTS.map((p) => (
            <button key={p} className={product === p ? "on" : ""} onClick={() => setProduct(p)}>{p}</button>
          ))}
        </div>
        <label>Barrels in this vehicle <Kn>ಬ್ಯಾರೆಲ್ ಸಂಖ್ಯೆ</Kn></label>
        <div className="mc-step">
          <button onClick={() => setCount((c) => Math.max(1, c - 1))} aria-label="Fewer">−</button>
          <input className="mc-in c" inputMode="numeric" value={count} onChange={(e) => setCount(Math.min(80, Math.max(0, Math.round(Number(e.target.value.replace(/\D/g, "")) || 0))))} />
          <button onClick={() => setCount((c) => Math.min(80, c + 1))} aria-label="More">+</button>
        </div>
        <div className="mc-two">
          <div>
            <label>Vehicle no. <Kn>ವಾಹನ</Kn></label>
            <input className="mc-in" value={vehicle} onChange={(e) => setVehicle(e.target.value.toUpperCase())} placeholder="KA 38 …" autoComplete="off" />
          </div>
          <div>
            <label>Challan no. <Kn>ಚಲನ್</Kn></label>
            <input className="mc-in" value={challan} onChange={(e) => setChallan(e.target.value)} placeholder="optional" autoComplete="off" />
          </div>
        </div>
        {isOwner && (
          <>
            <label>Challan net oil, kg (owner only)</label>
            <input className="mc-in" inputMode="decimal" value={declared} onChange={(e) => setDeclared(e.target.value.replace(/[^\d.]/g, ""))} placeholder="total kg on the challan" />
          </>
        )}
        {msg && <p className="mc-err in">{msg}</p>}
        <button className="mc-go" disabled={busy} onClick={save}>{busy ? "Saving…" : `Start lot · ${count} barrels`}</button>
        <p className="mc-note">The lot gets its number and a label code for every barrel. Staff do not see the challan quantity or rate.</p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Weigh one barrel: FULL (gross) first, EMPTY (tare) later
// ---------------------------------------------------------------------------
function WeighSheet(props: {
  lot: Lot;
  barrel: BarrelRow;
  usable: Tick | null;
  usableAge: number | null;
  live: { kg: number; stable: boolean } | null;
  scaleOn: boolean;
  onClose: () => void;
  onUsed: (tickId: string) => void;
  onSaved: (lot: Lot, barrel: BarrelRow, phase: Phase, text: string) => void;
}) {
  const { lot, barrel, usable, usableAge, live, scaleOn, onClose, onUsed, onSaved } = props;
  const step = stepOf(barrel);
  const phase: Phase = step === "GROSS" ? "GROSS" : "EMPTY";
  const [manual, setManual] = useState(false);
  const [manualKg, setManualKg] = useState("");
  const [reason, setReason] = useState<string>(MANUAL_REASONS[0]);
  const [why, setWhy] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const clientId = useRef(newClientId());

  const kgNow = manual ? (Number(manualKg) > 0 ? Number(manualKg) : null) : usable?.weightKg ?? null;
  const problem = weighProblem(phase, kgNow, barrel);
  const note = reason === "Other" ? why.trim() : [reason, why.trim()].filter(Boolean).join(": ");
  const ready = !busy && kgNow != null && !problem && (!manual || note.length >= 3);

  const save = async () => {
    if (!ready || kgNow == null) return;
    setBusy(true);
    setMsg(null);
    try {
      const j = await api<{ data: Lot | null; barrel?: BarrelRow; kg?: number; duplicate?: boolean }>("/api/barrels/weigh", {
        method: "POST",
        json: { code: barrel.code, phase, source: manual ? "MANUAL" : "SCALE", tickId: manual ? undefined : usable?.id, kg: manual ? kgNow : undefined, note: manual ? note : undefined, clientId: clientId.current },
      });
      if (!manual && usable) onUsed(usable.id);
      if (j.duplicate || !j.data || !j.barrel) {
        setMsg("Already saved.");
        onClose();
        return;
      }
      clientId.current = newClientId();
      const saved = j.barrel;
      onSaved(j.data, saved, phase, `Barrel ${pad(saved.seq)}: ${weighResult(phase, j.kg ?? kgNow, saved)} ✓`);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Could not save.");
      setBusy(false);
    }
  };

  return (
    <div className="mc-sheet" role="dialog">
      <div className="mc-sheet-in">
        <div className="mc-sheet-h">
          <b>
            Barrel {pad(barrel.seq)} · {lot.lotNo}
          </b>
          <button onClick={onClose} aria-label="Close">✕</button>
        </div>

        {step === "DONE" ? (
          <div className="mc-done">
            <p>Full (gross) <b>{kg(barrel.grossKg)}</b> kg · Empty (tare) <b>{kg(barrel.emptyKg)}</b> kg</p>
            <p className="n">Net oil {kg(barrel.net)} kg</p>
            <p className="mc-note">Both weights are saved. Only the owner can weigh a barrel again, with a reason (Barrel desk).</p>
            <div className="mc-links">
              <a href={`/barrels/print?slip=${encodeURIComponent(barrel.code)}`} target="_blank" rel="noreferrer">🧾 Weighment slip</a>
            </div>
          </div>
        ) : (
          <>
            <div className={`mc-phase ${phase === "GROSS" ? "g" : "e"}`}>
              <Barrel level={phase === "GROSS" ? 1 : 0} size={40} />
              <div>
                <b>{phase === "GROSS" ? "Weigh FULL barrel (gross)" : "Weigh EMPTY barrel (tare)"}</b>
                <Kn>{phase === "GROSS" ? "ತುಂಬಿದ ಬ್ಯಾರೆಲ್ ತೂಕ" : "ಖಾಲಿ ಬ್ಯಾರೆಲ್ ತೂಕ"}</Kn>
                {phase === "EMPTY" && <small>Full weight {kg(barrel.grossKg)} kg · saved {when(barrel.grossAt)}</small>}
              </div>
            </div>

            {!manual && (
              <div className={`mc-read ${usable ? "ok" : ""}`}>
                {usable ? (
                  <>
                    <small>Steady reading ready · {usableAge}s ago</small>
                    <b>{kg(usable.weightKg)} <em>kg</em></b>
                  </>
                ) : (
                  <>
                    <small>{!scaleOn ? "Scale is not connected. Tap the scale at the top." : live && !live.stable ? "Wait… the weight is still moving." : "Put the barrel on the scale and wait for the steady reading."}</small>
                    <b>{live ? kg1(live.kg) : "—"} <em>kg</em></b>
                  </>
                )}
              </div>
            )}

            {phase === "EMPTY" && kgNow != null && !problem && barrel.grossKg != null && (
              <p className="mc-calc">{kg(barrel.grossKg)} − {kg(kgNow)} = <b>{kg(barrel.grossKg - kgNow)} kg oil</b></p>
            )}
            {problem && <p className="mc-err in">{problem}</p>}

            {manual && (
              <div className="mc-manual">
                <label>Weight in kg</label>
                <input className="mc-in c" inputMode="decimal" value={manualKg} onChange={(e) => setManualKg(e.target.value.replace(/[^\d.]/g, ""))} placeholder="0.0" />
                <div className="mc-chips">
                  {MANUAL_REASONS.map((r) => (
                    <button key={r} className={reason === r ? "on" : ""} onClick={() => setReason(r)}>{r}</button>
                  ))}
                </div>
                <input className="mc-in" value={why} onChange={(e) => setWhy(e.target.value)} placeholder={reason === "Other" ? "Reason (required)" : "More detail (optional)"} />
                <p className="mc-note">A typed weight is marked ✋ and the owner is warned. Use the scale whenever you can.</p>
              </div>
            )}

            {msg && <p className="mc-err in">{msg}</p>}
            <button className="mc-go" disabled={!ready} onClick={save}>
              {busy ? "Saving…" : `Save ${phase === "GROSS" ? "full" : "empty"} weight${kgNow != null ? ` · ${kg(kgNow)} kg` : ""}`}
            </button>
            <button className="mc-link" onClick={() => { setManual((m) => !m); setMsg(null); }}>
              {manual ? "‹ Use the scale reading" : "✋ Scale not working? Type the weight"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
