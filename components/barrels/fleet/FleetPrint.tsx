"use client";

// Printouts for the shop's own barrels:
//   /barrels/fleet/print?slip=EVENTID   a slip for one weighing or trip (full, empty, sent out, came back)
//   /barrels/fleet/print?register=1     the fleet report: every barrel, where it is, what is in it
// Every slip carries a Code 128 barcode (scanner guns) and a QR code (any phone camera) of the barrel.
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Barcode from "@/components/barrels/Barcode";
import QrCode from "@/components/barrels/QrCode";
import { ACTION_LABEL, LOCATION_LABEL, PURPOSE_LABEL, fleetLink, type FleetAction, type Location, type Purpose } from "@/lib/barrelFleet";
import { SLIP_SIZES, pageCss, slipLayout, slipSize, type PaperSize } from "@/lib/printSizes";
import { PrinterPanel, SizePicker, useSavedPrint } from "@/components/barrels/PrintKit";
import { api, kg1, whenFull } from "@/components/barrels/shared";
import type { FBarrel, FEvent, FleetList } from "@/components/barrels/fleet/types";

const COMPANY = "MAHADEV TRADERS";
const place = (l: string | null) => (l ? LOCATION_LABEL[l as Location]?.en ?? l : "");

export default function FleetPrint() {
  const sp = useSearchParams();
  const slipId = sp.get("slip");
  const isReport = !!sp.get("register");
  const [size, setSizeState] = useState<PaperSize>(slipSize(sp.get("size")));
  const [saved, save] = useSavedPrint();
  const setSize = (x: PaperSize) => {
    setSizeState(x);
    save({ slip: x.id });
  };
  useEffect(() => {
    if (!sp.get("size") && saved.slip) setSizeState(slipSize(saved.slip));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saved.slip]);
  const lay = slipLayout(size);
  const vars = { "--sw": lay.inner, "--ss": lay.ss, "--sh": lay.innerH ?? 0 } as React.CSSProperties;

  const [event, setEvent] = useState<{ e: FEvent; b: FBarrel | null } | null>(null);
  const [fleet, setFleet] = useState<FleetList | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const printedAt = whenFull(new Date().toISOString());

  useEffect(() => {
    const go = async () => {
      try {
        if (slipId) {
          const j = await api<{ data: FEvent; barrel: FBarrel | null }>(`/api/barrel-fleet/events?id=${encodeURIComponent(slipId)}`);
          setEvent({ e: j.data, b: j.barrel });
        } else if (isReport) {
          setFleet(await api<FleetList>("/api/barrel-fleet"));
        } else setErr("Nothing to print.");
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Could not load.");
      }
    };
    go();
  }, [slipId, isReport]);

  useEffect(() => {
    const style = document.createElement("style");
    style.textContent = isReport ? "@page { size: A4; margin: 12mm }" : pageCss(size, "slip");
    document.head.appendChild(style);
    return () => style.remove();
  }, [size, isReport]);

  if (err) return <div className="bd-wrap"><div className="bd-err">{err}</div></div>;
  if (!event && !fleet) return <div className="bd-wrap"><div className="bd-m">Loading…</div></div>;

  return (
    <div className="bd-printpage">
      <div className="bd-noprint bd-labelbar">
        <b>{isReport ? "📄 Barrel fleet report" : "🧾 Barrel slip"}</b>
        {!isReport && <SizePicker options={SLIP_SIZES} value={size} onPick={setSize} roll />}
        <div className="bd-row">
          <button className="bd-btn primary" onClick={() => window.print()}>🖨️ Print</button>
        </div>
        {!isReport && <PrinterPanel size={size} kind="slip" saved={saved} onSave={save} onSize={setSize} />}
        <div className="bd-m small">
          {isReport ? "Print on A4. It shows where every barrel is right now and how much oil is in it." : "Give one copy to the driver or customer with the barrel; keep one in the file."}
        </div>
      </div>

      {isReport && fleet ? (
        <Report fleet={fleet} origin={origin} printedAt={printedAt} />
      ) : event ? (
        <div className={`bd-slips ${size.cls}${size.cls === "gen" ? `${lay.short ? " short" : ""}${lay.fixed ? " fixed" : ""}` : ""}`} style={vars}>
          <Slip e={event.e} b={event.b} origin={origin} printedAt={printedAt} />
        </div>
      ) : null}
    </div>
  );
}

function Slip({ e, b, origin, printedAt }: { e: FEvent; b: FBarrel | null; origin: string; printedAt: string }) {
  const d = (e.detail ?? {}) as Record<string, unknown>;
  const isMove = e.action === "MOVE";
  const showWeights = e.action === "GROSS" || e.action === "EMPTY" || (isMove && e.netKg != null);
  const title =
    e.action === "GROSS" ? "Full barrel weight" : e.action === "EMPTY" ? (d.setsTare ? "Empty weight (tare set)" : "Empty barrel weight") : isMove ? `${place(e.fromLoc)} → ${place(e.toLoc)}` : ACTION_LABEL[e.action as FleetAction] ?? e.action;
  const full = e.action === "GROSS" || (isMove && e.netKg != null);
  const grossShown = e.action === "GROSS" ? e.kg : isMove ? (b?.grossKg ?? (e.netKg != null && e.tareKg != null ? e.netKg + e.tareKg : null)) : null;
  return (
    <div className="bd-slip">
      <div className="bd-sh">
        <b>{COMPANY}</b>
        <span>{title}</span>
      </div>
      <div className="bd-scodes">
        <Barcode value={e.barrelCode} moduleWidth={2} height={70} />
        <QrCode className="bd-sqr" value={fleetLink(origin, e.barrelCode)} moduleSize={3} />
      </div>
      <div className="bd-sbig">{e.barrelCode}</div>
      <table className="bd-sinfo">
        <tbody>
          <tr><td>Date / time</td><td>{whenFull(e.at)}</td></tr>
          {b?.mark && <tr><td>Barrel mark</td><td>{b.mark}</td></tr>}
          {e.product && <tr><td>Oil</td><td>{e.product}</td></tr>}
          {isMove && <tr><td>From → To</td><td>{place(e.fromLoc)} → {place(e.toLoc)}</td></tr>}
          {e.party && <tr><td>{e.toLoc === "SHOP" ? "Brought by / from" : "Party"}</td><td>{e.party}</td></tr>}
          {e.vehicleNo && <tr><td>Vehicle</td><td>{e.vehicleNo}</td></tr>}
          {e.purpose && <tr><td>Purpose</td><td>{PURPOSE_LABEL[e.purpose as Purpose] ?? e.purpose}</td></tr>}
          {e.ref && <tr><td>Bill / ref</td><td>{e.ref}</td></tr>}
          {isMove && e.netKg == null && e.toLoc !== "SHOP" && <tr><td>Contents</td><td>Empty barrel</td></tr>}
        </tbody>
      </table>
      {showWeights && (
        <table className="bd-sw">
          <tbody>
            {e.action === "EMPTY" ? (
              <tr>
                <td><b>{d.setsTare ? "Tare" : "Empty"}</b><small>empty barrel</small></td>
                <td className="n">{kg1(e.kg)} kg</td>
              </tr>
            ) : (
              <>
                <tr>
                  <td><b>Gross</b><small>oil + barrel</small></td>
                  <td className="n">{kg1(grossShown)} kg</td>
                </tr>
                <tr>
                  <td><b>Tare</b><small>empty barrel</small></td>
                  <td className="n">{kg1(e.tareKg)} kg</td>
                </tr>
              </>
            )}
            {full && (
              <tr className="net">
                <td><b>NET OIL</b></td>
                <td className="n">{kg1(e.netKg)} kg</td>
              </tr>
            )}
            {e.action === "EMPTY" && !d.setsTare && e.netKg != null && (
              <tr className="net">
                <td><b>Oil poured out</b></td>
                <td className="n">{kg1(e.netKg)} kg</td>
              </tr>
            )}
          </tbody>
        </table>
      )}
      {full && e.tareKg != null && grossShown != null && e.netKg != null && <div className="bd-seq">{kg1(grossShown)} − {kg1(e.tareKg)} = {kg1(e.netKg)} kg</div>}
      <div className="bd-sfoot" style={{ textAlign: "left" }}>
        {e.source === "MANUAL" ? "Weight typed by hand" : e.scale ? `Scale: ${e.scale}` : e.kg != null ? "Scale weight" : ""}
        {e.by ? ` · by ${e.by}` : ""}
        {e.note ? ` · ${e.note}` : ""}
      </div>
      <div className="bd-sign">
        <span>{isMove && e.toLoc !== "SHOP" ? "Received by (sign)" : "Weighed by"}</span>
        <span>{isMove ? "Sent by" : "Checked by"}</span>
      </div>
      <div className="bd-sfoot">Printed {printedAt}</div>
    </div>
  );
}

function Report({ fleet, origin, printedAt }: { fleet: FleetList; origin: string; printedAt: string }) {
  const rows = fleet.data.filter((b) => b.condition !== "RETIRED");
  const s = fleet.summary;
  return (
    <div className="bd-report">
      <div className="bd-rhead">
        <div>
          <div className="bd-rco">{COMPANY}</div>
          <h2>Barrel fleet report</h2>
          <table className="bd-sinfo">
            <tbody>
              <tr><td>As on</td><td>{printedAt}</td></tr>
              <tr><td>Barrels</td><td><b>{s.barrels}</b> · {s.inShop} in shop · {s.away} away</td></tr>
              <tr><td>Oil in barrels</td><td><b>{kg1(s.oilKg)} kg</b> in {s.full} full barrel(s){s.oilAwayKg ? ` · ${kg1(s.oilAwayKg)} kg away from the shop` : ""}</td></tr>
              <tr><td>Empty</td><td>{s.empty}{s.noTare ? ` · ${s.noTare} without a tare` : ""}</td></tr>
            </tbody>
          </table>
        </div>
        <div className="bd-rqr">
          <QrCode value={`${origin}/barrels/fleet`} moduleSize={3} />
          <div className="tiny">/barrels/fleet</div>
        </div>
      </div>

      <table className="bd-rtable">
        <thead>
          <tr>
            <th>Barrel</th>
            <th>Mark</th>
            <th>Where</th>
            <th>With</th>
            <th>Days</th>
            <th>Contents</th>
            <th>Tare kg</th>
            <th>Gross kg</th>
            <th>Net oil kg</th>
            <th>Notes</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((b) => (
            <tr key={b.id}>
              <td><b>{b.code}</b></td>
              <td>{b.mark ?? ""}</td>
              <td>{place(b.location)}</td>
              <td>{b.holder ?? ""}</td>
              <td className="n">{b.location !== "SHOP" && b.awayDays != null ? b.awayDays : ""}</td>
              <td>{b.status === "FULL" ? b.product ?? "Oil" : b.status === "EMPTY" ? "Empty" : "Not weighed"}</td>
              <td className="n">{b.tareKg != null ? kg1(b.tareKg) : "—"}</td>
              <td className="n">{b.status === "FULL" ? kg1(b.grossKg) : ""}</td>
              <td className="n"><b>{b.status === "FULL" ? kg1(b.netKg) : ""}</b></td>
              <td>{[b.condition !== "OK" ? b.condition : "", ...b.flags.filter((f) => f.level === "alert").map((f) => f.msg)].filter(Boolean).join(" · ")}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={8}>Total oil in {s.full} full barrel(s)</td>
            <td className="n"><b>{kg1(s.oilKg)}</b></td>
            <td />
          </tr>
        </tfoot>
      </table>
      <div className="tiny">Net oil = scale weight − the barrel&apos;s registered tare. Oil figures are as of the last full weighing of each barrel; a barrel that has been sent out is counted as it left.</div>
      <div className="bd-sign wide">
        <span>Counted by</span>
        <span>Checked by</span>
        <span>Owner</span>
      </div>
      <div className="bd-sfoot">Printed {printedAt}</div>
    </div>
  );
}
