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
import { SizePicker, useSavedPrint } from "@/components/barrels/PrintKit";
import PrintCenter from "@/components/barrels/PrintCenter";
import { api, kg } from "@/components/barrels/shared";
import type { FBarrel } from "@/components/barrels/fleet/types";
import { LabelView, templatePageCss, templatePaper } from "@/components/barrels/designer/render";
import LayoutPicker from "@/components/barrels/designer/LayoutPicker";
import { labelData } from "@/components/barrels/designer/data";
import { useLayoutChoice, useTemplates } from "@/components/barrels/designer/useTemplates";

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
  const [pickOpen, setPickOpen] = useState(false);
  // which barrels to print: null = what the link asked for (all, or the codes in it)
  const [sel, setSel] = useState<string[] | null>(null);
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const { rows: layouts } = useTemplates("label");
  const layoutLink = sp.get("layout");
  const { template, choiceId, choose } = useLayoutChoice("label", layouts, layoutLink);
  const tdoc = template && template.doc.kind === "label" ? template.doc : null;

  const setSize = (x: PaperSize) => {
    setSizeState(x);
    save({ label: x.id });
  };
  // no size in the link: start with the size used last time on this device
  useEffect(() => {
    if (!sp.get("size") && saved.label) setSizeState(labelSize(saved.label));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saved.label]);
  const pageSize = (tdoc && templatePaper(tdoc)) || size;
  const lay = labelLayout(size);
  const vars = { "--lw": size.w, "--lh": size.h ?? 30, "--sc": lay.sc, "--barh": lay.barH, "--qr": lay.qr } as React.CSSProperties;

  useEffect(() => {
    api<{ data: FBarrel[] }>("/api/barrel-fleet")
      .then((j) => setBarrels(j.data))
      .catch((e) => setErr(e instanceof Error ? e.message : "Could not load the barrels."));
  }, []);

  useEffect(() => {
    const style = document.createElement("style");
    style.textContent = tdoc ? templatePageCss(tdoc) : pageCss(size, "label");
    document.head.appendChild(style);
    return () => style.remove();
  }, [size, tdoc]);

  const wanted = useMemo(() => {
    const raw = sp.get("codes") || "all";
    if (raw === "all") return null;
    return raw.split(",").map((c) => findFleetCode(c)?.code).filter((c): c is string => !!c);
  }, [sp]);

  if (err) return <div className="bd-wrap"><div className="bd-err">{err}</div></div>;
  if (!barrels || !layouts) return <div className="bd-wrap"><div className="bd-m">Loading…</div></div>;

  const usable = barrels.filter((b) => b.condition !== "RETIRED");
  const chosenCodes = sel ?? wanted ?? usable.map((b) => b.code);
  const list = usable.filter((b) => chosenCodes.includes(b.code));
  const showTare = kind === "tare";
  const missingTare = showTare || tdoc ? list.filter((b) => b.tareKg == null).length : 0;
  const toggle = (code: string) => setSel(chosenCodes.includes(code) ? chosenCodes.filter((c) => c !== code) : [...chosenCodes, code]);
  const pickText = list.length === usable.length ? `All ${usable.length}` : list.length === 0 ? "None" : list.length <= 4 ? list.map((b) => b.code).join(", ") : `${list.length} of ${usable.length}`;

  return (
    <div className="bd-labelpage">
      <div className="bd-noprint bd-labelbar bd-lp">
        <div className="bd-lp-head">
          <b className="bd-lp-title">🏷️ Barrel labels</b>
          <span className="bd-m"> · {list.length} to print{tdoc ? ` · ${tdoc.widthMm} × ${tdoc.heightMm} mm` : ` · ${size.name}`}</span>
          <span className="bd-lp-links">
            <a className="bd-linkbtn" href="/barrels/fleet/designer?kind=label">🎨 Label designer</a>
            <a className="bd-linkbtn" href="/barrels/fleet/printers?kind=label">⚙️ Printer setup</a>
            <a className="bd-linkbtn" href="/print">🖨️ Print centre</a>
          </span>
        </div>

        <div className="bd-lp-card">
          <div className="bd-lp-step"><span className="bd-lp-n">1</span> What to print</div>
          <LayoutPicker kind="label" rows={layouts} choiceId={choiceId} onChoose={choose} fixedByLink={!!layoutLink} />
          {!tdoc && (
            <>
              <div className="bd-row">
                <button className={`bd-chip${kind === "tare" ? " on" : ""}`} onClick={() => setKind("tare")}>With tare weight</button>
                <button className={`bd-chip${kind === "id" ? " on" : ""}`} onClick={() => setKind("id")}>Code only</button>
              </div>
              <SizePicker options={LABEL_SIZES} value={size} onPick={setSize} startOpen={false} />
            </>
          )}
          <details className="bd-lp-pick" open={pickOpen} onToggle={(e) => setPickOpen((e.target as HTMLDetailsElement).open)}>
            <summary>🛢️ Barrels: <b>{pickText}</b> <span className="bd-m">· tap to choose</span></summary>
            <div className="bd-row" style={{ marginTop: 6 }}>
              <button className="bd-btn" onClick={() => setSel(usable.map((b) => b.code))}>All</button>
              <button className="bd-btn" onClick={() => setSel([])}>None</button>
              <button className="bd-btn" onClick={() => setSel(usable.filter((b) => b.tareKg != null).map((b) => b.code))}>Only with a tare</button>
              <button className="bd-btn" onClick={() => setTest(!test)}>{test ? "Back to the real labels" : "🧪 One test label"}</button>
            </div>
            <div className="bd-lp-grid" role="group" aria-label="Barrels to print">
              {usable.map((b) => (
                <label key={b.code} className={`bd-lp-b${chosenCodes.includes(b.code) ? " on" : ""}`}>
                  <input type="checkbox" checked={chosenCodes.includes(b.code)} onChange={() => toggle(b.code)} />
                  <b>{b.code.replace("BRL-", "")}</b>
                  <small>{b.mark || (b.tareKg != null ? `${kg(b.tareKg)} kg` : "no tare")}</small>
                </label>
              ))}
            </div>
          </details>
        </div>

        <div className="bd-lp-card">
          <div className="bd-lp-step"><span className="bd-lp-n">2</span> Print</div>
          <PrintCenter kind="label" size={pageSize} selector=".bd-label" count={test ? 1 : list.length} label={test ? "Print the test label" : `Print ${list.length} label${list.length === 1 ? "" : "s"}`} disabled={!test && !list.length} name={list.length === 1 ? list[0].code : "barrel-labels"} saved={saved} onSave={save} />
        </div>
        {missingTare > 0 && (
          <div className="bd-err">{missingTare} barrel(s) have no tare yet, so their label shows a blank line. Weigh each one empty first, then print the labels (or write the tare with a marker).</div>
        )}
        <div className="bd-m small">
          Barcode for a scanner gun, QR for any phone camera (it opens the barrel&apos;s record). Stick one label on the side of each barrel (not the lid) and cover it with clear tape. The same barrel keeps its code for life{!tdoc && showTare ? "; if a barrel's tare changes, reprint its label" : ""}.
        </div>
      </div>

      {tdoc ? (
        <div className="bd-labels tpl">
          {test ? (
            <LabelView doc={tdoc} data={labelData({ ...(list[0] ?? barrels[0]), code: "BRL-00", mark: "TEST" }, origin)} />
          ) : (
            list.map((b) => <LabelView key={b.id} doc={tdoc} data={labelData(b, origin)} />)
          )}
        </div>
      ) : (
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
      )}
    </div>
  );
}
