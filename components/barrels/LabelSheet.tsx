"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Barcode from "@/components/barrels/Barcode";
import QrCode from "@/components/barrels/QrCode";
import { barrelLink, type Phase } from "@/lib/barrels";
import { LABEL_SIZES, labelLayout, labelSize, pageCss, type PaperSize } from "@/lib/printSizes";
import { PrinterPanel, SizePicker, useSavedPrint } from "@/components/barrels/PrintKit";
import PrintCenter from "@/components/barrels/PrintCenter";

type Kind = "id" | "full" | "empty" | "both" | "sum";
const KIND_LABEL: Record<Kind, string> = { id: "Barrel ID label", full: "FULL-weight label", empty: "EMPTY-weight label", both: "FULL + EMPTY (2 labels)", sum: "FULL + EMPTY + NET (1 label)" };
const kg = (n: number | null) => (n == null ? "____" : String(Math.round(n * 100) / 100));
const stamp = (t: string | null) =>
  t ? new Date(t).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" }) : "";

interface Lot {
  id: string;
  lotNo: string;
  date: string;
  supplierName: string;
  product: string;
  vehicleNo: string | null;
  barrels: { id: string; seq: number; code: string; supplierMark: string | null; grossKg: number | null; grossAt: string | null; emptyKg: number | null; emptyAt: string | null }[];
}

export default function LabelSheet() {
  const sp = useSearchParams();
  const lotKey = sp.get("lot") || "";
  const [size, setSizeState] = useState<PaperSize>(labelSize(sp.get("size")));
  const [saved, save] = useSavedPrint();
  const [test, setTest] = useState(false);
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
  const [kind, setKind] = useState<Kind>((["full", "empty", "both", "sum"] as const).find((k) => k === sp.get("type")) ?? "id");
  const [lot, setLot] = useState<Lot | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [only, setOnly] = useState<number[] | null>(Number(sp.get("seq")) > 0 ? [Number(sp.get("seq"))] : null);
  const origin = typeof window !== "undefined" ? window.location.origin : "";

  useEffect(() => {
    if (!lotKey) {
      setErr("No lot given.");
      return;
    }
    fetch(`/api/barrels/${encodeURIComponent(lotKey)}`)
      .then((r) => r.json().then((j) => ({ ok: r.ok, j })))
      .then(({ ok, j }) => (ok ? setLot(j.data) : setErr(j.error || "Could not load the lot.")))
      .catch(() => setErr("Could not load the lot."));
  }, [lotKey]);

  // Paper size for the print dialog.
  useEffect(() => {
    const style = document.createElement("style");
    style.textContent = pageCss(size, "label");
    document.head.appendChild(style);
    return () => style.remove();
  }, [size]);

  const markPrinted = () => {
    if (lot) void fetch(`/api/barrels/${lot.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "labelsPrinted" }) });
  };

  if (err) return <div className="bd-wrap"><div className="bd-err">{err}</div></div>;
  if (!lot) return <div className="bd-wrap"><div className="bd-m">Loading…</div></div>;
  const barrels = only ? lot.barrels.filter((b) => only.includes(b.seq)) : lot.barrels;
  const total = lot.barrels.length;
  const kinds: ("id" | "sum" | Phase)[] = kind === "id" ? ["id"] : kind === "sum" ? ["sum"] : kind === "full" ? ["GROSS"] : kind === "empty" ? ["EMPTY"] : ["GROSS", "EMPTY"];
  const sheet = barrels.flatMap((b) => kinds.map((k) => ({ b, k })));

  return (
    <div className="bd-labelpage">
      <div className="bd-noprint bd-labelbar">
        <b>🏷️ Labels for lot {lot.lotNo}</b>
        <span className="bd-m"> · {barrels.length} of {total} barrels · {sheet.length} label(s)</span>
        <div className="bd-row">
          {(Object.keys(KIND_LABEL) as Kind[]).map((k) => (
            <button key={k} className={`bd-chip${kind === k ? " on" : ""}`} onClick={() => setKind(k)}>{KIND_LABEL[k]}</button>
          ))}
        </div>
        <SizePicker options={LABEL_SIZES} value={size} onPick={setSize} />
        <PrintCenter kind="label" size={size} selector=".bd-label" count={sheet.length} label={`Print ${sheet.length} label(s)`} disabled={!sheet.length} name={`lot-${lot.lotNo}-labels`} saved={saved} onSave={save} onDone={markPrinted} />
        <div className="bd-row">
          {only && <button className="bd-btn" onClick={() => setOnly(null)}>Show all</button>}
          {test && <button className="bd-btn" onClick={() => setTest(false)}>Back to the real labels</button>}
        </div>
        <PrinterPanel size={size} kind="label" saved={saved} onSave={save} onSize={setSize} onTest={() => { setTest(true); window.scrollTo({ top: 0 }); }} />
        {kind !== "id" && (
          <div className="bd-m small">
            <b>FULL + EMPTY + NET (1 label):</b> one sticker per barrel with full weight, empty weight and net oil (full − empty), plus the date and time of each weighing — print it after both weighings. Its barcode is the plain barrel code, so a scan opens the barrel&apos;s record. <br /><b>FULL / EMPTY weight labels:</b> print them <b>after</b> weighing — the weight, date and time are printed on the label, so stick it on the barrel as its record. The barcode ends in -F (full) or -E (empty): scan it on the Weigh tab and the right step opens by itself. A label for a barrel not weighed yet prints a blank line to write the weight on.
          </div>
        )}
        <div className="bd-m small">
          Each label has a barcode (for a scanner gun) and a QR code (for any phone camera — it opens the barrel&apos;s record). Stick one label on each barrel (on the side, not the lid) — cover it with clear tape because oil and handling wear paper labels. To reprint one barrel, tap its number:{" "}
          {lot.barrels.map((b) => (
            <button key={b.id} className="bd-linkbtn" onClick={() => setOnly([b.seq])}>
              {String(b.seq).padStart(2, "0")}
            </button>
          ))}
        </div>
      </div>
      <div className={`bd-labels ${size.cls}${size.cls === "gen" ? ` ${lay.compact ? "compact" : ""} ${lay.roomy ? "roomy" : ""}` : ""}`} style={vars}>
        {test && (
          <div className="bd-label bd-test">
            <div className="bd-testmark">TEST · {size.name}<br />{size.h ? `${size.w} × ${size.h} mm` : `${size.w} mm`}</div>
            <Barcode className="bd-lbar" value="R000000-0-00" moduleWidth={2} height={40} fill={size.cls === "gen"} />
            <div className="bd-lbottom"><div className="bd-ltext"><div className="bd-lcode">R000000-0-00</div></div><QrCode className="bd-lqr" value="TEST" moduleSize={3} /></div>
          </div>
        )}
        {!test && sheet.map(({ b, k }) => {
          const w = k === "GROSS" ? b.grossKg : k === "EMPTY" ? b.emptyKg : null;
          const at = k === "GROSS" ? b.grossAt : k === "EMPTY" ? b.emptyAt : null;
          const net = b.grossKg != null && b.emptyKg != null ? b.grossKg - b.emptyKg : null;
          const value = k === "id" || k === "sum" ? b.code : `${b.code}-${k === "GROSS" ? "F" : "E"}`;
          return (
            <div className={`bd-label ${k === "id" ? "" : "wt"}`} key={`${b.id}-${k}`}>
              <div className="bd-lhead">
                <b>MAHADEV TRADERS</b>
                <span>{lot.date.split("-").reverse().join("-")}</span>
              </div>
              {k === "sum" && (
                <div className="bd-lband sum">
                  <span>FULL<b>{kg(b.grossKg)}</b></span>
                  <span>EMPTY<b>{kg(b.emptyKg)}</b></span>
                  <span>NET<b>{kg(net)}</b></span>
                  <small>{b.grossAt ? `F ${stamp(b.grossAt)}` : ""}{b.grossAt && b.emptyAt ? " · " : ""}{b.emptyAt ? `E ${stamp(b.emptyAt)}` : ""}</small>
                </div>
              )}
              {k !== "id" && k !== "sum" && (
                <div className="bd-lband">
                  {k === "GROSS" ? "FULL BARREL" : "EMPTY BARREL"} · {w != null ? <b>{Math.round(w * 100) / 100} kg</b> : <span>________ kg</span>}
                  {at && <small> {stamp(at)}</small>}
                </div>
              )}
              <Barcode className="bd-lbar" value={value} moduleWidth={2} height={size.id === "50x30" ? (k === "id" ? 66 : 44) : k === "id" ? 76 : 50} fill={size.cls === "gen"} />
              <div className="bd-lbottom">
                <div className="bd-ltext">
                  <div className="bd-lcode">{value}</div>
                  <div className="bd-lline">
                    <span>Barrel {String(b.seq).padStart(2, "0")} / {String(total).padStart(2, "0")}{b.supplierMark ? ` · Tag ${b.supplierMark}` : ""}</span>
                  </div>
                  <div className="bd-lline small">
                    <span>{lot.product}</span>
                  </div>
                  <div className="bd-lline small">
                    <span>{lot.supplierName}{lot.vehicleNo ? ` · ${lot.vehicleNo}` : ""}</span>
                  </div>
                </div>
                <QrCode className="bd-lqr" value={barrelLink(origin, b.code, k === "id" || k === "sum" ? undefined : k)} moduleSize={3} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
