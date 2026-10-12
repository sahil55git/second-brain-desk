"use client";

// Tanks, barrels and storage as cards with a small live fill. Tank levels are the
// latest counted stock from the daily tally (kg); barrels are the full barrels
// waiting to be emptied (from the barrel register). Tap a card to open it in a
// pop window. Tank sizes can be corrected there and are saved on this device.
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import Peekable from "@/components/launcher/Peekable";
import { BARREL, CAPS_KEY, TANKS, bagRange, barrelStatus, fillPct, freeKg, normalizeCaps, parseCap, tankFigures, tankStatus, type TankStatus } from "@/lib/stockTanks";

export type TankStock = Record<string, { now: number | null; yesterday: number | null; t1: number | null; t2: number | null }>;
type BarrelRow = { code: string; product: string; supplierName: string; lotNo: string; estNetKg: number | null; waitingDays: number | null; tankTarget: string | null };

const fmt = (n: number | null | undefined) => (n == null ? "—" : String(Math.round(n * 10) / 10));
const CHIP: Record<TankStatus, string> = { uncounted: "Not counted", low: "Low", ok: "OK", full: "Full", over: "Check count" };

type Sel = { t: "tank"; key: string } | { t: "barrel"; code: string } | null;

function Vessel({ pct, color, kind, big = false, mark }: { pct: number; color: string; kind: "tank" | "barrel"; big?: boolean; mark?: number }) {
  return (
    <span className={`tk-vessel ${kind}${big ? " big" : ""}`} aria-hidden>
      <span className="tk-liq" style={{ height: `${pct}%`, ["--tk" as string]: color }}>
        <span className="tk-wave" />
      </span>
      {mark != null && <span className="tk-mark" style={{ bottom: `${mark}%` }} />}
      <span className="tk-pct">{pct}%</span>
    </span>
  );
}

type StoreRow = { key: string; label: string; kg: number | null; counted: boolean; group: "Seed" | "Cake" };
type TallyApi = { rows: { key: string; label: string; expected: number | null }[]; saved: { rows?: Record<string, { counted?: number | null }> } | null };

export default function TankView({ stock, onCount, date }: { stock: TankStock; onCount: (key: string) => void; date: string }) {
  const [tab, setTab] = useState<"all" | "tanks" | "barrels" | "storage">("all");
  const [store, setStore] = useState<StoreRow[] | null>(null);
  const [serr, setSerr] = useState<string | null>(null);
  const [caps, setCaps] = useState<Record<string, number>>(() => normalizeCaps(null));
  const [barrels, setBarrels] = useState<BarrelRow[] | null>(null);
  const [berr, setBerr] = useState<string | null>(null);
  const [sel, setSel] = useState<Sel>(null);
  const [capDraft, setCapDraft] = useState("");
  const [capErr, setCapErr] = useState("");

  useEffect(() => {
    try {
      setCaps(normalizeCaps(JSON.parse(localStorage.getItem(CAPS_KEY) || "null")));
    } catch {}
  }, []);
  useEffect(() => {
    let live = true;
    fetch("/api/barrels/register?status=waiting")
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
        if (live) setBarrels(j.data as BarrelRow[]);
      })
      .catch((e) => live && setBerr(e instanceof Error ? e.message : "Could not load barrels"));
    return () => {
      live = false;
    };
  }, []);
  useEffect(() => {
    let live = true;
    const get = async (desk: string, group: "Seed" | "Cake"): Promise<StoreRow[]> => {
      const r = await fetch(`/api/tallies?desk=${desk}&date=${date}`);
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
      const d = j.data as TallyApi;
      return d.rows.map((x) => {
        const c = d.saved?.rows?.[x.key]?.counted;
        return { key: `${desk}:${x.key}`, label: x.label, kg: c ?? x.expected, counted: c != null, group };
      });
    };
    Promise.all([get("SEED", "Seed"), get("CAKE", "Cake")])
      .then(([a, b]) => live && setStore([...a, ...b]))
      .catch((e) => live && setSerr(e instanceof Error ? e.message : "Could not load storage"));
    return () => {
      live = false;
    };
  }, [date]);
  useEffect(() => {
    if (!sel) return;
    const k = (e: KeyboardEvent) => e.key === "Escape" && setSel(null);
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [sel]);

  const tanks = useMemo(
    () =>
      TANKS.map((t) => {
        const s = tankFigures(t, stock);
        const cap = caps[t.key] ?? t.capKg;
        const now = s?.now ?? null;
        return { ...t, cap, now, s, pct: fillPct(now, cap), status: tankStatus(now, cap), free: freeKg(now, cap) };
      }),
    [stock, caps]
  );
  const lowCount = tanks.filter((t) => t.status === "low").length;

  const saveCap = (key: string) => {
    const v = parseCap(capDraft);
    if (v === null) return setCapErr("Enter a size in kg, like 2700");
    const next = { ...caps, [key]: v };
    setCaps(next);
    setCapErr("");
    try {
      localStorage.setItem(CAPS_KEY, JSON.stringify(next));
    } catch {}
  };

  const selTank = sel?.t === "tank" ? tanks.find((t) => t.key === sel.key) : null;
  const selBarrel = sel?.t === "barrel" && barrels ? barrels.find((b) => b.code === sel.code) : null;
  const shown = barrels ? barrels.slice(0, 24) : [];

  return (
    <section className="hub-card tk-sec">
      <div className="hub-card-head">
        <h3>🛢️ Tanks &amp; barrels</h3>
        <div className="hr stk-row">
          <span className="hub-m">{lowCount ? <b style={{ color: "var(--h-r)" }}>{lowCount} tank{lowCount === 1 ? "" : "s"} low</b> : "Tank levels from the latest count"}</span>
          <div className="stk-seg">
            {(["all", "tanks", "barrels", "storage"] as const).map((t) => (
              <button key={t} className={tab === t ? "on" : ""} onClick={() => setTab(t)}>
                {t === "all" ? "All" : t === "tanks" ? "Tanks" : t === "barrels" ? "Barrels" : "Storage"}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="tk-grid">
        {(tab === "all" || tab === "tanks") &&
          tanks.map((t) => (
            <Peekable
              key={t.key}
              className="tk-pk"
              title={t.name}
              lines={[
                { k: "In tank", v: t.now == null ? "not counted" : `${fmt(t.now)} kg` },
                { k: "Size", v: `${t.cap} kg` },
                { k: "Free space", v: t.free == null ? "—" : `${fmt(t.free)} kg` },
              ]}
              add={{ label: "Count it now", run: () => onCount(t.key) }}
              extra={[{ label: "Open details", run: () => setSel({ t: "tank", key: t.key }) }]}
            >
              <button className={`tk-card ${t.status}`} onClick={() => setSel({ t: "tank", key: t.key })}>
                <Vessel pct={t.pct} color={t.color} kind="tank" />
                <span className="tk-body">
                  <span className="tk-top"><b>{t.name}{t.also ? <small className="tk-also"> + {t.also.map((a) => a.label).join(", ")}</small> : null}</b><span className={`tk-chip ${t.status}`}>{CHIP[t.status]}</span></span>
                  <span className="tk-now"><b>{t.now == null ? "—" : fmt(t.now)}</b> <small>/ {t.cap} kg</small></span>
                  <span className="tk-bar"><i style={{ width: `${t.pct}%` }} /></span>
                  <small>{t.free == null ? "Count this tank to see the level" : `${fmt(t.free)} kg free`}</small>
                </span>
              </button>
            </Peekable>
          ))}

        {(tab === "all" || tab === "barrels") &&
          shown.map((b) => {
            const kg = b.estNetKg ?? BARREL.standardKg;
            const est = b.estNetKg == null;
            const st = barrelStatus(kg);
            return (
              <button key={b.code} className={`tk-card barrel ${st === "over" ? "over" : ""}`} onClick={() => setSel({ t: "barrel", code: b.code })}>
                <Vessel pct={fillPct(kg, BARREL.maxKg)} color="#E9B31D" kind="barrel" mark={fillPct(BARREL.standardKg, BARREL.maxKg)} />
                <span className="tk-body">
                  <span className="tk-top"><b>{b.code}</b><span className={`tk-chip ${st === "over" ? "over" : "ok"}`}>{st === "over" ? "Over 190" : st === "top" ? "Topped up" : st === "short" ? "Short fill" : "Standard"}</span></span>
                  <span className="tk-now"><b>{est ? `≈ ${BARREL.standardKg}` : `≈ ${fmt(kg)}`}</b> <small>kg of {BARREL.maxKg}</small></span>
                  <span className="tk-bar"><i style={{ width: `${fillPct(kg, BARREL.maxKg)}%` }} /></span>
                  <small>{b.product} · {b.waitingDays != null ? `waiting ${b.waitingDays} d` : "waiting to empty"}</small>
                </span>
              </button>
            );
          })}
      </div>

      {(tab === "all" || tab === "storage") && (
        <div className="tk-grid" style={{ marginTop: tab === "all" ? 10 : 0 }}>
          {(store || []).map((r) => {
            const bags = bagRange(r.kg);
            return (
              <div key={r.key} className="tk-card store">
                <span className="tk-bag" aria-hidden>{r.group === "Seed" ? "🌾" : "🧱"}</span>
                <span className="tk-body">
                  <span className="tk-top"><b>{r.label}</b><span className={`tk-chip ${r.counted ? "ok" : ""}`}>{r.counted ? "Counted" : "Book"}</span></span>
                  <span className="tk-now"><b>{r.kg == null ? "—" : fmt(r.kg)}</b> <small>kg</small></span>
                  <small>{bags ? `≈ ${bags.min === bags.max ? bags.min : `${bags.min}–${bags.max}`} bags of 40–50 kg` : "No stock"}</small>
                </span>
              </div>
            );
          })}
        </div>
      )}
      {(tab === "all" || tab === "storage") && (serr || store === null) && (
        <div className="hub-m" style={{ marginTop: 8 }}>{serr ? <>Seed and cake stock could not be loaded: {serr}</> : "Loading seed and cake stock…"}</div>
      )}

      {(tab === "all" || tab === "barrels") && (
        <div className="hub-m" style={{ marginTop: 8 }}>
          {berr ? <>Barrels could not be loaded: {berr}</> : barrels === null ? "Loading barrels…" : barrels.length === 0 ? "No full barrels waiting to be emptied." : <>{barrels.length} full barrel{barrels.length === 1 ? "" : "s"} waiting to be emptied{barrels.length > shown.length ? ` (showing ${shown.length})` : ""}. Standard fill {BARREL.standardKg} kg, limit {BARREL.maxKg} kg. Oil in a waiting barrel is an estimate until it is emptied and weighed.</>}
        </div>
      )}

      {(selTank || selBarrel) && typeof document !== "undefined" && createPortal(
        <div className="tk-scrim" onClick={() => setSel(null)}>
          <div className="tk-pop" role="dialog" aria-label="Details" onClick={(e) => e.stopPropagation()}>
            {selTank && (
              <>
                <div className="tk-ph"><b>{selTank.name}</b><span className={`tk-chip ${selTank.status}`}>{CHIP[selTank.status]}</span><button onClick={() => setSel(null)} aria-label="Close">✕</button></div>
                <div className="tk-pb">
                  <Vessel pct={selTank.pct} color={selTank.color} kind="tank" big />
                  <div className="tk-info">
                    <div className="tk-big"><b>{selTank.now == null ? "—" : fmt(selTank.now)}</b> <small>kg of {selTank.cap}</small></div>
                    <div className="tk-three">
                      <div>Free space<b>{selTank.free == null ? "—" : `${fmt(selTank.free)} kg`}</b></div>
                      <div>Low at<b>{Math.round(selTank.cap * 0.2)} kg</b></div>
                      <div>Yesterday<b>{fmt(selTank.s?.yesterday)} kg</b></div>
                    </div>
                    <div className="tk-three">
                      <div>Tally 1<b>{fmt(selTank.s?.t1)}</b></div>
                      <div>Tally 2<b>{fmt(selTank.s?.t2)}</b></div>
                      <div>Today<b>{fmt(selTank.now)}</b></div>
                    </div>
                    {selTank.also && (
                      <div className="tk-also-box">
                        Holds {[selTank.key, ...selTank.also.map((a) => a.key)].map((k, i) => `${i === 0 ? selTank.name.replace(" tank", "") : selTank.also![i - 1].label} ${fmt(stock[k]?.now)} kg`).join(" + ")} — one tank, {selTank.cap} kg.
                      </div>
                    )}
                    {selTank.status === "over" && <div className="tk-warn">Counted more than the tank holds. Check the count or the tank size.</div>}
                    <div className="stk-row">
                      <button className="hub-btn primary" onClick={() => { setSel(null); onCount(selTank.key); }}>✍️ Count this tank</button>
                    </div>
                    <label className="stk-lab" htmlFor="tk-cap">Tank size (kg)</label>
                    <div className="stk-row">
                      <input id="tk-cap" key={selTank.key} className="tk-in" type="number" inputMode="decimal" defaultValue={selTank.cap} onChange={(e) => setCapDraft(e.target.value)} onFocus={(e) => setCapDraft(e.target.value)} />
                      <button className="hub-btn" onClick={() => saveCap(selTank.key)}>Save size</button>
                    </div>
                    {capErr && <div className="tk-warn">{capErr}</div>}
                    <small className="hub-m">The size is saved on this device.</small>
                  </div>
                </div>
              </>
            )}
            {selBarrel && (
              <>
                <div className="tk-ph"><b>{selBarrel.code}</b><span className="tk-chip ok">Waiting to empty</span><button onClick={() => setSel(null)} aria-label="Close">✕</button></div>
                <div className="tk-pb">
                  <Vessel pct={fillPct(selBarrel.estNetKg ?? BARREL.standardKg, BARREL.maxKg)} color="#E9B31D" kind="barrel" big mark={fillPct(BARREL.standardKg, BARREL.maxKg)} />
                  <div className="tk-info">
                    <div className="tk-big"><b>≈ {fmt(selBarrel.estNetKg ?? BARREL.standardKg)}</b> <small>kg of {BARREL.maxKg}</small></div>
                    <div className="tk-three">
                      <div>Product<b>{selBarrel.product}</b></div>
                      <div>Supplier<b>{selBarrel.supplierName}</b></div>
                      <div>Lot<b>{selBarrel.lotNo}</b></div>
                    </div>
                    <small className="hub-m">Standard fill {BARREL.standardKg} kg, up to {BARREL.maxKg} kg. {selBarrel.estNetKg == null ? "Not weighed yet — shown at the standard fill." : "Estimate from the full weight; the real figure is known when the barrel is emptied and weighed."}{selBarrel.tankTarget ? ` Goes into: ${selBarrel.tankTarget}.` : ""}</small>
                    <div className="stk-row"><a className="hub-btn primary" href="/barrels">🛢️ Open barrel register</a></div>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>,
        document.body,
      )}
    </section>
  );
}
