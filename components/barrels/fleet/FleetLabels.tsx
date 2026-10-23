"use client";

// Permanent labels for the shop's own barrels: /barrels/fleet/labels?codes=all|BRL-01,BRL-02&size=…&type=tare|id
// Each label has a Code 128 barcode (scanner gun) and a QR code (phone camera, opens the barrel's
// record), the barrel's code and mark, its registered tare and the most oil it may take. The tare
// is printed so it can be read at the weighing platform even when the scale link is down; if the
// owner changes a tare later, reprint that barrel's label.
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import Barcode from "@/components/barrels/Barcode";
import QrCode from "@/components/barrels/QrCode";
import { findFleetCode, fleetLink } from "@/lib/barrelFleet";
import { LABEL_SIZES, labelLayout, labelSize, pageCss, type PaperSize } from "@/lib/printSizes";
import { PrinterPanel, SizePicker, useSavedPrint } from "@/components/barrels/PrintKit";
import { api, kg } from "@/components/barrels/shared";
import type { FBarrel } from "@/components/barrels/fleet/types";

type Kind = "tare" | "id";
const stamp = (t: string | null) => (t ? new Date(t).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "2-digit", timeZone: "Asia/Kolkata" }) : "");

export default function FleetLabels() {
  const sp = useSearchParams();
  const [size, setSizeState] = useState<PaperSize>(labelSize(sp.get("size")));
  const [saved, save] = useSavedPrint();
  const [test, setTest] = useState(false);
  const [kind, setKind] = useState<Kind>(sp.get("type") === "id" ? "id" : "tare");
  const [barrels, setBarrels] = useState<FBarrel[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [only, setOnly] = useState<string[] | null>(null);
  const origin = typeof window !== "undefined" ? window.location.origin : "";

  const setSize = (x: PaperSize) => {
    setSizeState(x);
    save({ label: x.id });
  };
  // no size in the link: start with the size used last time on this device
  useEffect(() => {
    if (!sp.get("size") && saved.label) setSizeState(labelSize(saved.label));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saved.label]);
  const lay = labelLayout(size);
  const vars = { "--lw": size.w, "--lh": size.h ?? 30, "--sc": lay.sc, "--barh": lay.barH, "--qr": lay.qr } as React.CSSProperties;

  useEffect(() => {
    api<{ data: FBarrel[] }>("/api/barrel-fleet")
      .then((j) => setBarrels(j.data))
      .catch((e) => setErr(e instanceof Error ? e.message : "Could not load the barrels."));
  }, []);

  useEffect(() => {
    const style = document.createElement("style");
    style.textContent = pageCss(size, "label");
    document.head.appendChild(style);
    return () => style.remove();
  }, [size]);

  const wanted = useMemo(() => {
    const raw = sp.get("codes") || "all";
    if (raw === "all") return null;
    return raw.split(",").map((c) => findFleetCode(c)?.code).filter((c): c is string => !!c);
  }, [sp]);

  if (err) return <div className="bd-wrap"><div className="bd-err">{err}</div></div>;
  if (!barrels) return <div className="bd-wrap"><div className="bd-m">Loading…</div></div>;

  const pick = only ?? wanted;
  const list = barrels.filter((b) => b.condition !== "RETIRED" && (!pick || pick.includes(b.code)));
  const showTare = kind === "tare";
  const missingTare = showTare ? list.filter((b) => b.tareKg == null).length : 0;

  return (
    <div className="bd-labelpage">
      <div className="bd-noprint bd-labelbar">
        <b>🏷️ Barrel labels (permanent)</b>
        <span className="bd-m"> · {list.length} label(s)</span>
        <div className="bd-row">
          <button className={`bd-chip${kind === "tare" ? " on" : ""}`} onClick={() => setKind("tare")}>With tare weight</button>
          <button className={`bd-chip${kind === "id" ? " on" : ""}`} onClick={() => setKind("id")}>Code only</button>
        </div>
        <SizePicker options={LABEL_SIZES} value={size} onPick={setSize} />
        <div className="bd-row">
          <button className="bd-btn primary" onClick={() => window.print()} disabled={!list.length}>🖨️ Print {list.length} label(s)</button>
          {only && <button className="bd-btn" onClick={() => setOnly(null)}>Show all</button>}
          {test && <button className="bd-btn" onClick={() => setTest(false)}>Back to the real labels</button>}
        </div>
        <PrinterPanel size={size} kind="label" saved={saved} onSave={save} onSize={setSize} onTest={() => { setTest(true); window.scrollTo({ top: 0 }); }} />
        {missingTare > 0 && (
          <div className="bd-err">{missingTare} barrel(s) have no tare yet, so their label shows a blank line. Weigh each one empty first, then print the labels (or write the tare with a marker).</div>
        )}
        <div className="bd-m small">
          Barcode for a scanner gun, QR for any phone camera (it opens the barrel&apos;s record). Stick one label on the side of each barrel (not the lid) and cover it with clear tape; oil and handling wear paper labels. These labels are permanent: the same barrel keeps its code for life.
          {showTare && " The tare is printed on the label. If the owner changes a barrel's tare, reprint that label."} To reprint one barrel, tap it:{" "}
          {barrels.filter((b) => b.condition !== "RETIRED").map((b) => (
            <button key={b.code} className="bd-linkbtn" onClick={() => setOnly([b.code])}>{b.code.replace("BRL-", "")}</button>
          ))}
        </div>
      </div>

      <div className={`bd-labels ${size.cls}${size.cls === "gen" ? ` ${lay.compact ? "compact" : ""} ${lay.roomy ? "roomy" : ""}` : ""}`} style={vars}>
        {test && (
          <div className="bd-label bd-test">
            <div className="bd-testmark">TEST · {size.name}<br />{size.h ? `${size.w} × ${size.h} mm` : `${size.w} mm`}</div>
            <Barcode className="bd-lbar" value="BRL-00" moduleWidth={2} height={40} fill={size.cls === "gen"} />
            <div className="bd-lbottom"><div className="bd-ltext"><div className="bd-lcode">BRL-00</div></div><QrCode className="bd-lqr" value="TEST" moduleSize={3} /></div>
          </div>
        )}
        {!test &&
          list.map((b) => (
            <div className={`bd-label ${showTare ? "wt" : ""}`} key={b.id}>
              <div className="bd-lhead">
                <b>MAHADEV TRADERS</b>
                <span>OUR BARREL</span>
              </div>
              {showTare && (
                <div className="bd-lband">
                  TARE (EMPTY) · {b.tareKg != null ? <b>{kg(b.tareKg)} kg</b> : <span>________ kg</span>}
                  {b.tareAt && <small> {stamp(b.tareAt)}</small>}
                </div>
              )}
              <Barcode className="bd-lbar" value={b.code} moduleWidth={2} height={size.id === "50x30" ? (showTare ? 44 : 66) : showTare ? 50 : 76} fill={size.cls === "gen"} />
              <div className="bd-lbottom">
                <div className="bd-ltext">
                  <div className="bd-lcode">{b.code}</div>
                  {b.mark && <div className="bd-lline"><span>{b.mark}</span></div>}
                  <div className="bd-lline small"><span>Max {kg(b.capacityKg)} kg oil</span></div>
                </div>
                <QrCode className="bd-lqr" value={fleetLink(origin, b.code)} moduleSize={3} />
              </div>
            </div>
          ))}
      </div>
    </div>
  );
}
