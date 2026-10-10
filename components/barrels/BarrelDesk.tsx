"use client";

// Barrel receiving desk (/barrels).
//
// Oil bought in barrels: start a lot → print a barcode label for every barrel
// → weigh each barrel FULL on the platform scale → pour it into the tank →
// weigh it EMPTY → the desk adds up the net oil and (for the owner) compares
// it with the supplier's challan.
//
// Weights come from the scale itself: the scale bridge posts each steady
// reading to the server, and "Save weight" uses that reading — the browser
// never types the number. Typing a weight is a flagged fallback.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  barrelState,
  parseBarrelCode,
  tickFresh,
  type BarrelState,
  type Flag,
  type Phase,
  type ReceiptSummary,
} from "@/lib/barrels";
import { useScale } from "@/components/ScaleProvider";
import BarcodeScanner, { cameraScanSupported } from "@/components/barrels/BarcodeScanner";
import { preparePhoto, stampLines, uploadProof } from "@/lib/proofClient";
import { businessDate } from "@/lib/register";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface BarrelRow {
  id: string;
  seq: number;
  code: string;
  supplierMark: string | null;
  declaredNetKg: number | null;
  grossKg: number | null;
  grossAt: string | null;
  grossBy: string | null;
  grossSource: string | null;
  grossScale: string | null;
  grossNote: string | null;
  emptyKg: number | null;
  emptyAt: string | null;
  emptyBy: string | null;
  emptySource: string | null;
  emptyScale: string | null;
  emptyNote: string | null;
  net: number | null;
  state: BarrelState;
}
interface Lot {
  id: string;
  lotNo: string;
  date: string;
  supplierName: string;
  product: string;
  vehicleNo: string | null;
  challanNo: string | null;
  rateInrPerKg: number | null;
  declaredNetKg: number | null;
  declaredBarrels: number | null;
  tankTarget: string | null;
  status: string;
  closeNote: string | null;
  notes: string | null;
  createdBy: string;
  barrels: BarrelRow[];
  summary: ReceiptSummary;
}
interface Tick {
  id: string;
  source: string;
  weightKg: number;
  settledAt: string;
  usedAt: string | null;
  usedBarrelCode: string | null;
}
interface EventRow {
  id: string;
  action: string;
  barrelCode: string | null;
  detail: Record<string, unknown> | null;
  by: string;
  at: string;
}

const PRODUCTS = ["Sunflower oil", "Rice bran oil", "Soyabean oil", "Groundnut oil", "Mustard oil", "Karadi (safflower) oil", "Goldrop"];
const TANKS = ["Sunflower tank", "Karadi tank 1", "K2"];

const kg = (n: number | null | undefined) => (n == null ? "—" : `${Math.round(n * 100) / 100}`);
const rs = (n: number) => "₹" + Math.round(n).toLocaleString("en-IN");
const when = (t: string | null) =>
  t ? new Date(t).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" }) : "";

async function api<T = unknown>(path: string, init?: RequestInit & { json?: unknown }): Promise<T & { error?: string }> {
  const res = await fetch(path, {
    ...init,
    headers: init?.json ? { "Content-Type": "application/json" } : undefined,
    body: init?.json ? JSON.stringify(init.json) : undefined,
    cache: "no-store",
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error || `Something went wrong (${res.status})`);
  return j;
}

const L = ({ en, kn }: { en: string; kn: string }) => (
  <>
    {en}
    <span className="bd-kn">{kn}</span>
  </>
);

const STATE_CHIP: Record<string, { en: string; kn: string; cls: string }> = {
  NOT_STARTED: { en: "Not started", kn: "ಶುರುವಾಗಿಲ್ಲ", cls: "" },
  WEIGHING_IN: { en: "Weighing full", kn: "ತುಂಬಿದ ತೂಕ ನಡೆಯುತ್ತಿದೆ", cls: "o" },
  UNLOADING: { en: "Emptying", kn: "ಖಾಲಿ ಮಾಡುತ್ತಿದ್ದಾರೆ", cls: "b" },
  RECONCILED: { en: "All weighed", kn: "ಎಲ್ಲಾ ತೂಕ ಆಯಿತು", cls: "g" },
};

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default function BarrelDesk() {
  const [lots, setLots] = useState<Lot[]>([]);
  const [isOwner, setIsOwner] = useState(false);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [view, setView] = useState<{ t: "list" } | { t: "new" } | { t: "lot"; id: string }>({ t: "list" });
  const [showClosed, setShowClosed] = useState(false);

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

  // Deep link: /barrels?lot=R261010-1
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("lot");
    if (q && lots.length) {
      const hit = lots.find((l) => l.lotNo === q || l.id === q);
      if (hit) setView({ t: "lot", id: hit.id });
    }
    // only on first load of lots
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lots.length === 0]);

  const replaceLot = (l: Lot) => setLots((all) => (all.some((x) => x.id === l.id) ? all.map((x) => (x.id === l.id ? l : x)) : [l, ...all]));
  const current = view.t === "lot" ? lots.find((l) => l.id === view.id) : undefined;

  return (
    <div className="bd-wrap">
      <header className="bd-top">
        <div>
          <a href="/go" className="bd-m small">
            ← Quick links
          </a>
          <h1>
            🛢️ <L en="Barrel receiving" kn="ಬ್ಯಾರಲ್ ಸ್ವೀಕಾರ" />
          </h1>
        </div>
        {view.t === "list" && (
          <button className="bd-btn primary big" onClick={() => setView({ t: "new" })}>
            ➕ <L en="New lot" kn="ಹೊಸ ಲೋಡ್" />
          </button>
        )}
      </header>

      {err && <div className="bd-err">{err}</div>}

      {view.t === "list" && (
        <LotList lots={lots} loading={loading} isOwner={isOwner} showClosed={showClosed} setShowClosed={setShowClosed} open={(id) => setView({ t: "lot", id })} />
      )}
      {view.t === "new" && (
        <NewLot
          isOwner={isOwner}
          onCancel={() => setView({ t: "list" })}
          onCreated={(l) => {
            replaceLot(l);
            setView({ t: "lot", id: l.id });
          }}
        />
      )}
      {view.t === "lot" && current && (
        <LotView lot={current} lots={lots} isOwner={isOwner} onChange={replaceLot} onBack={() => { setView({ t: "list" }); load(); }} onOpenLot={(id) => setView({ t: "lot", id })} />
      )}
      {view.t === "lot" && !current && !loading && (
        <div className="bd-card">
          That lot is not in the list (it may be closed). <button className="bd-linkbtn" onClick={() => setView({ t: "list" })}>Back</button>
        </div>
      )}
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
          No barrels waiting. When a supplier&apos;s vehicle arrives, tap <b>New lot</b>.
          <div className="bd-kn2">ಸರಬರಾಜುದಾರರ ವಾಹನ ಬಂದಾಗ “ಹೊಸ ಲೋಡ್” ಒತ್ತಿ.</div>
        </div>
      )}
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
function NewLot({ isOwner, onCancel, onCreated }: { isOwner: boolean; onCancel: () => void; onCreated: (l: Lot) => void }) {
  const [f, setF] = useState({ supplierName: "", product: "", vehicleNo: "", challanNo: "", barrelCount: "", declaredNetKg: "", tankTarget: "", rateInrPerKg: "", notes: "" });
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
        json: { ...f, barrelCount: Number(f.barrelCount), declaredBarrels: Number(f.barrelCount) || null, declaredNetKg: f.declaredNetKg || null, rateInrPerKg: f.rateInrPerKg || null },
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
        <label>
          <L en="Pour into tank" kn="ಯಾವ ಟ್ಯಾಂಕ್‌ಗೆ" />
          <input list="bd-tanks" value={f.tankTarget} onChange={set("tankTarget")} placeholder="optional" />
          <datalist id="bd-tanks">{TANKS.map((s) => <option key={s} value={s} />)}</datalist>
        </label>
        {isOwner && (
          <label>
            Rate ₹ per kg <span className="bd-m small">(owner only)</span>
            <input inputMode="decimal" value={f.rateInrPerKg} onChange={set("rateInrPerKg")} placeholder="to price any shortage" />
          </label>
        )}
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
  onOpenLot,
}: {
  lot: Lot;
  lots: Lot[];
  isOwner: boolean;
  onChange: (l: Lot) => void;
  onBack: () => void;
  onOpenLot: (id: string) => void;
}) {
  const s = lot.summary;
  const [phase, setPhase] = useState<Phase>("GROSS");
  const [codeText, setCodeText] = useState("");
  const [scanning, setScanning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [manual, setManual] = useState(false);
  const [manualKg, setManualKg] = useState("");
  const [manualWhy, setManualWhy] = useState("");
  const [reweigh, setReweigh] = useState(false);
  const [why, setWhy] = useState("");
  const [events, setEvents] = useState<EventRow[] | null>(null);
  const [addN, setAddN] = useState("");
  const codeRef = useRef<HTMLInputElement>(null);

  // --- scale readings -------------------------------------------------------
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

  // --- which barrel ---------------------------------------------------------
  const parsed = parseBarrelCode(codeText);
  const inThisLot = parsed ? lot.barrels.find((b) => b.code === parsed.code) : undefined;
  const otherLot = parsed && !inThisLot ? lots.find((l) => l.barrels.some((b) => b.code === parsed.code)) : undefined;
  const target = inThisLot;

  const problem = useMemo(() => {
    if (!target) return null;
    if (phase === "GROSS" && target.grossKg != null && !reweigh) return `Barrel ${pad(target.seq)} is already weighed full (${kg(target.grossKg)} kg).`;
    if (phase === "EMPTY" && target.grossKg == null) return `Barrel ${pad(target.seq)} has not been weighed full yet.`;
    if (phase === "EMPTY" && target.emptyKg != null && !reweigh) return `Barrel ${pad(target.seq)} is already weighed empty (${kg(target.emptyKg)} kg).`;
    return null;
  }, [target, phase, reweigh]);

  const refreshFrom = (data: Lot) => onChange(data);

  const save = async (viaManual: boolean) => {
    if (!target) return;
    setBusy(true);
    setMsg(null);
    try {
      const j = await api<{ data: Lot; kg: number }>("/api/barrels/weigh", {
        method: "POST",
        json: {
          code: target.code,
          phase,
          source: viaManual ? "MANUAL" : "SCALE",
          tickId: viaManual ? undefined : usable?.id,
          kg: viaManual ? Number(manualKg) : undefined,
          note: viaManual ? manualWhy : reweigh ? why : undefined,
          reweigh,
        },
      });
      refreshFrom(j.data);
      setMsg({ ok: true, text: `Barrel ${pad(target.seq)} ${phase === "GROSS" ? "full" : "empty"}: ${kg(j.kg)} kg saved ✓` });
      setCodeText("");
      setManualKg("");
      setManualWhy("");
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

  const patch = async (json: Record<string, unknown>) => {
    setBusy(true);
    setMsg(null);
    try {
      const j = await api<{ data: Lot }>(`/api/barrels/${lot.id}`, { method: "PATCH", json });
      refreshFrom(j.data);
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
  const nextFull = lot.barrels.find((b) => b.state === "NEW");
  const nextEmpty = lot.barrels.find((b) => b.state === "FULL");

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
          <a className="bd-btn" href={`/barrels/labels?lot=${encodeURIComponent(lot.lotNo)}`} target="_blank" rel="noreferrer">
            🏷️ <L en="Print barrel labels" kn="ಲೇಬಲ್ ಪ್ರಿಂಟ್" />
          </a>
          <label className="bd-btn">
            📸 <L en="Challan photo" kn="ಚಲನ್ ಫೋಟೋ" />
            <input hidden type="file" accept="image/*" capture="environment" onChange={(e) => { onChallanPhoto(e.target.files?.[0]); e.target.value = ""; }} />
          </label>
          {!closed && (
            <span className="bd-inline">
              <input className="bd-n" inputMode="numeric" placeholder="+ barrels" value={addN} onChange={(e) => setAddN(e.target.value)} aria-label="How many barrels to add" />
              <button className="bd-btn" disabled={busy || !Number(addN)} onClick={async () => (await patch({ action: "addBarrels", count: Number(addN) })) && setAddN("")}>
                Add
              </button>
            </span>
          )}
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {!closed && (
        <div className="bd-card bd-weigh">
          <div className="bd-steps" role="tablist">
            <button role="tab" aria-selected={phase === "GROSS"} className={phase === "GROSS" ? "on" : ""} onClick={() => { setPhase("GROSS"); setReweigh(false); }}>
              ① <L en="Full barrel" kn="ತುಂಬಿದ ಬ್ಯಾರಲ್" />
              <small>before pouring</small>
            </button>
            <button role="tab" aria-selected={phase === "EMPTY"} className={phase === "EMPTY" ? "on" : ""} onClick={() => { setPhase("EMPTY"); setReweigh(false); }}>
              ② <L en="Empty barrel" kn="ಖಾಲಿ ಬ್ಯಾರಲ್" />
              <small>after pouring &amp; draining</small>
            </button>
          </div>

          <div className="bd-scanrow">
            <input
              ref={codeRef}
              className="bd-code"
              value={codeText}
              onChange={(e) => setCodeText(e.target.value)}
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
          {phase === "GROSS" && nextFull && !codeText && <div className="bd-m small">Next unweighed: Barrel {pad(nextFull.seq)} <button className="bd-linkbtn" onClick={() => setCodeText(nextFull.code)}>use</button></div>}
          {phase === "EMPTY" && nextEmpty && !codeText && <div className="bd-m small">Waiting to be weighed empty: Barrel {pad(nextEmpty.seq)} <button className="bd-linkbtn" onClick={() => setCodeText(nextEmpty.code)}>use</button></div>}

          {codeText && !parsed && <div className="bd-err">That does not look like a barrel label.</div>}
          {parsed && otherLot && (
            <div className="bd-err">
              That label belongs to lot {otherLot.lotNo} ({otherLot.supplierName}). <button className="bd-linkbtn" onClick={() => onOpenLot(otherLot.id)}>Open that lot</button>
            </div>
          )}
          {parsed && !inThisLot && !otherLot && <div className="bd-err">No barrel with this label. Check the lot number.</div>}
          {target && (
            <div className="bd-target">
              <b>Barrel {pad(target.seq)}</b> · {target.code}
              <span className="bd-m"> · full {kg(target.grossKg)} kg · empty {kg(target.emptyKg)} kg</span>
            </div>
          )}
          {problem && (
            <div className="bd-err">
              {problem}{" "}
              {isOwner && !reweigh && (
                <button className="bd-linkbtn" onClick={() => setReweigh(true)}>
                  Weigh again (owner)
                </button>
              )}
            </div>
          )}
          {reweigh && isOwner && (
            <input className="bd-why" value={why} onChange={(e) => setWhy(e.target.value)} placeholder="Why weigh again? (kept in the record)" />
          )}

          <div className={`bd-scale ${usable ? "ready" : ""}`}>
            {usable ? (
              <>
                <div className="bd-big">{kg(usable.weightKg)} <small>kg</small></div>
                <div className="bd-m">
                  <span className="bd-dot on" /> <L en="Steady" kn="ಸ್ಥಿರ" /> · {usable.source} · {usableAge}s ago
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

          <button
            className="bd-btn primary huge"
            disabled={busy || !target || !!problem || !usable || (reweigh && why.trim().length < 3)}
            onClick={() => save(false)}
          >
            ✅ <L en={`Save ${phase === "GROSS" ? "full" : "empty"} weight`} kn="ತೂಕ ಉಳಿಸಿ" />
            {usable && target ? ` — ${kg(usable.weightKg)} kg` : ""}
          </button>
          {!usable && !ticks.length && (
            <div className="bd-m small">
              No reading has come from the scale in the last 15 minutes. Check that the scale bridge is running on the shop PC (see docs/BARREL-RECEIVING.md).
            </div>
          )}

          {msg && <div className={msg.ok ? "bd-ok" : "bd-err"}>{msg.text}</div>}

          <div className="bd-manual">
            <button className="bd-linkbtn" onClick={() => setManual((v) => !v)}>
              {manual ? "Hide" : "Scale not working? Type the weight"}
            </button>
            {manual && (
              <div className="bd-row">
                <input className="bd-n" inputMode="decimal" placeholder="kg" value={manualKg} onChange={(e) => setManualKg(e.target.value)} aria-label="Weight in kg" />
                <input className="bd-why" placeholder="Why? (required)" value={manualWhy} onChange={(e) => setManualWhy(e.target.value)} />
                <button className="bd-btn" disabled={busy || !target || !!problem || !Number(manualKg) || manualWhy.trim().length < 3} onClick={() => save(true)}>
                  Save typed weight
                </button>
              </div>
            )}
            {manual && <div className="bd-m small">A typed weight is marked in the record and the owner is shown a warning.</div>}
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      <div className="bd-card">
        <div className="bd-tablewrap">
          <table className="bd-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Full kg</th>
                <th>Empty kg</th>
                <th>Net oil kg</th>
                {isOwner && <th>Challan kg</th>}
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {lot.barrels.map((b) => {
                const st = barrelState(b);
                const fl = s.flags.filter((f) => f.seq === b.seq);
                return (
                  <tr key={b.id} className={fl.some((f) => f.level === "alert") ? "alert" : fl.length ? "warn" : ""}>
                    <td>
                      <b>{pad(b.seq)}</b>
                      <div className="bd-m tiny">{b.code}</div>
                    </td>
                    <td className="num">
                      {kg(b.grossKg)}
                      {b.grossSource === "MANUAL" && isOwner && <span title={b.grossNote || "typed"}> ✋</span>}
                      <div className="bd-m tiny">{when(b.grossAt)}</div>
                    </td>
                    <td className="num">
                      {kg(b.emptyKg)}
                      {b.emptySource === "MANUAL" && isOwner && <span title={b.emptyNote || "typed"}> ✋</span>}
                      <div className="bd-m tiny">{when(b.emptyAt)}</div>
                    </td>
                    <td className="num"><b>{kg(b.net)}</b></td>
                    {isOwner && (
                      <td className="num">
                        <DeclaredCell value={b.declaredNetKg} disabled={busy} onSave={(v) => patch({ action: "setBarrel", barrelId: b.id, declaredNetKg: v })} />
                      </td>
                    )}
                    <td>{st === "NEW" ? "Not weighed" : st === "FULL" ? "Full, waiting" : "Done ✓"}</td>
                    <td>
                      {!closed && (
                        <button
                          className="bd-linkbtn"
                          onClick={() => {
                            setCodeText(b.code);
                            setPhase(st === "FULL" ? "EMPTY" : "GROSS");
                            window.scrollTo({ top: 0, behavior: "smooth" });
                          }}
                        >
                          weigh
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td>Total</td>
                <td className="num">{kg(s.grossTotalKg)}</td>
                <td className="num">{kg(s.emptyTotalKg)}</td>
                <td className="num"><b>{kg(s.measuredNetKg)}</b></td>
                {isOwner && <td />}
                <td colSpan={2} />
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {isOwner && (
        <OwnerPanel lot={lot} busy={busy} closed={closed} patch={patch} events={events} loadEvents={loadEvents} />
      )}
      {scanning && (
        <BarcodeScanner
          onClose={() => setScanning(false)}
          onCode={(c) => {
            setCodeText(c);
            setScanning(false);
          }}
        />
      )}
    </>
  );
}

const pad = (n: number) => String(n).padStart(2, "0");

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
}: {
  lot: Lot;
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
    <div className="bd-card">
      <h3>🔒 Owner</h3>
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
    </div>
  );
}

