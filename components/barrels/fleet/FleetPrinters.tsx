"use client";

// Printer setup (/barrels/fleet/printers?kind=label|slip): the same "How to print" panel as the label and slip
// pages, on a page of its own. Choose how this device prints, connect and save printers, and print a sample
// label or slip to check it. Saved printers are then used by the real print pages.
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Barcode from "@/components/barrels/Barcode";
import QrCode from "@/components/barrels/QrCode";
import { LABEL_SIZES, SLIP_SIZES, labelLayout, labelSize, pageCss, slipLayout, slipSize, type PaperSize } from "@/lib/printSizes";
import { PrinterPanel, SizePicker, useSavedPrint } from "@/components/barrels/PrintKit";
import PrintCenter from "@/components/barrels/PrintCenter";

type Kind = "label" | "slip";

export default function FleetPrinters() {
  const sp = useSearchParams();
  const [kind, setKind] = useState<Kind>(sp.get("kind") === "slip" ? "slip" : "label");
  const [saved, save] = useSavedPrint();
  const [lsize, setLsize] = useState<PaperSize>(labelSize(sp.get("size") ?? "50x75"));
  const [ssize, setSsize] = useState<PaperSize>(slipSize(sp.get("size")));
  const size = kind === "label" ? lsize : ssize;

  // start on the paper sizes used last time on this device
  useEffect(() => {
    if (!sp.get("size")) {
      if (saved.label) setLsize(labelSize(saved.label));
      if (saved.slip) setSsize(slipSize(saved.slip));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saved.label, saved.slip]);

  useEffect(() => {
    const style = document.createElement("style");
    style.textContent = pageCss(size, kind);
    document.head.appendChild(style);
    return () => style.remove();
  }, [size, kind]);

  const setSize = (x: PaperSize) => {
    if (kind === "label") {
      setLsize(x);
      save({ label: x.id });
    } else {
      setSsize(x);
      save({ slip: x.id });
    }
  };

  const lay = labelLayout(lsize);
  const lvars = { "--lw": lsize.w, "--lh": lsize.h ?? 30, "--sc": lay.sc, "--barh": lay.barH, "--qr": lay.qr } as React.CSSProperties;
  const sl = slipLayout(ssize);
  const svars = { "--sw": sl.inner, "--ss": sl.ss, "--sh": sl.innerH ?? 0 } as React.CSSProperties;

  return (
    <div className="bd-printpage">
      <div className="bd-noprint bd-labelbar">
        <b>🖨️ Printer setup</b>
        <div className="bd-m small">
          Connect a printer, choose how this device prints, and save it. The label and slip pages then print to it by themselves. Press the big button to print a sample and check it.
        </div>
        <div className="bd-row">
          <button className={`bd-chip${kind === "label" ? " on" : ""}`} onClick={() => setKind("label")}>🏷️ Label printer</button>
          <button className={`bd-chip${kind === "slip" ? " on" : ""}`} onClick={() => setKind("slip")}>🧾 Slip / receipt printer</button>
        </div>
        <SizePicker key={`size-${kind}`} options={kind === "label" ? LABEL_SIZES : SLIP_SIZES} value={size} onPick={setSize} roll={kind === "slip"} />
        <PrintCenter
          key={`pc-${kind}`}
          kind={kind}
          size={size}
          selector={kind === "label" ? ".bd-label" : ".bd-slip"}
          marginMm={kind === "slip" ? sl.margin : 0}
          count={1}
          label={kind === "label" ? "Print a sample label" : "Print a sample slip"}
          name="printer-test"
          setupLink={false}
          moreOpen
          saved={saved}
          onSave={save}
        />
        <PrinterPanel size={size} kind={kind} saved={saved} onSave={save} onSize={setSize} />
        <div className="bd-row">
          <a className="bd-btn" href={kind === "label" ? "/barrels/fleet/labels" : "/barrels/fleet"}>{kind === "label" ? "Go to the barrel labels" : "Go to the barrel fleet"}</a>
          <a className="bd-btn" href="/settings">⚙️ Settings → Printers</a>
        </div>
      </div>

      {kind === "label" ? (
        <div className={`bd-labels ${lsize.cls}${lsize.cls === "gen" ? ` ${lay.compact ? "compact" : ""} ${lay.roomy ? "roomy" : ""}` : ""}`} style={lvars}>
          <div className="bd-label bd-test">
            <div className="bd-testmark">SAMPLE · {lsize.name}<br />{lsize.h ? `${lsize.w} × ${lsize.h} mm` : `${lsize.w} mm`}</div>
            <Barcode className="bd-lbar" value="BRL-00" moduleWidth={2} height={40} fill={lsize.cls === "gen"} />
            <div className="bd-lbottom"><div className="bd-ltext"><div className="bd-lcode">BRL-00</div></div><QrCode className="bd-lqr" value="TEST" moduleSize={3} /></div>
          </div>
        </div>
      ) : (
        <div className={`bd-slips ${ssize.cls}${ssize.cls === "gen" ? `${sl.short ? " short" : ""}${sl.fixed ? " fixed" : ""}` : ""}`} style={svars}>
          <div className="bd-slip">
            <div className="bd-sh">
              <b>MAHADEV TRADERS</b>
              <span>Sample slip · {ssize.name}</span>
            </div>
            <div className="bd-scodes">
              <Barcode value="BRL-00" moduleWidth={2} height={70} />
              <QrCode className="bd-sqr" value="TEST" moduleSize={3} />
            </div>
            <div className="bd-sbig">BRL-00</div>
            <div className="bd-m small" style={{ textAlign: "center" }}>If you can read this and scan the barcode, the printer is set up.</div>
          </div>
        </div>
      )}
    </div>
  );
}
