"use client";

// The barrel register: every barrel ever received, one row each — gross (oil +
// barrel), tare (empty barrel), net oil, with date and time of each weighing.
// Filter by what is waiting, by supplier / lot / vehicle / code, or by date; print it
// or download it for Excel.
import { useCallback, useEffect, useState } from "react";
import { registerCsv, type RegisterRow, type RegisterTotals } from "@/lib/barrels";
import { api, BARREL_CHIP, kg, kg1, L, when } from "@/components/barrels/shared";
import { businessDate } from "@/lib/register";
import WeightCell from "@/components/barrels/WeightCell";

type Status = "all" | "waiting" | "done" | "new";
const TABS: { id: Status; en: string; kn: string }[] = [
  { id: "waiting", en: "Waiting to empty", kn: "ಖಾಲಿ ಮಾಡಲು ಬಾಕಿ" },
  { id: "done", en: "Emptied", kn: "ಖಾಲಿ ಆಗಿದೆ" },
  { id: "new", en: "Not weighed", kn: "ತೂಕ ಆಗಿಲ್ಲ" },
  { id: "all", en: "All", kn: "ಎಲ್ಲಾ" },
];

const dayMs = 86_400_000;
const shift = (d: string, days: number) => businessDate(new Date(`${d}T12:00:00+05:30`).getTime() + days * dayMs);

export default function BarrelRegister({ initialStatus = "all", open }: { initialStatus?: Status; open: (code: string) => void }) {
  const today = businessDate(Date.now());
  const [status, setStatus] = useState<Status>(initialStatus);
  const [q, setQ] = useState("");
  const [range, setRange] = useState<"30" | "90" | "all" | "custom">("90");
  const [from, setFrom] = useState(shift(today, -90));
  const [to, setTo] = useState(today);
  const [rows, setRows] = useState<RegisterRow[]>([]);
  const [totals, setTotals] = useState<RegisterTotals | null>(null);
  const [isOwner, setIsOwner] = useState(false);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const pickRange = (r: typeof range) => {
    setRange(r);
    if (r === "30") setFrom(shift(today, -30));
    if (r === "90") setFrom(shift(today, -90));
    if (r !== "custom") setTo(today);
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const sp = new URLSearchParams({ status });
      if (q.trim()) sp.set("q", q.trim());
      // "Waiting" ignores dates: a barrel can sit full for weeks and must never drop off the list.
      if (range !== "all" && status !== "waiting") {
        sp.set("from", from);
        sp.set("to", to);
      }
      const j = await api<{ data: RegisterRow[]; totals: RegisterTotals; isOwner: boolean }>(`/api/barrels/register?${sp}`);
      setRows(j.data);
      setTotals(j.totals);
      setIsOwner(j.isOwner);
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not load.");
    } finally {
      setLoading(false);
    }
  }, [status, q, range, from, to]);

  useEffect(() => {
    const t = setTimeout(load, q ? 300 : 0); // small pause while typing
    return () => clearTimeout(t);
  }, [load, q]);

  const download = () => {
    const blob = new Blob([registerCsv(rows, isOwner)], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `barrel-register-${today}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };

  return (
    <>
      <div className="bd-card bd-noprint">
        <div className="bd-steps bd-tabs" role="tablist">
          {TABS.map((t) => (
            <button key={t.id} role="tab" aria-selected={status === t.id} className={status === t.id ? "on" : ""} onClick={() => setStatus(t.id)}>
              <L en={t.en} kn={t.kn} />
            </button>
          ))}
        </div>
        <div className="bd-row">
          <input className="bd-code bd-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search barrel code, supplier, vehicle, challan…" aria-label="Search the register" />
        </div>
        {status !== "waiting" && (
          <div className="bd-row">
            {(["30", "90", "all", "custom"] as const).map((r) => (
              <button key={r} className={`bd-chip${range === r ? " on" : ""}`} onClick={() => pickRange(r)}>
                {r === "30" ? "Last 30 days" : r === "90" ? "Last 90 days" : r === "all" ? "All time" : "Pick dates"}
              </button>
            ))}
            {range === "custom" && (
              <>
                <input type="date" className="bd-dt" value={from} max={to} onChange={(e) => setFrom(e.target.value)} aria-label="From date" />
                <span className="bd-m">to</span>
                <input type="date" className="bd-dt" value={to} min={from} onChange={(e) => setTo(e.target.value)} aria-label="To date" />
              </>
            )}
          </div>
        )}
        <div className="bd-row">
          <button className="bd-btn" onClick={() => window.print()} disabled={!rows.length}>🖨️ Print</button>
          <button className="bd-btn" onClick={download} disabled={!rows.length}>⬇️ Excel (CSV)</button>
        </div>
      </div>

      {err && <div className="bd-err">{err}</div>}
      {loading && !rows.length && <div className="bd-m">Loading…</div>}

      {totals && (
        <div className="bd-kpis bd-printkpis">
          <div className="bd-kpi"><div className="l">Barrels shown</div><div className="v">{totals.barrels}</div></div>
          <div className="bd-kpi o"><div className="l">Full, waiting</div><div className="v">{totals.waiting}</div>{totals.waitingOldestDays != null && <div className="s">oldest {totals.waitingOldestDays} day(s)</div>}</div>
          <div className="bd-kpi"><div className="l">Gross (emptied)</div><div className="v">{kg(totals.grossKg)} kg</div></div>
          <div className="bd-kpi"><div className="l">Tare (empty barrels)</div><div className="v">{kg(totals.tareKg)} kg</div></div>
          <div className="bd-kpi g"><div className="l">Net oil received</div><div className="v">{kg(totals.netKg)} kg</div></div>
        </div>
      )}
      {totals && totals.waiting > 0 && totals.waitingEstKg > 0 && (
        <div className="bd-m small">≈ {kg(totals.waitingEstKg)} kg of oil is still inside the waiting barrels (an estimate: full weight minus a typical empty barrel; the real figure comes when each is emptied and weighed).</div>
      )}

      {!loading && !rows.length && !err && <div className="bd-card bd-empty">No barrels match.</div>}
      {rows.length > 0 && (
        <div className="bd-card">
          <div className="bd-tablewrap">
            <table className="bd-table bd-register">
              <thead>
                <tr>
                  <th>Barrel</th>
                  <th>Supplier · oil</th>
                  <th>Gross kg<small> oil+barrel</small></th>
                  <th>Tare kg<small> empty barrel</small></th>
                  <th>Net oil kg</th>
                  {isOwner && <th>Supplier kg</th>}
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const chip = BARREL_CHIP[r.state];
                  const alert = r.flags.some((f) => f.level === "alert");
                  return (
                    <tr key={r.code} className={alert ? "alert" : r.flags.length ? "warn" : ""} onClick={() => open(r.code)} style={{ cursor: "pointer" }}>
                      <td>
                        <b>{r.code}</b>
                        <div className="bd-m tiny">Lot {r.lotNo} · {r.lotDate.split("-").reverse().join("-")}</div>
                        <div className="bd-m tiny bd-onlymobile">{r.supplierName}</div>
                      </td>
                      <td>
                        {r.supplierName}
                        <div className="bd-m tiny">{r.product}{r.vehicleNo ? ` · ${r.vehicleNo}` : ""}</div>
                      </td>
                      <td className="num">
                        {r.grossKg == null && r.lotStatus === "OPEN" ? (
                          <WeightCell code={r.code} phase="GROSS" onDone={load} />
                        ) : (
                          <>
                            {kg1(r.grossKg)}
                            {r.grossSource === "MANUAL" && isOwner && <span title={r.grossNote || "typed"}> ✋</span>}
                            <div className="bd-m tiny">{when(r.grossAt)}</div>
                            {r.grossKg != null && <a className="bd-linkbtn tiny bd-noprint" href={`/barrels/labels?lot=${encodeURIComponent(r.lotNo)}&seq=${r.seq}&type=full`} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>🏷️ label</a>}
                          </>
                        )}
                      </td>
                      <td className="num">
                        {r.grossKg != null && r.emptyKg == null && r.lotStatus === "OPEN" ? (
                          <WeightCell code={r.code} phase="EMPTY" onDone={load} />
                        ) : (
                          <>
                            {kg1(r.emptyKg)}
                            {r.emptySource === "MANUAL" && isOwner && <span title={r.emptyNote || "typed"}> ✋</span>}
                            <div className="bd-m tiny">{when(r.emptyAt)}</div>
                            {r.emptyKg != null && <a className="bd-linkbtn tiny bd-noprint" href={`/barrels/labels?lot=${encodeURIComponent(r.lotNo)}&seq=${r.seq}&type=empty`} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>🏷️ label</a>}
                          </>
                        )}
                      </td>
                      <td className="num">
                        <b>{r.state === "DONE" ? kg1(r.netKg) : r.estNetKg != null ? `≈ ${kg1(r.estNetKg)}` : "—"}</b>{r.state === "DONE" && <a className="bd-linkbtn tiny bd-noprint" style={{ display: "block" }} href={`/barrels/labels?lot=${encodeURIComponent(r.lotNo)}&seq=${r.seq}&type=sum`} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>🏷️ all-in-one label</a>}
                        {r.state !== "DONE" && r.estNetKg != null && <div className="bd-m tiny">estimate</div>}
                      </td>
                      {isOwner && (
                        <td className="num">
                          {kg(r.declaredNetKg)}
                          {r.diffKg != null && <div className={`bd-m tiny ${Math.abs(r.diffKg) > 1 ? "bd-bad" : ""}`}>{r.diffKg > 0 ? "+" : ""}{kg(r.diffKg)}</div>}
                        </td>
                      )}
                      <td>
                        <span className={`bd-chip ${chip.cls}`}>{chip.en}</span>
                        {r.waitingDays != null && <div className="bd-m tiny">{r.waitingDays} day(s)</div>}
                        {r.flags.length > 0 && <div className="tiny">⚠ {r.flags.length}</div>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              {totals && (
                <tfoot>
                  <tr>
                    <td colSpan={2}>Total (emptied barrels)</td>
                    <td className="num">{kg(totals.grossKg)}</td>
                    <td className="num">{kg(totals.tareKg)}</td>
                    <td className="num"><b>{kg(totals.netKg)}</b></td>
                    <td colSpan={isOwner ? 2 : 1} />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
          <div className="bd-m small">Net = gross − tare. Type a weight straight into an empty Gross / Tare box and tap Save. Tap a row for the full record, slip and QR.</div>
        </div>
      )}
    </>
  );
}
