"use client";

// One barrel's record: gross (oil + barrel), tare (empty barrel), net oil, with the
// date, time, scale and person for each weighing — the page a scanned QR opens.
import { useCallback, useEffect, useState } from "react";
import { barrelLink, type RegisterRow } from "@/lib/barrels";
import Barcode from "@/components/barrels/Barcode";
import QrCode from "@/components/barrels/QrCode";
import WeighPanel from "@/components/barrels/WeighPanel";
import { api, BARREL_CHIP, kg, kg1, pad, when, whenFull, type EventRow, type Lot } from "@/components/barrels/shared";

export default function BarrelCard({
  code,
  lots,
  isOwner,
  onBack,
  onSaved,
  onOpenLot,
}: {
  code: string;
  lots: Lot[];
  isOwner: boolean;
  onBack: () => void;
  onSaved: (l: Lot) => void;
  onOpenLot: (id: string) => void;
}) {
  const [row, setRow] = useState<RegisterRow | null>(null);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const j = await api<{ data: RegisterRow[]; events: EventRow[] }>(`/api/barrels/register?code=${encodeURIComponent(code)}`);
      setRow(j.data[0] ?? null);
      setEvents(j.events ?? []);
      setErr(j.data[0] ? null : "No barrel with this label.");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not load.");
    }
  }, [code]);
  useEffect(() => {
    load();
  }, [load]);

  if (err) return <div className="bd-card"><div className="bd-err">{err}</div><button className="bd-btn" onClick={onBack}>← Back</button></div>;
  if (!row) return <div className="bd-m">Loading…</div>;
  const chip = BARREL_CHIP[row.state];
  const link = typeof window !== "undefined" ? barrelLink(window.location.origin, row.code) : row.code;
  const lot = lots.find((l) => l.id === row.lotId);
  const sum = row.grossKg != null && row.emptyKg != null;

  return (
    <>
      <div className="bd-row bd-gap">
        <button className="bd-btn" onClick={onBack}>← Back</button>
        <b className="bd-lotno">Barrel {pad(row.seq)} of {pad(row.barrelsInLot)}</b>
        <span className={`bd-chip ${chip.cls}`}>{chip.en}</span>
      </div>

      <div className="bd-card">
        <div className="bd-cardtop">
          <div>
            <div className="bd-bigcode">{row.code}</div>
            <div className="bd-meta">
              <span><b>{row.supplierName}</b></span>
              <span>{row.product}</span>
              {row.vehicleNo && <span>🚛 {row.vehicleNo}</span>}
              {row.challanNo && <span>Challan {row.challanNo}</span>}
              {row.tankTarget && <span>→ {row.tankTarget}</span>}
              <span className="bd-m">Lot {row.lotNo} · {row.lotDate}</span>
            </div>
          </div>
          <div className="bd-codes">
            <QrCode value={link} moduleSize={3} />
            <Barcode value={row.code} moduleWidth={1.4} height={36} />
          </div>
        </div>

        <div className="bd-eq">
          <div className="bd-eqbox">
            <div className="l">Gross <small>oil + barrel</small></div>
            <div className="v">{kg1(row.grossKg)}<small> kg</small></div>
            <div className="s">{row.grossAt ? whenFull(row.grossAt) : "not weighed"}</div>
            <div className="s">{row.grossAt ? `${row.grossSource === "MANUAL" ? "✋ typed" : row.grossScale || "scale"} · ${row.grossBy ?? ""}` : ""}</div>
          </div>
          <div className="bd-op">−</div>
          <div className="bd-eqbox">
            <div className="l">Tare <small>empty barrel</small></div>
            <div className="v">{kg1(row.emptyKg)}<small> kg</small></div>
            <div className="s">{row.emptyAt ? whenFull(row.emptyAt) : row.state === "FULL" ? `waiting ${row.waitingDays ?? 0} day(s)` : "not weighed"}</div>
            <div className="s">{row.emptyAt ? `${row.emptySource === "MANUAL" ? "✋ typed" : row.emptyScale || "scale"} · ${row.emptyBy ?? ""}` : ""}</div>
          </div>
          <div className="bd-op">=</div>
          <div className={`bd-eqbox net ${sum ? "ok" : ""}`}>
            <div className="l">Net oil</div>
            <div className="v">{sum ? kg1(row.netKg) : "—"}<small> kg</small></div>
            <div className="s">{sum ? "received in this barrel" : row.estNetKg != null ? `≈ ${kg1(row.estNetKg)} kg inside (estimate)` : "after the empty weight"}</div>
          </div>
        </div>
        {row.grossNote && <div className="bd-m small">Full weight note: {row.grossNote}</div>}
        {row.emptyNote && <div className="bd-m small">Empty weight note: {row.emptyNote}</div>}

        {isOwner && row.declaredNetKg != null && (
          <div className="bd-m">
            Supplier says {kg(row.declaredNetKg)} kg{row.diffKg != null ? ` · difference ${row.diffKg > 0 ? "+" : ""}${kg(row.diffKg)} kg` : ""}
          </div>
        )}
        {row.flags.length > 0 && (
          <ul className="bd-flags">
            {row.flags.map((f, i) => (
              <li key={i} className={f.level}>{f.level === "alert" ? "🚨" : "⚠️"} {f.msg}</li>
            ))}
          </ul>
        )}
        <div className="bd-row">
          <a className="bd-btn" href={`/barrels/print?slip=${encodeURIComponent(row.code)}`} target="_blank" rel="noreferrer">🖨️ Print weighment slip</a>
          <a className="bd-btn" href={`/barrels/labels?lot=${encodeURIComponent(row.lotNo)}&seq=${row.seq}`} target="_blank" rel="noreferrer">🏷️ Reprint label</a>
          <button className="bd-btn" onClick={() => onOpenLot(row.lotId)}>Open lot {row.lotNo}</button>
        </div>
      </div>

      {lot && (row.state !== "DONE" || isOwner) && (
        <WeighPanel
          lots={lots}
          isOwner={isOwner}
          presetCode={row.code}
          onSaved={(l) => {
            onSaved(l);
            load();
          }}
        />
      )}
      {!lot && row.state !== "DONE" && (
        <div className="bd-card bd-m">This barrel belongs to a lot that is not open{isOwner ? " — reopen the lot to weigh it" : " — ask the owner"}.</div>
      )}

      {isOwner && events.length > 0 && (
        <div className="bd-card">
          <h3>🔒 History of this barrel</h3>
          <ul className="bd-events">
            {events.map((e) => (
              <li key={e.id}>
                <b>{e.action}</b> · {e.by} · {when(e.at)}
                {e.detail ? <code>{JSON.stringify(e.detail)}</code> : null}
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
