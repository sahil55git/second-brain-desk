"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Barcode from "@/components/barrels/Barcode";
import QrCode from "@/components/barrels/QrCode";
import { barrelLink, type Phase } from "@/lib/barrels";
import { LABEL_SIZES, labelLayout, labelSize, pageCss, type PaperSize } from "@/lib/printSizes";
import { PrinterPanel, SizePicker, useSavedPrint } from "@/components/barrels/PrintKit";

type Kind = "id" | "full" | "empty" | "both";
const KIND_LABEL: Record<Kind, string> = { id: "Barrel ID label", full: "FULL-weight label", empty: "EMPTY-weight label", both: "FULL + EMPTY labels" };
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
  const [kind, setKind] = useState<Kind>((["full", "empty", "both"] as const).find((k) => k === sp.get("type")) ?? "id");
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

  const print = () => {
    window.print();
    if (lot) void fetch(`/api/barrels/${lot.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "labelsPrinted" }) });
  };

  if (err) return <div className="bd-wrap"><div className="bd-err">{err}</div></div>;
  if (!lot) return <div className="bd-wrap"><div className="bd-m">Loading…</div></div>;
  const barrels = only ? lot.barrels.filter((b) => only.includes(b.seq)) : lot.barrels;
  const total = lot.barrels.length;
  const kinds: ("id" | Phase)[] = kind === "id" ? ["id"] : kind === "full" ? ["GROSS"] : kind === "empty" ? ["EMPTY"] : ["GROSS", "EMPTY"];
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
        <div className="bd-row">
          <button className="bd-btn primary" onClick={print}>🖨️ Print {sheet.length} label(s)</button>
          {only && <button className="bd-btn" onClick={() => setOnly(null)}>Show all</button>}
          {test && <button className="bd-btn" onClick={() => setTest(false)}>Back to the real labels</button>}
        </div>
        <PrinterPanel size={size} kind="label" saved={saved} onSave={save} onTest={() => { setTest(true); window.scrollTo({ top: 0 }); }} />
        {kind !== "id" && (
          <div className="bd-m small">
            <b>FULL / EMPTY weight labels:</b> print them <b>after</b> weighing — the weight, date and time are printed on the label, so stick it on the barrel as its record. The barcode ends in -F (full) or -E (empty): scan it on the Weigh tab and the right step opens by itself. A label for a barrel not weighed yet prints a blank line to write the weight on.
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
          const value = k === "id" ? b.code : `${b.code}-${k === "GROSS" ? "F" : "E"}`;
          return (
            <div className={`bd-label ${k === "id" ? "" : "wt"}`} key={`${b.id}-${k}`}>
              <div className="bd-lhead">
                <b>MAHADEV TRADERS</b>
                <span>{lot.date.split("-").reverse().join("-")}</span>
              </div>
              {k !== "id" && (
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
                <QrCode className="bd-lqr" value={barrelLink(origin, b.code, k === "id" ? undefined : k)} moduleSize={3} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
