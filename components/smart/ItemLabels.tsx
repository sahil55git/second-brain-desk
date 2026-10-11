"use client";

// Printable item / pack labels: Code 128 barcode (scanner gun) + QR (phone camera),
// both holding the item's code, so a scan in Sales / Purchase / Inventory finds it.
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import Barcode from "@/components/barrels/Barcode";
import QrCode from "@/components/barrels/QrCode";
import { code128Ok } from "@/lib/code128";
import type { ItemDTO } from "@/lib/types";

export default function ItemLabels() {
  const sp = useSearchParams();
  const ids = (sp.get("items") || "").split(",").filter(Boolean);
  const [items, setItems] = useState<ItemDTO[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [size, setSize] = useState<"a4" | "thermal">(sp.get("size") === "thermal" ? "thermal" : "a4");
  const [copies, setCopies] = useState(1);
  const [company, setCompany] = useState("MAHADEV TRADERS");

  useEffect(() => {
    fetch("/api/items", { cache: "no-store" })
      .then((r) => r.json().then((j) => ({ ok: r.ok, j })))
      .then(({ ok, j }) => (ok ? setItems(j.data) : setErr(j.error || "Could not load items.")))
      .catch(() => setErr("Could not load items."));
  }, []);

  useEffect(() => {
    const style = document.createElement("style");
    style.textContent = size === "thermal" ? "@page { size: 50mm 30mm; margin: 0 }" : "@page { size: A4; margin: 8mm 6mm }";
    document.head.appendChild(style);
    return () => style.remove();
  }, [size]);

  const chosen = useMemo(() => (items ?? []).filter((i) => i.active && i.barcode && code128Ok(i.barcode) && (!ids.length || ids.includes(i.id))), [items, ids]);
  const noCode = (items ?? []).filter((i) => i.active && !i.barcode && (!ids.length || ids.includes(i.id)));

  if (err) return <div className="bd-wrap"><div className="bd-err">{err}</div></div>;
  if (!items) return <div className="bd-wrap"><div className="bd-m">Loading…</div></div>;

  return (
    <div className="bd-labelpage">
      <div className="bd-noprint bd-labelbar">
        <b>🏷️ Item labels</b>
        <span className="bd-m"> · {chosen.length} item(s) × {copies}</span>
        <div className="bd-row">
          <button className={`bd-chip${size === "a4" ? " on" : ""}`} onClick={() => setSize("a4")}>A4 sticker sheet (21 per page)</button>
          <button className={`bd-chip${size === "thermal" ? " on" : ""}`} onClick={() => setSize("thermal")}>Thermal 50 × 30 mm</button>
          <label className="bd-m">
            Copies each <input type="number" min={1} max={100} value={copies} onChange={(e) => setCopies(Math.max(1, Math.min(100, Number(e.target.value) || 1)))} style={{ width: 60 }} />
          </label>
          <label className="bd-m">
            Name on label <input value={company} onChange={(e) => setCompany(e.target.value.slice(0, 30))} style={{ width: 170 }} />
          </label>
          <button className="bd-btn primary" onClick={() => window.print()} disabled={!chosen.length}>🖨️ Print</button>
        </div>
        {noCode.length > 0 && <div className="bd-m small">{noCode.length} item(s) have no code yet ({noCode.slice(0, 5).map((i) => i.name).join(", ")}{noCode.length > 5 ? "…" : ""}) — give them one in Inventory with “+ code”.</div>}
        {!chosen.length && <div className="bd-err">No items with a code to print.</div>}
      </div>
      <div className={`bd-labels ${size}`}>
        {chosen.flatMap((i) =>
          Array.from({ length: copies }, (_, k) => (
            <div className="bd-label" key={`${i.id}-${k}`}>
              <div className="bd-lhead">
                <b>{company}</b>
                <span>{i.unit}</span>
              </div>
              <Barcode className="bd-lbar" value={i.barcode!} moduleWidth={2} height={size === "thermal" ? 60 : 70} />
              <div className="bd-lbottom">
                <div className="bd-ltext">
                  <div className="bd-lcode">{i.barcode}</div>
                  <div className="bd-lline">
                    <span>{i.name}</span>
                  </div>
                  <div className="bd-lline small">
                    <span>{i.hsnCode ? `HSN ${i.hsnCode}` : ""}{i.gstRatePct != null ? ` · GST ${i.gstRatePct}%` : ""}</span>
                  </div>
                </div>
                <QrCode className="bd-lqr" value={i.barcode!} moduleSize={3} />
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
