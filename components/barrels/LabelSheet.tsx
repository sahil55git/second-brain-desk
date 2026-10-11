"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Barcode from "@/components/barrels/Barcode";

interface Lot {
  id: string;
  lotNo: string;
  date: string;
  supplierName: string;
  product: string;
  vehicleNo: string | null;
  barrels: { id: string; seq: number; code: string; supplierMark: string | null }[];
}

export default function LabelSheet() {
  const sp = useSearchParams();
  const lotKey = sp.get("lot") || "";
  const [size, setSize] = useState<"a4" | "thermal">(sp.get("size") === "thermal" ? "thermal" : "a4");
  const [lot, setLot] = useState<Lot | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [only, setOnly] = useState<number[] | null>(null);

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
    style.textContent = size === "thermal" ? "@page { size: 50mm 30mm; margin: 0 }" : "@page { size: A4; margin: 8mm 6mm }";
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

  return (
    <div className="bd-labelpage">
      <div className="bd-noprint bd-labelbar">
        <b>🏷️ Labels for lot {lot.lotNo}</b>
        <span className="bd-m"> · {barrels.length} of {total} barrels</span>
        <div className="bd-row">
          <button className={`bd-chip${size === "a4" ? " on" : ""}`} onClick={() => setSize("a4")}>A4 sticker sheet (21 per page)</button>
          <button className={`bd-chip${size === "thermal" ? " on" : ""}`} onClick={() => setSize("thermal")}>Thermal 50 × 30 mm</button>
          <button className="bd-btn primary" onClick={print}>🖨️ Print</button>
          {only && <button className="bd-btn" onClick={() => setOnly(null)}>Show all</button>}
        </div>
        <div className="bd-m small">
          Stick one label on each barrel (on the side, not the lid) — cover it with clear tape because oil and handling wear paper labels. To reprint one barrel, tap its number:{" "}
          {lot.barrels.map((b) => (
            <button key={b.id} className="bd-linkbtn" onClick={() => setOnly([b.seq])}>
              {String(b.seq).padStart(2, "0")}
            </button>
          ))}
        </div>
      </div>
      <div className={`bd-labels ${size}`}>
        {barrels.map((b) => (
          <div className="bd-label" key={b.id}>
            <div className="bd-lhead">
              <b>MAHADEV TRADERS</b>
              <span>{lot.date.split("-").reverse().join("-")}</span>
            </div>
            <Barcode value={b.code} moduleWidth={size === "thermal" ? 1.6 : 2} height={size === "thermal" ? 44 : 52} />
            <div className="bd-lcode">{b.code}</div>
            <div className="bd-lline">
              <span>Barrel {String(b.seq).padStart(2, "0")} / {String(total).padStart(2, "0")}</span>
              <span>{lot.product}</span>
            </div>
            <div className="bd-lline small">
              <span>{lot.supplierName}</span>
              <span>{lot.vehicleNo || ""}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
