"use client";

// Barrel receiving desk (/barrels).
//
// Oil bought in barrels: start a lot → print a barcode + QR label for every barrel →
// weigh each barrel FULL (oil + barrel) on the platform scale → later, whenever the
// barrel is emptied into the tank, weigh it EMPTY (tare). Net oil = full − empty.
// Barrels can wait days between the two weighings; the desk lists what is waiting and
// lets you scan any barrel at any time. The owner also sees the supplier's challan
// figures and any shortage; staff receive "blind".
//
// Weights come from the scale itself: the scale bridge posts each steady reading to
// the server, and "Save weight" uses that reading — the browser never types the
// number. Typing a weight is a flagged fallback.

import { useCallback, useEffect, useMemo, useState } from "react";
import { findBarrelCode, registerRows, registerTotals, type Flag, type ShapedReceipt } from "@/lib/barrels";
import BarrelCard from "@/components/barrels/BarrelCard";
import BarrelRegister from "@/components/barrels/BarrelRegister";
import WeighPanel from "@/components/barrels/WeighPanel";
import { BarrelPrintMenu, Dropdown, LotPrintMenu, MenuBtn, WeightMenu } from "@/components/barrels/Menus";
import WeightCell from "@/components/barrels/WeightCell";
import { preparePhoto, stampLines, uploadProof } from "@/lib/proofClient";
import { businessDate } from "@/lib/register";
import { api, kg, L, pad, rs, STATE_CHIP, when, type EventRow, type Lot } from "@/components/barrels/shared";

const PRODUCTS = ["Sunflower oil", "Rice bran oil", "Soyabean oil", "Groundnut oil", "Mustard oil", "Karadi (safflower) oil", "Goldrop"];

type View = { t: "home" } | { t: "entry" } | { t: "dashboard" } | { t: "register"; status?: "waiting" | "all" } | { t: "new" } | { t: "lot"; id: string } | { t: "barrel"; code: string; back: View };

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default function BarrelDesk() {
  const [lots, setLots] = useState<Lot[]>([]);
  const [isOwner, setIsOwner] = useState(false);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [view, setView] = useState<View>({ t: "home" });
  const [showClosed, setShowClosed] = useState(false);
  const [preset, setPreset] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const j = await api<{ data: Lot[]; isOwner: boolean }>(`/api/barrels${showClosed ? "?status=all" : ""}`);
      setLots(j.data);
      setIsOwner(j.isOwner);
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not load.");
    } finally {
      setLoading(false);
    }
  }, [showClosed]);

  useEffect(() => {
    load();
    const t = setInterval(() => document.visibilityState === "visible" && load(), 20000);
    return () => clearInterval(t);
  }, [load]);

  // Deep link: /barrels?barrel=R261010-1-03 is what the QR on a barrel label opens.
  useEffect(() => {
    const b = findBarrelCode(new URLSearchParams(window.location.search).get("barrel") || "");
    if (b) setView({ t: "barrel", code: b.code, back: { t: "home" } });
  }, []);
  // Deep link: /barrels?lot=R261010-1 opens that lot once the list has loaded.
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const q = sp.get("lot");
    if (q && !sp.get("barrel") && lots.length) {
      const hit = lots.find((l) => l.lotNo === q || l.id === q);
      if (hit) setView({ t: "lot", id: hit.id });
    }
    // only on first load of lots
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lots.length === 0]);

  const replaceLot = (l: Lot) => setLots((all) => (all.some((x) => x.id === l.id) ? all.map((x) => (x.id === l.id ? l : x)) : [l, ...all]));
  const current = view.t === "lot" ? lots.find((l) => l.id === view.id) : undefined;
  const home = () => { setView({ t: "home" }); load(); };
  const entry = () => { setView({ t: "entry" }); load(); };
  const tab = view.t === "register" ? "register" : view.t === "home" ? "home" : view.t === "dashboard" ? "dashboard" : view.t === "entry" || view.t === "new" || view.t === "lot" ? "entry" : null;

  return (
    <div className="bd-wrap">
      <header className="bd-top bd-noprint">
        <div>
          <a href="/go" className="bd-m small">
            ← Quick links
          </a>
          <h1>
            🛢️ <L en="Barrel receiving" kn="ಬ್ಯಾರಲ್ ಸ್ವೀಕಾರ" />
          </h1>
        </div>
        {view.t === "entry" && (
          <button className="bd-btn primary big" onClick={() => setView({ t: "new" })}>
            ➕ <L en="New lot" kn="ಹೊಸ ಲೋಡ್" />
          </button>
        )}
      </header>

      <div className="bd-steps bd-tabs bd-noprint" role="tablist">
        <button role="tab" aria-selected={tab === "entry"} className={tab === "entry" ? "on" : ""} onClick={entry}>
          🛢️ <L en="Barrel entry" kn="ಬ್ಯಾರಲ್ ಎಂಟ್ರಿ" />
          <small>new lot, barrel labels</small>
        </button>
        <button role="tab" aria-selected={tab === "home"} className={tab === "home" ? "on" : ""} onClick={home}>
          ⚖️ <L en="Weigh" kn="ತೂಕ" />
          <small>full &amp; empty weight</small>
        </button>
        <button role="tab" aria-selected={tab === "dashboard"} className={tab === "dashboard" ? "on" : ""} onClick={() => setView({ t: "dashboard" })}>
          📊 <L en="Dashboard" kn="ಡ್ಯಾಶ್‌ಬೋರ್ಡ್" />
          <small>totals, waiting, alerts</small>
        </button>
        <button role="tab" aria-selected={tab === "register"} className={tab === "register" ? "on" : ""} onClick={() => setView({ t: "register" })}>
          📋 <L en="Report" kn="ವರದಿ" />
          <small>every barrel, print / Excel</small>
        </button>
      </div>

      {err && <div className="bd-err">{err}</div>}

      {view.t === "home" && (
        <>
          <FlowSteps lots={lots} goEntry={entry} />
          <WeighPanel lots={lots} isOwner={isOwner} presetCode={preset} onSaved={replaceLot} />
          <Waiting
            lots={lots}
            weigh={(code) => {
              setPreset(code);
              window.scrollTo({ top: 0, behavior: "smooth" });
            }}
            seeAll={() => setView({ t: "register", status: "waiting" })}
          />
        </>
      )}
      {view.t === "entry" && (
        <LotList lots={lots} loading={loading} isOwner={isOwner} showClosed={showClosed} setShowClosed={setShowClosed} open={(id) => setView({ t: "lot", id })} />
      )}
      {view.t === "dashboard" && (
        <Dashboard
          lots={lots}
          isOwner={isOwner}
          loading={loading}
          weigh={(code) => { setPreset(code); setView({ t: "home" }); window.scrollTo({ top: 0, behavior: "smooth" }); }}
          openLot={(id) => setView({ t: "lot", id })}
          openReport={(status) => setView({ t: "register", status })}
        />
      )}
      {view.t === "register" && <BarrelRegister key={view.status ?? "all"} initialStatus={view.status ?? "all"} open={(code) => setView({ t: "barrel", code, back: view })} />}
      {view.t === "barrel" && (
        <BarrelCard
          code={view.code}
          lots={lots}
          isOwner={isOwner}
          onBack={() => (view.back.t === "home" ? home() : setView(view.back))}
          onSaved={replaceLot}
          onOpenLot={(id) => setView({ t: "lot", id })}
        />
      )}
      {view.t === "new" && (
        <NewLot
          onCancel={entry}
          onCreated={(l) => {
            replaceLot(l);
            setView({ t: "lot", id: l.id });
          }}
        />
      )}
      {view.t === "lot" && current && (
        <LotView
          lot={current}
          lots={lots}
          isOwner={isOwner}
          onChange={replaceLot}
          onBack={entry}
          openBarrel={(code) => setView({ t: "barrel", code, back: { t: "lot", id: current.id } })}
        />
      )}
      {view.t === "lot" && !current && !loading && (
        <div className="bd-card">
          That lot is not in the list (it may be closed). <button className="bd-linkbtn" onClick={entry}>Back</button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// The five steps — a picture staff and managers can follow from left to right
// ---------------------------------------------------------------------------
function FlowSteps({ lots, goEntry }: { lots: Lot[]; goEntry: () => void }) {
  const open = lots.filter((l) => l.status === "OPEN");
  const n = open.reduce((a, l) => a + l.barrels.length, 0);
  const full = open.reduce((a, l) => a + l.barrels.filter((b) => b.grossKg != null).length, 0);
  const done = open.reduce((a, l) => a + l.barrels.filter((b) => b.state === "DONE").length, 0);
  const net = open.reduce((a, l) => a + l.barrels.reduce((x, b) => x + (b.net ?? 0), 0), 0);
  const steps = [
    { icon: "🚚", en: "Vehicle arrives", kn: "ವಾಹನ ಬಂದಿದೆ", how: "Tap Barrel entry → New lot. Supplier, oil, challan, barrel count.", stat: `${open.length} open lot(s)`, ok: open.length > 0, go: goEntry },
    { icon: "🏷️", en: "Tag each barrel", kn: "ಲೇಬಲ್ ಹಚ್ಚಿ", how: "Print labels, stick one on every barrel. Write its tag / serial no.", stat: `${n} barrel(s) labelled`, ok: n > 0, go: goEntry },
    { icon: "⚖️", en: "Weigh FULL", kn: "ತುಂಬಿದ ತೂಕ", how: "Scan the label, put the barrel on the scale. Scale broken? Enter weight by hand.", stat: `${full}/${n} weighed`, ok: n > 0 && full === n },
    { icon: "🛢️", en: "Pour, weigh EMPTY", kn: "ಖಾಲಿ ತೂಕ", how: "Pour into the tank, drain, scan again, weigh the empty barrel (any day).", stat: `${done}/${n} weighed`, ok: n > 0 && done === n },
    { icon: "✅", en: "Net oil + slip", kn: "ನಿವ್ವಳ ಎಣ್ಣೆ", how: "Net = full − empty. Print the slip, see the Dashboard and Report.", stat: `${kg(net)} kg oil`, ok: n > 0 && done === n },
  ];
  const here = steps.findIndex((x) => !x.ok);
  return (
    <ol className="bd-flow bd-noprint" aria-label="Barrel receiving steps">
      {steps.map((x, i) => (
        <li key={i} className={`${x.ok ? "ok" : ""} ${i === here ? "here" : ""}`}>
          <button type="button" onClick={x.go} disabled={!x.go}>
            <span className="no">{x.ok ? "✓" : i + 1}</span>
            <span className="ic">{x.icon}</span>
            <b>{x.en}</b>
            <span className="kn">{x.kn}</span>
            <small>{x.how}</small>
            <em>{x.stat}</em>
            {i === here && <span className="hr">You are here</span>}
          </button>
        </li>
      ))}
    </ol>
  );
}

// ---------------------------------------------------------------------------
// Dashboard — the whole barrel position on one screen
// ---------------------------------------------------------------------------
function Dashboard({
  lots,
  isOwner,
  loading,
  weigh,
  openLot,
  openReport,
}: {
  lots: Lot[];
  isOwner: boolean;
  loading: boolean;
  weigh: (code: string) => void;
  openLot: (id: string) => void;
  openReport: (status: "waiting" | "all") => void;
}) {
  const open = lots.filter((l) => l.status === "OPEN");
  const rows = useMemo(() => registerRows(open as unknown as ShapedReceipt[], Date.now()), [open]);
  const t = registerTotals(rows);
  const notWeighed = rows.filter((r) => r.state === "NEW").length;
  const flags = open.flatMap((l) => l.summary.flags.map((f) => ({ ...f, lotNo: l.lotNo, lotId: l.id }))).sort((a, b) => (a.level === b.level ? 0 : a.level === "alert" ? -1 : 1));
  return (
    <>
      <div className="bd-card">
        <h3>
          📊 <L en="Barrel dashboard" kn="ಬ್ಯಾರಲ್ ಡ್ಯಾಶ್‌ಬೋರ್ಡ್" /> <span className="bd-m small">· open lots only</span>
        </h3>
        {loading && <div className="bd-m">Loading…</div>}
        <div className="bd-kpis">
          <div className="bd-kpi"><div className="l">Open lots</div><div className="v">{open.length}</div></div>
          <div className="bd-kpi"><div className="l">Barrels</div><div className="v">{t.barrels}</div><div className="s">{notWeighed} not weighed yet</div></div>
          <div className="bd-kpi o"><div className="l">Waiting to empty</div><div className="v">{t.waiting}</div><div className="s">{t.waitingOldestDays != null ? `oldest ${t.waitingOldestDays} day(s)` : "none waiting"}</div></div>
          <div className="bd-kpi g"><div className="l">Emptied &amp; weighed</div><div className="v">{t.emptied}</div></div>
          <div className="bd-kpi g"><div className="l">Oil received (net)</div><div className="v">{kg(t.netKg)} kg</div><div className="s">full − empty, finished barrels</div></div>
          {t.waitingEstKg > 0 && <div className="bd-kpi"><div className="l">Still inside waiting barrels</div><div className="v">≈ {kg(t.waitingEstKg)} kg</div><div className="s">estimate</div></div>}
        </div>
        <div className="bd-row">
          <button className="bd-btn" onClick={() => openReport("waiting")}>Waiting barrels in the report →</button>
          <button className="bd-btn" onClick={() => openReport("all")}>Full report →</button>
        </div>
      </div>

      {isOwner && flags.length > 0 && (
        <div className="bd-card">
          <h3>⚠️ <L en="Needs a look" kn="ಗಮನಿಸಿ" /></h3>
          <ul className="bd-flags">
            {flags.map((f, i) => (
              <li key={i} className={f.level}>
                {f.level === "alert" ? "🚨" : "⚠️"} <b>{f.lotNo}</b> — {f.msg}{" "}
                <button className="bd-linkbtn" onClick={() => openLot(f.lotId)}>open</button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <Waiting lots={lots} weigh={weigh} seeAll={() => openReport("waiting")} />

      {open.length > 0 && (
        <div className="bd-card">
          <h3>🛢️ <L en="Lot progress" kn="ಲೋಡ್ ಪ್ರಗತಿ" /></h3>
          {open.map((l) => {
            const s = l.summary;
            const n = s.barrels || 1;
            return (
              <button key={l.id} className="bd-lot" onClick={() => openLot(l.id)}>
                <div className="bd-lot-top"><b>{l.lotNo}</b></div>
                <div className="bd-lot-mid">{l.supplierName} · {l.product}</div>
                <div className="bd-bar" aria-hidden>
                  <i className="full" style={{ width: `${(s.fullWeighed / n) * 100}%` }} />
                  <i className="done" style={{ width: `${(s.done / n) * 100}%` }} />
                </div>
                <div className="bd-m small">{s.fullWeighed}/{s.barrels} weighed full · {s.done}/{s.barrels} emptied &amp; weighed</div>
              </button>
            );
          })}
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Barrels that are full and waiting to be emptied — they may wait many days
// ---------------------------------------------------------------------------
function Waiting({ lots, weigh, seeAll }: { lots: Lot[]; weigh: (code: string) => void; seeAll: () => void }) {
  const rows = useMemo(() => registerRows(lots as unknown as ShapedReceipt[], Date.now()).filter((r) => r.state === "FULL" && r.lotStatus === "OPEN"), [lots]);
  const [all, setAll] = useState(false);
  if (!rows.length) return null;
  const sorted = [...rows].sort((a, b) => (b.waitingDays ?? 0) - (a.waitingDays ?? 0));
  const shown = all ? sorted : sorted.slice(0, 6);
  const t = registerTotals(rows);
  return (
    <div className="bd-card">
      <h3>
        ⏳ <L en="Full barrels waiting to be emptied" kn="ಖಾಲಿ ಮಾಡಲು ಬಾಕಿ ಇರುವ ಬ್ಯಾರಲ್" />
      </h3>
      <div className="bd-m small">
        {t.waiting} barrel(s) · oldest {t.waitingOldestDays ?? 0} day(s)
        {t.waitingEstKg > 0 ? ` · ≈ ${kg(t.waitingEstKg)} kg of oil still inside (estimate)` : ""}
      </div>
      <div className="bd-tablewrap">
        <table className="bd-table">
          <thead>
            <tr>
              <th>Barrel</th>
              <th>Supplier · oil</th>
              <th>Full kg</th>
              <th>Waiting since</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.code} className={(r.waitingDays ?? 0) >= 30 ? "warn" : ""}>
                <td><b>{r.code}</b></td>
                <td>{r.supplierName}<div className="bd-m tiny">{r.product}</div></td>
                <td className="num">{kg(r.grossKg)}</td>
                <td>{when(r.grossAt)}<div className="bd-m tiny">{r.waitingDays} day(s)</div></td>
                <td><button className="bd-btn" onClick={() => weigh(r.code)}>Weigh empty</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="bd-row">
        {sorted.length > 6 && <button className="bd-linkbtn" onClick={() => setAll((v) => !v)}>{all ? "Show fewer" : `Show all ${sorted.length}`}</button>}
        <button className="bd-linkbtn" onClick={seeAll}>Open in the register →</button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// List
// ---------------------------------------------------------------------------
function LotList({
  lots,
  loading,
  isOwner,
  showClosed,
  setShowClosed,
  open,
}: {
  lots: Lot[];
  loading: boolean;
  isOwner: boolean;
  showClosed: boolean;
  setShowClosed: (v: boolean) => void;
  open: (id: string) => void;
}) {
  const alerts = lots.reduce((n, l) => n + l.summary.flags.filter((f) => f.level === "alert").length, 0);
  return (
    <>
      {isOwner && (
        <div className="bd-row bd-gap">
          <label className="bd-check">
            <input type="checkbox" checked={showClosed} onChange={(e) => setShowClosed(e.target.checked)} /> Show closed lots
          </label>
          {alerts > 0 && <span className="bd-chip r">⚠ {alerts} alert{alerts > 1 ? "s" : ""} to look at</span>}
        </div>
      )}
      {loading && <div className="bd-m">Loading…</div>}
      {!loading && !lots.length && (
        <div className="bd-card bd-empty">
          No open lots. When a supplier&apos;s vehicle arrives, tap <b>New lot</b>.
          <div className="bd-kn2">ಸರಬರಾಜುದಾರರ ವಾಹನ ಬಂದಾಗ “ಹೊಸ ಲೋಡ್” ಒತ್ತಿ.</div>
        </div>
      )}
      {lots.length > 0 && <h3 className="bd-h3">Lots</h3>}
      <div className="bd-lots">
        {lots.map((l) => {
          const s = l.summary;
          const chip = STATE_CHIP[s.state];
          const n = s.barrels || 1;
          const alertN = s.flags.filter((f) => f.level === "alert").length;
          return (
            <button key={l.id} className="bd-lot" onClick={() => open(l.id)}>
              <div className="bd-lot-top">
                <b>{l.lotNo}</b>
                <span className={`bd-chip ${chip.cls}`}>{chip.en}</span>
                {l.status === "CLOSED" && <span className="bd-chip">Closed</span>}
                {alertN > 0 && isOwner && <span className="bd-chip r">⚠ {alertN}</span>}
              </div>
              <div className="bd-lot-mid">
                {l.supplierName} · {l.product}
                {l.vehicleNo ? ` · ${l.vehicleNo}` : ""}
              </div>
              <div className="bd-bar" aria-hidden>
                <i className="full" style={{ width: `${(s.fullWeighed / n) * 100}%` }} />
                <i className="done" style={{ width: `${(s.done / n) * 100}%` }} />
              </div>
              <div className="bd-m small">
                {s.fullWeighed}/{s.barrels} weighed full · {s.done}/{s.barrels} emptied &amp; weighed · {l.date}
              </div>
            </button>
          );
        })}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// New lot
// ---------------------------------------------------------------------------
function NewLot({ onCancel, onCreated }: { onCancel: () => void; onCreated: (l: Lot) => void }) {
  const [f, setF] = useState({ supplierName: "", product: "", vehicleNo: "", challanNo: "", barrelCount: "", declaredNetKg: "", notes: "" });
  const [suppliers, setSuppliers] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF((p) => ({ ...p, [k]: e.target.value }));

  useEffect(() => {
    api<{ data: { name: string; type: string }[] }>("/api/parties")
      .then((j) => setSuppliers(j.data.filter((p) => p.type !== "CUSTOMER").map((p) => p.name)))
      .catch(() => {});
  }, []);

  const submit = async () => {
    setBusy(true);
    setErr(null);
    try {
      const j = await api<{ data: Lot }>("/api/barrels", {
        method: "POST",
        json: { ...f, barrelCount: Number(f.barrelCount), declaredBarrels: Number(f.barrelCount) || null, declaredNetKg: f.declaredNetKg || null },
      });
      onCreated(j.data);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bd-card">
      <h2>
        <L en="New lot" kn="ಹೊಸ ಲೋಡ್" />
      </h2>
      <div className="bd-form">
        <label>
          <L en="Supplier / factory" kn="ಪೂರೈಕೆದಾರ" />
          <input list="bd-suppliers" value={f.supplierName} onChange={set("supplierName")} placeholder="Name on the challan" autoFocus />
          <datalist id="bd-suppliers">{suppliers.map((s) => <option key={s} value={s} />)}</datalist>
        </label>
        <label>
          <L en="Oil" kn="ಎಣ್ಣೆ" />
          <input list="bd-products" value={f.product} onChange={set("product")} placeholder="Sunflower oil" />
          <datalist id="bd-products">{PRODUCTS.map((s) => <option key={s} value={s} />)}</datalist>
        </label>
        <label>
          <L en="Number of barrels" kn="ಬ್ಯಾರಲ್ ಸಂಖ್ಯೆ" />
          <input inputMode="numeric" value={f.barrelCount} onChange={set("barrelCount")} placeholder="e.g. 8" />
        </label>
        <label>
          <L en="Vehicle no." kn="ವಾಹನ ಸಂಖ್ಯೆ" />
          <input value={f.vehicleNo} onChange={set("vehicleNo")} placeholder="KA 38 A 1234" />
        </label>
        <label>
          <L en="Challan / invoice no." kn="ಚಲನ್ ಸಂಖ್ಯೆ" />
          <input value={f.challanNo} onChange={set("challanNo")} />
        </label>
        <label>
          <L en="Total oil on challan (kg)" kn="ಚಲನ್‌ನಲ್ಲಿರುವ ಒಟ್ಟು ಎಣ್ಣೆ (ಕೆಜಿ)" />
          <input inputMode="decimal" value={f.declaredNetKg} onChange={set("declaredNetKg")} placeholder="optional" />
          <span className="bd-m small">Only the owner will see this once saved.</span>
        </label>
        <label className="wide">
          Notes
          <textarea value={f.notes} onChange={set("notes")} rows={2} />
        </label>
      </div>
      {err && <div className="bd-err">{err}</div>}
      <div className="bd-row">
        <button className="bd-btn" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
        <button className="bd-btn primary big" onClick={submit} disabled={busy || !f.supplierName.trim() || !f.product.trim() || !Number(f.barrelCount)}>
          {busy ? "Saving…" : "Create lot and barrel labels"}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// One lot
// ---------------------------------------------------------------------------
function LotView({
  lot,
  lots,
  isOwner,
  onChange,
  onBack,
  openBarrel,
}: {
  lot: Lot;
  lots: Lot[];
  isOwner: boolean;
  onChange: (l: Lot) => void;
  onBack: () => void;
  openBarrel: (code: string) => void;
}) {
  const s = lot.summary;
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [events, setEvents] = useState<EventRow[] | null>(null);
  const [addN, setAddN] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [histOpen, setHistOpen] = useState(false);

  const patch = async (json: Record<string, unknown>) => {
    setBusy(true);
    setMsg(null);
    try {
      const j = await api<{ data: Lot }>(`/api/barrels/${lot.id}`, { method: "PATCH", json });
      onChange(j.data);
      return true;
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Could not save." });
      return false;
    } finally {
      setBusy(false);
    }
  };

  const loadEvents = async () => {
    try {
      const j = await api<{ events: EventRow[] }>(`/api/barrels/${lot.id}`);
      setEvents(j.events);
    } catch {
      /* ignore */
    }
  };

  const onChallanPhoto = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setMsg(null);
    try {
      const dataUrl = await preparePhoto(file, stampLines({ title: `Mahadev Traders · Challan ${lot.lotNo}`, kind: "BILL", amountInr: 0, party: lot.supplierName, by: null }));
      await uploadProof({ kind: "BILL", dataUrl, capturedAt: new Date().toISOString() }, { date: businessDate(Date.now()), partyName: lot.supplierName, refNo: lot.challanNo || lot.lotNo, notes: `Challan photo for barrel lot ${lot.lotNo}` });
      setMsg({ ok: true, text: "Challan photo saved ✓" });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Could not save the photo." });
    } finally {
      setBusy(false);
    }
  };

  const chip = STATE_CHIP[s.state];
  const closed = lot.status === "CLOSED";
  const lotQ = encodeURIComponent(lot.lotNo);

  return (
    <>
      <div className="bd-row bd-gap">
        <button className="bd-btn" onClick={onBack}>
          ← All lots
        </button>
        <b className="bd-lotno">{lot.lotNo}</b>
        <span className={`bd-chip ${chip.cls}`}>{chip.en}</span>
        {closed && <span className="bd-chip">Closed</span>}
      </div>
      <div className="bd-card">
        <div className="bd-meta">
          <span><b>{lot.supplierName}</b></span>
          <span>{lot.product}</span>
          {lot.vehicleNo && <span>🚛 {lot.vehicleNo}</span>}
          {lot.challanNo && <span>Challan {lot.challanNo}</span>}
          {lot.tankTarget && <span>→ {lot.tankTarget}</span>}
          <span className="bd-m">{lot.date} · by {lot.createdBy}</span>
        </div>
        <div className="bd-kpis">
          <div className="bd-kpi"><div className="l"><L en="Barrels" kn="ಬ್ಯಾರಲ್" /></div><div className="v">{s.barrels}</div></div>
          <div className="bd-kpi"><div className="l"><L en="Weighed full" kn="ತುಂಬಿದ ತೂಕ" /></div><div className="v">{s.fullWeighed}/{s.barrels}</div></div>
          <div className="bd-kpi"><div className="l"><L en="Emptied + weighed" kn="ಖಾಲಿ ತೂಕ" /></div><div className="v">{s.done}/{s.barrels}</div></div>
          <div className="bd-kpi g"><div className="l"><L en="Oil received (net)" kn="ಬಂದ ಎಣ್ಣೆ" /></div><div className="v">{kg(s.measuredNetKg)} kg</div><div className="s">{s.done < s.barrels ? "so far" : "all barrels"}</div></div>
          {isOwner && s.declaredNetKg != null && (
            <div className="bd-kpi"><div className="l">Challan says</div><div className="v">{kg(s.declaredNetKg)} kg</div></div>
          )}
          {isOwner && s.diffKg != null && (
            <div className={`bd-kpi ${Math.abs(s.diffKg) > 1 ? (s.diffKg < 0 ? "r" : "o") : "g"}`}>
              <div className="l">{s.diffKg < 0 ? "Short" : s.diffKg > 0 ? "Extra" : "Difference"}</div>
              <div className="v">{s.diffKg > 0 ? "+" : ""}{kg(s.diffKg)} kg</div>
              {s.shortValueInr != null && <div className="s">≈ {rs(s.shortValueInr)}</div>}
            </div>
          )}
        </div>
        <Flags flags={s.flags} />
        <div className="bd-row">
          <LotPrintMenu lotQ={lotQ} />
          <Dropdown label="⋯ Lot ▾" width={230}>
            {(close) => (
              <>
                <label className="bd-mi" style={{ cursor: "pointer" }}>
                  📸 <L en="Challan photo" kn="ಚಲನ್ ಫೋಟೋ" />
                  <input hidden type="file" accept="image/*" capture="environment" onChange={(e) => { onChallanPhoto(e.target.files?.[0]); e.target.value = ""; close(); }} />
                </label>
                {!closed && <MenuBtn onClick={() => { close(); setAddOpen((v) => !v); }}>＋ Add barrels</MenuBtn>}
                {isOwner && <MenuBtn onClick={() => { close(); loadEvents(); setHistOpen(true); }}>🕘 Show history</MenuBtn>}
              </>
            )}
          </Dropdown>
          {!closed && addOpen && (
            <span className="bd-inline">
              <input className="bd-n" inputMode="numeric" placeholder="+ barrels" value={addN} onChange={(e) => setAddN(e.target.value)} aria-label="How many barrels to add" autoFocus />
              <button className="bd-btn" disabled={busy || !Number(addN)} onClick={async () => (await patch({ action: "addBarrels", count: Number(addN) })) && (setAddN(""), setAddOpen(false))}>
                Add
              </button>
            </span>
          )}
        </div>
        {msg && <div className={msg.ok ? "bd-ok" : "bd-err"}>{msg.text}</div>}
      </div>

      <div className="bd-split">
      <div className="bd-main">
      <div className="bd-card">
        <h2>📋 <L en="Barrels — enter every weight here" kn="ಬ್ಯಾರಲ್ ತೂಕ ಇಲ್ಲಿ ಬರೆಯಿರಿ" /></h2>
        <div className="bd-m small">Type kg and Save. Use ⋯ to edit or delete a weight. Print ▾ has every label and receipt for that barrel.</div>
        <div className="bd-tablewrap">
          <table className="bd-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Tag / serial<small> on the barrel</small></th>
                <th>Gross kg<small> oil+barrel</small></th>
                <th>Tare kg<small> empty barrel</small></th>
                <th>Net oil kg</th>
                {isOwner && <th>Challan kg</th>}
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {lot.barrels.map((b) => {
                const st = b.state;
                const fl = s.flags.filter((f) => f.seq === b.seq);
                return (
                  <tr key={b.id} className={fl.some((f) => f.level === "alert") ? "alert" : fl.length ? "warn" : ""}>
                    <td>
                      <button className="bd-linkbtn" onClick={() => openBarrel(b.code)}><b>{pad(b.seq)}</b></button>
                      <div className="bd-m tiny">{b.code}</div>
                    </td>
                    <td>
                      <MarkCell value={b.supplierMark} disabled={busy || closed} onSave={(v) => patch({ action: "setBarrel", barrelId: b.id, supplierMark: v })} />
                    </td>
                    <td className="num">
                      {b.grossKg == null && !closed ? (
                        <WeightCell code={b.code} phase="GROSS" onDone={(j) => onChange(j.data)} />
                      ) : (
                        <div className="bd-wval">
                          <span>
                            {kg(b.grossKg)}
                            {b.grossSource === "MANUAL" && isOwner && <span title={b.grossNote || "typed"}> ✋</span>}
                            <div className="bd-m tiny">{when(b.grossAt)}</div>
                          </span>
                          {!closed && b.grossKg != null && <WeightMenu lotRef={lot.lotNo} code={b.code} phase="GROSS" kg={b.grossKg} otherKg={b.emptyKg} onDone={onChange} />}
                        </div>
                      )}
                    </td>
                    <td className="num">
                      {b.grossKg != null && b.emptyKg == null && !closed ? (
                        <WeightCell code={b.code} phase="EMPTY" onDone={(j) => onChange(j.data)} />
                      ) : (
                        <div className="bd-wval">
                          <span>
                            {kg(b.emptyKg)}
                            {b.emptySource === "MANUAL" && isOwner && <span title={b.emptyNote || "typed"}> ✋</span>}
                            <div className="bd-m tiny">{when(b.emptyAt)}</div>
                          </span>
                          {!closed && b.emptyKg != null && <WeightMenu lotRef={lot.lotNo} code={b.code} phase="EMPTY" kg={b.emptyKg} otherKg={b.grossKg} onDone={onChange} />}
                        </div>
                      )}
                    </td>
                    <td className="num"><b>{kg(b.net)}</b></td>
                    {isOwner && (
                      <td className="num">
                        <DeclaredCell value={b.declaredNetKg} disabled={busy} onSave={(v) => patch({ action: "setBarrel", barrelId: b.id, declaredNetKg: v })} />
                      </td>
                    )}
                    <td>{st === "NEW" ? "Not weighed" : st === "FULL" ? "Full, waiting" : "Done ✓"}</td>
                    <td>
                      <BarrelPrintMenu lotQ={lotQ} seq={b.seq} code={b.code} hasGross={b.grossKg != null} hasEmpty={b.emptyKg != null} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td>Total</td>
                <td />
                <td className="num">{kg(s.grossTotalKg)}</td>
                <td className="num">{kg(s.emptyTotalKg)}</td>
                <td className="num"><b>{kg(s.measuredNetKg)}</b></td>
                {isOwner && <td />}
                <td colSpan={2} />
              </tr>
            </tfoot>
          </table>
        </div>
        <div className="bd-m small">Totals count only barrels that have both weights, so gross − tare = net always adds up.</div>
      </div>
      </div>
      {!closed && (
        <div className="bd-side">
          <WeighPanel lots={lots} isOwner={isOwner} hintLot={lot} presetCode={null} onSaved={onChange} />
        </div>
      )}
      </div>

      {isOwner && <OwnerPanel lot={lot} busy={busy} closed={closed} patch={patch} events={events} loadEvents={loadEvents} histOpen={histOpen} setHistOpen={setHistOpen} />}
    </>
  );
}

function Flags({ flags }: { flags: Flag[] }) {
  if (!flags.length) return null;
  const sorted = [...flags].sort((a, b) => (a.level === b.level ? 0 : a.level === "alert" ? -1 : 1));
  return (
    <ul className="bd-flags">
      {sorted.map((f, i) => (
        <li key={i} className={f.level}>
          {f.level === "alert" ? "🚨" : "⚠️"} {f.msg}
        </li>
      ))}
    </ul>
  );
}

function MarkCell({ value, disabled, onSave }: { value: string | null; disabled: boolean; onSave: (v: string) => Promise<boolean> }) {
  const [edit, setEdit] = useState(false);
  const [v, setV] = useState("");
  if (!edit)
    return (
      <button className="bd-linkbtn" disabled={disabled} onClick={() => { setV(value ?? ""); setEdit(true); }}>
        {value || "add tag"}
      </button>
    );
  return (
    <span className="bd-inline">
      <input className="bd-n" value={v} maxLength={30} onChange={(e) => setV(e.target.value)} autoFocus aria-label="Tag or serial number painted on the barrel" />
      <button className="bd-linkbtn" disabled={disabled} onClick={async () => (await onSave(v)) && setEdit(false)}>
        ok
      </button>
    </span>
  );
}
function DeclaredCell({ value, disabled, onSave }: { value: number | null; disabled: boolean; onSave: (v: string) => Promise<boolean> }) {
  const [edit, setEdit] = useState(false);
  const [v, setV] = useState("");
  if (!edit)
    return (
      <button className="bd-linkbtn" onClick={() => { setV(value == null ? "" : String(value)); setEdit(true); }}>
        {value == null ? "add" : kg(value)}
      </button>
    );
  return (
    <span className="bd-inline">
      <input className="bd-n" inputMode="decimal" value={v} onChange={(e) => setV(e.target.value)} autoFocus aria-label="Supplier's net kg for this barrel" />
      <button className="bd-linkbtn" disabled={disabled} onClick={async () => (await onSave(v)) && setEdit(false)}>
        ok
      </button>
    </span>
  );
}

// ---------------------------------------------------------------------------
// Owner-only: challan figures, close lot, audit trail
// ---------------------------------------------------------------------------
function OwnerPanel({
  lot,
  busy,
  closed,
  patch,
  events,
  loadEvents,
  histOpen,
  setHistOpen,
}: {
  lot: Lot;
  histOpen: boolean;
  setHistOpen: (v: boolean) => void;
  busy: boolean;
  closed: boolean;
  patch: (j: Record<string, unknown>) => Promise<boolean>;
  events: EventRow[] | null;
  loadEvents: () => void;
}) {
  const [f, setF] = useState({ declaredNetKg: lot.declaredNetKg ?? "", rateInrPerKg: lot.rateInrPerKg ?? "", challanNo: lot.challanNo ?? "", declaredBarrels: lot.declaredBarrels ?? "" });
  const [note, setNote] = useState("");
  useEffect(() => {
    setF({ declaredNetKg: lot.declaredNetKg ?? "", rateInrPerKg: lot.rateInrPerKg ?? "", challanNo: lot.challanNo ?? "", declaredBarrels: lot.declaredBarrels ?? "" });
  }, [lot.declaredNetKg, lot.rateInrPerKg, lot.challanNo, lot.declaredBarrels]);
  const unfinished = lot.barrels.filter((b) => b.state !== "DONE").length;
  return (
    <details className="bd-card bd-fold" open={histOpen || undefined} onToggle={(e) => setHistOpen((e.target as HTMLDetailsElement).open)}>
      <summary>🔒 Owner — challan figures, close lot, history</summary>
      <div className="bd-form">
        <label>
          Total oil on challan (kg)
          <input inputMode="decimal" value={String(f.declaredNetKg)} onChange={(e) => setF({ ...f, declaredNetKg: e.target.value })} />
        </label>
        <label>
          Barrels on challan
          <input inputMode="numeric" value={String(f.declaredBarrels)} onChange={(e) => setF({ ...f, declaredBarrels: e.target.value })} />
        </label>
        <label>
          Rate ₹ per kg
          <input inputMode="decimal" value={String(f.rateInrPerKg)} onChange={(e) => setF({ ...f, rateInrPerKg: e.target.value })} />
        </label>
        <label>
          Challan no.
          <input value={String(f.challanNo)} onChange={(e) => setF({ ...f, challanNo: e.target.value })} />
        </label>
      </div>
      <div className="bd-row">
        <button className="bd-btn" disabled={busy} onClick={() => patch({ action: "edit", ...f })}>
          Save figures
        </button>
        {!closed ? (
          <>
            <input className="bd-why" placeholder={unfinished ? `${unfinished} barrel(s) unfinished — note to close anyway` : "Closing note (optional)"} value={note} onChange={(e) => setNote(e.target.value)} />
            <button className="bd-btn primary" disabled={busy || (unfinished > 0 && note.trim().length < 3)} onClick={() => patch({ action: "close", note })}>
              Close lot
            </button>
          </>
        ) : (
          <button className="bd-btn" disabled={busy} onClick={() => patch({ action: "reopen" })}>
            Reopen lot
          </button>
        )}
        <button className="bd-btn" onClick={loadEvents}>
          {events ? "Refresh" : "Show"} history
        </button>
      </div>
      <div className="bd-m small">Every change to these figures and every weighment is kept in the history below, with who and when.</div>
      {events && (
        <ul className="bd-events">
          {events.map((e) => (
            <li key={e.id}>
              <b>{e.action}</b> {e.barrelCode ? `· ${e.barrelCode}` : ""} · {e.by} · {when(e.at)}
              {e.detail ? <code>{JSON.stringify(e.detail)}</code> : null}
            </li>
          ))}
        </ul>
      )}
    </details>
  );
}
