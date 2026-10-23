"use client";

// The board: every barrel the shop owns, where it is, what is in it, and what needs attention.
import { useMemo, useState } from "react";
import { LOCATION_LABEL, fleetCsv, type FleetFlag, type FleetRowForCsv, type Location } from "@/lib/barrelFleet";
import { L, kg, when } from "@/components/barrels/shared";
import { STATUS_CHIP, downloadText, type FBarrel, type FleetList } from "@/components/barrels/fleet/types";

type Filter = "all" | "shop" | "away" | "full" | "empty" | "attention";
const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "shop", label: "In shop" },
  { id: "away", label: "Away" },
  { id: "full", label: "Full" },
  { id: "empty", label: "Empty" },
  { id: "attention", label: "Needs attention" },
];

const worst = (flags: FleetFlag[]) => (flags.some((f) => f.level === "alert") ? "alert" : flags.length ? "warn" : "");

export default function FleetBoard({ list, loading, open, goSetup }: { list: FleetList | null; loading: boolean; open: (code: string) => void; goSetup: () => void }) {
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");

  const rows = useMemo(() => {
    const all = list?.data ?? [];
    const t = q.trim().toLowerCase();
    return all.filter((b) => {
      if (b.condition === "RETIRED") return false;
      if (filter === "shop" && b.location !== "SHOP") return false;
      if (filter === "away" && b.location === "SHOP") return false;
      if (filter === "full" && b.status !== "FULL") return false;
      if (filter === "empty" && b.status === "FULL") return false;
      if (filter === "attention" && !b.flags.length) return false;
      if (t && ![b.code, b.mark, b.holder, b.product].some((x) => x?.toLowerCase().includes(t))) return false;
      return true;
    });
  }, [list, filter, q]);

  if (loading && !list) return <div className="bd-m">Loading…</div>;
  if (!list) return null;
  const s = list.summary;

  if (!list.data.length)
    return (
      <div className="bd-card bd-empty">
        <b>No barrels registered yet.</b>
        <div className="bd-m">{list.isOwner ? "Register your barrels once, print a label for each, then weigh each one empty to set its tare." : "Ask the owner to register the barrels."}</div>
        {list.isOwner && (
          <button className="bd-btn primary big" onClick={goSetup}>
            ➕ Register barrels
          </button>
        )}
      </div>
    );

  const csv = () => downloadText(`barrel-fleet-${new Date().toISOString().slice(0, 10)}.csv`, fleetCsv(list.data as unknown as FleetRowForCsv[], Date.now()));

  return (
    <>
      <div className="bd-kpis">
        <div className="bd-kpi"><div className="l">Barrels</div><div className="v">{s.barrels}</div><div className="s">{s.inShop} in shop · {s.away} away</div></div>
        <div className="bd-kpi g"><div className="l">Full</div><div className="v">{s.full}</div><div className="s">{kg(s.oilKg)} kg oil{s.oilAwayKg ? ` (${kg(s.oilAwayKg)} kg away)` : ""}</div></div>
        <div className="bd-kpi"><div className="l">Empty</div><div className="v">{s.empty}</div><div className="s">{s.noTare ? `${s.noTare} without a tare` : "all have a tare"}</div></div>
        <div className={`bd-kpi ${s.alerts ? "r" : s.warnings ? "o" : ""}`}><div className="l">Needs attention</div><div className="v">{s.alerts + s.warnings}</div><div className="s">{s.alerts ? `${s.alerts} alert(s)` : s.warnings ? `${s.warnings} warning(s)` : "all clear"}</div></div>
      </div>

      <div className="bd-row bd-noprint">
        {FILTERS.map((f) => (
          <button key={f.id} className={`bd-chip${filter === f.id ? " on" : ""}`} onClick={() => setFilter(f.id)}>
            {f.label}
          </button>
        ))}
        <input className="bd-search" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search code, customer, oil…" aria-label="Search barrels" style={{ flex: "1 1 160px" }} />
      </div>
      <div className="bd-row bd-noprint">
        <a className="bd-btn" href="/barrels/fleet/print?register=1" target="_blank" rel="noreferrer">🖨️ Print fleet report</a>
        <a className="bd-btn" href="/barrels/fleet/labels?codes=all" target="_blank" rel="noreferrer">🏷️ Print all labels</a>
        <button className="bd-btn" onClick={csv}>⬇️ Excel (CSV)</button>
      </div>

      {!rows.length && <div className="bd-card bd-empty">No barrel matches.</div>}
      <div className="bd-lots" style={{ marginTop: 10 }}>
        {rows.map((b) => (
          <BarrelTile key={b.id} b={b} open={open} />
        ))}
      </div>
    </>
  );
}

function BarrelTile({ b, open }: { b: FBarrel; open: (code: string) => void }) {
  const tone = worst(b.flags);
  const away = b.location !== "SHOP";
  return (
    <button className="bd-lot" onClick={() => open(b.code)} style={tone === "alert" ? { borderColor: "var(--bd-r)" } : tone === "warn" ? { borderColor: "var(--bd-o)" } : undefined} aria-label={`Open ${b.code}`}>
      <div className="bd-lot-top">
        <b>{b.code}</b>
        {b.condition !== "OK" && <span className="bd-chip r">{b.condition.toLowerCase()}</span>}
        <span className={`bd-chip ${STATUS_CHIP[b.status]?.cls ?? ""}`}>{STATUS_CHIP[b.status]?.en}</span>
      </div>
      <div className="bd-lot-mid">
        {b.status === "FULL" ? (
          <>
            <b>{kg(b.netKg)} kg</b> {b.product}
          </>
        ) : b.status === "EMPTY" ? (
          <span className="bd-m">Empty</span>
        ) : (
          <span className="bd-m">Weigh it empty to set the tare</span>
        )}
      </div>
      <div className="bd-m small">
        {away ? <b>{LOCATION_LABEL[b.location as Location]?.en ?? b.location}{b.holder ? ` · ${b.holder}` : ""}</b> : <L en="In shop" kn="ಅಂಗಡಿಯಲ್ಲಿ" />}
        {away && b.awayDays != null ? ` · ${b.awayDays} day(s)` : ""}
      </div>
      <div className="bd-m small">
        tare {b.tareKg != null ? kg(b.tareKg) : "—"}
        {b.status === "FULL" ? ` · full ${kg(b.grossKg)} (${when(b.grossAt)})` : ""}
        {b.mark ? ` · ${b.mark}` : ""}
      </div>
      {b.flags.length > 0 && (
        <ul className="bd-flags" style={{ marginBottom: 0 }}>
          {b.flags.slice(0, 2).map((f) => (
            <li key={f.code} className={f.level}>{f.msg}</li>
          ))}
          {b.flags.length > 2 && <li className="warn">+{b.flags.length - 2} more</li>}
        </ul>
      )}
    </button>
  );
}
