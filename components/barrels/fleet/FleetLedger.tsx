"use client";

// The ledger: every weighing and movement of the shop's barrels, newest first. Filter by barrel,
// customer / supplier, what happened and dates; print it or take it to Excel.
import { useCallback, useEffect, useMemo, useState } from "react";
import { ACTION_LABEL, LOCATION_LABEL, PURPOSE_LABEL, eventFlags, ledgerCsv, type FleetAction, type Location, type Purpose } from "@/lib/barrelFleet";
import { api, kg, whenFull } from "@/components/barrels/shared";
import { downloadText, type FBarrel, type FEvent } from "@/components/barrels/fleet/types";

export function describe(e: FEvent): string {
  const d = (e.detail ?? {}) as Record<string, unknown>;
  const place = (l: string | null) => (l ? LOCATION_LABEL[l as Location]?.en ?? l : "");
  switch (e.action) {
    case "REGISTER":
      return "Barrel registered";
    case "GROSS":
      return `Full: ${kg(e.kg)} kg on the scale − ${kg(e.tareKg)} tare = ${kg(e.netKg)} kg ${e.product ?? "oil"}${typeof d.diffKg === "number" ? ` (${d.diffKg > 0 ? "+" : ""}${d.diffKg} kg since last full weight)` : ""}`;
    case "EMPTY":
      return d.setsTare ? `Empty ${kg(e.kg)} kg → set as tare` : `Empty ${kg(e.kg)} kg${typeof d.driftKg === "number" ? ` (${d.driftKg > 0 ? "+" : ""}${d.driftKg} kg from tare)` : ""}${e.netKg != null ? ` · ${kg(e.netKg)} kg oil poured out` : ""}`;
    case "MOVE":
      return `${place(e.fromLoc)} → ${place(e.toLoc)}${e.party ? ` · ${e.party}` : ""}${e.netKg != null ? ` · ${kg(e.netKg)} kg ${e.product ?? "oil"}` : e.toLoc !== "SHOP" ? " · empty" : ""}${e.purpose ? ` · ${PURPOSE_LABEL[e.purpose as Purpose] ?? e.purpose}` : ""}${e.vehicleNo ? ` · ${e.vehicleNo}` : ""}${e.ref ? ` · ref ${e.ref}` : ""}`;
    case "EDIT": {
      const after = (d.after ?? {}) as Record<string, unknown>;
      return `Changed: ${Object.entries(after).map(([k, v]) => `${k} → ${String(v)}`).join(", ") || "details"}`;
    }
    default:
      return e.action;
  }
}

export default function FleetLedger({ barrels, presetCode }: { barrels: FBarrel[]; presetCode?: string | null }) {
  const [code, setCode] = useState(presetCode ?? "");
  const [party, setParty] = useState("");
  const [action, setAction] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [rows, setRows] = useState<FEvent[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [truncated, setTruncated] = useState(false);

  const load = useCallback(async () => {
    const p = new URLSearchParams();
    if (code) p.set("code", code);
    if (party.trim()) p.set("party", party.trim());
    if (action) p.set("action", action);
    if (from) p.set("from", from);
    if (to) p.set("to", to);
    try {
      const j = await api<{ data: FEvent[]; truncated: boolean }>(`/api/barrel-fleet/events?${p.toString()}`);
      setRows(j.data);
      setTruncated(j.truncated);
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not load.");
    }
  }, [code, party, action, from, to]);

  useEffect(() => {
    const t = setTimeout(load, party ? 300 : 0); // wait while typing a name
    return () => clearTimeout(t);
  }, [load, party]);

  const oilOut = useMemo(() => {
    const out = (rows ?? []).filter((r) => r.action === "MOVE" && r.toLoc && r.toLoc !== "SHOP" && r.netKg != null);
    return { n: out.length, kg: Math.round(out.reduce((s, r) => s + (r.netKg ?? 0), 0) * 10) / 10 };
  }, [rows]);

  const csv = () => rows && downloadText(`barrel-ledger-${new Date().toISOString().slice(0, 10)}.csv`, ledgerCsv(rows));

  return (
    <div className="bd-card">
      <div className="bd-form bd-noprint">
        <label>
          Barrel
          <select value={code} onChange={(e) => setCode(e.target.value)}>
            <option value="">All barrels</option>
            {barrels.map((b) => (
              <option key={b.code} value={b.code}>{b.code}</option>
            ))}
          </select>
        </label>
        <label>
          Customer / supplier
          <input value={party} onChange={(e) => setParty(e.target.value)} placeholder="part of the name" />
        </label>
        <label>
          What happened
          <select value={action} onChange={(e) => setAction(e.target.value)}>
            <option value="">Everything</option>
            {(Object.keys(ACTION_LABEL) as FleetAction[]).map((a) => (
              <option key={a} value={a}>{ACTION_LABEL[a]}</option>
            ))}
          </select>
        </label>
        <label>
          From
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label>
          To
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
      </div>
      <div className="bd-row bd-noprint">
        <button className="bd-btn" onClick={() => window.print()} disabled={!rows?.length}>🖨️ Print</button>
        <button className="bd-btn" onClick={csv} disabled={!rows?.length}>⬇️ Excel (CSV)</button>
        <span className="bd-m small">{rows ? `${rows.length} row(s)` : ""}{truncated ? " · showing the newest 500, narrow the dates to see older ones" : ""}</span>
      </div>
      {err && <div className="bd-err">{err}</div>}
      {rows && !rows.length && <div className="bd-empty">Nothing recorded for this filter.</div>}
      {rows && rows.length > 0 && (
        <div className="bd-tablewrap">
          <table className="bd-table">
            <thead>
              <tr>
                <th>When</th>
                <th>Barrel</th>
                <th>What</th>
                <th>By</th>
                <th className="bd-noprint">Slip</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((e) => {
                const f = eventFlags(e);
                const tone = f.some((x) => x.level === "alert") ? "alert" : f.length ? "warn" : "";
                return (
                  <tr key={e.id} className={tone}>
                    <td>{whenFull(e.at)}</td>
                    <td><b>{e.barrelCode}</b></td>
                    <td>
                      <b>{ACTION_LABEL[e.action as FleetAction] ?? e.action}</b> · {describe(e)}
                      {e.source === "MANUAL" && <span className="bd-chip o" style={{ marginLeft: 6 }}>typed</span>}
                      {e.note && <div className="bd-m small">“{e.note}”</div>}
                      {f.filter((x) => x.code !== "MANUAL").map((x) => (
                        <div key={x.code} className="bd-m small" style={{ color: x.level === "alert" ? "var(--bd-r)" : "var(--bd-o)" }}>⚠ {x.msg}</div>
                      ))}
                    </td>
                    <td>{e.by}</td>
                    <td className="bd-noprint">
                      {(e.action === "GROSS" || e.action === "EMPTY" || e.action === "MOVE") && (
                        <a className="bd-linkbtn" href={`/barrels/fleet/print?slip=${encodeURIComponent(e.id)}`} target="_blank" rel="noreferrer">slip</a>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            {oilOut.n > 0 && (
              <tfoot>
                <tr>
                  <td colSpan={5}>Oil sent out in these rows: {oilOut.n} barrel trip(s), {oilOut.kg} kg</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}
    </div>
  );
}
