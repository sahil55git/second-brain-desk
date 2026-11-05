"use client";

// 🧾 The purchase order as a printable sheet: shop on top, supplier, items with GST, totals in
// figures and words, delivery / transport / terms, signature line. Used for the in-app preview and
// the supplier's public page. Print (or "Save as PDF" in the print window) with printPo().
import { amountInWords } from "@/lib/money";
import { dmy, lineAmount, poTotals, type PoDoc, type ShopInfo } from "@/lib/po";
import "./po.css";

const rs = (n: number) => `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const qty = (n: number) => n.toLocaleString("en-IN", { maximumFractionDigits: 3 });

/** Print just the order sheet: a body class limits the print stylesheet to it, then clears it. */
export function printPo() {
  const b = document.body;
  b.classList.add("po-printing");
  const done = () => { b.classList.remove("po-printing"); window.removeEventListener("afterprint", done); };
  window.addEventListener("afterprint", done);
  setTimeout(done, 60000);
  window.print();
}

export default function PoDocument({ po, shop }: { po: PoDoc; shop: ShopInfo }) {
  const t = poTotals(po.lines);
  const showTax = po.lines.some((l) => l.gst);
  return (
    <div className="po-sheet" id="po-sheet">
      {po.status === "cancelled" && <div className="po-stamp">CANCELLED</div>}
      {po.status === "draft" && <div className="po-stamp draft">DRAFT</div>}
      <div className="po-head">
        <div className="po-shop">
          <h1>{shop.name || "Purchase order"}</h1>
          {shop.address && <small>{shop.address}</small>}
          {shop.gstin && <small>GSTIN: {shop.gstin}</small>}
          {(shop.phone || shop.email) && <small>{[shop.phone, shop.email].filter(Boolean).join(" · ")}</small>}
        </div>
        <div className="po-meta">
          <div className="po-title">PURCHASE ORDER</div>
          <div className="po-no">{po.no}{po.rev > 1 && <span className="po-rev">REV {po.rev}</span>}</div>
          <div>Date: {dmy(po.date)}</div>
          {po.dueDate && <div>Deliver by: <b>{dmy(po.dueDate)}</b></div>}
        </div>
      </div>
      <div className="po-cols">
        <div><h2>To (supplier)</h2><b>{po.supplier}</b>{po.phone && <div>{po.phone}</div>}</div>
        {(po.deliverTo || po.transport) && (
          <div>
            {po.deliverTo && <><h2>Deliver to</h2><div>{po.deliverTo}</div></>}
            {po.transport && <div style={{ marginTop: 4 }}><b>Transport:</b> {po.transport}</div>}
          </div>
        )}
      </div>
      <table className="po-tbl">
        <thead>
          <tr><th>#</th><th>Item</th><th className="r">Qty</th><th>Unit</th><th className="r">Rate</th>{showTax && <th className="r">GST</th>}<th className="r">Amount</th></tr>
        </thead>
        <tbody>
          {po.lines.map((l, i) => (
            <tr key={i}>
              <td>{i + 1}</td><td>{l.item}</td><td className="r">{qty(l.qty)}</td><td>{l.unit}</td>
              <td className="r">{l.rate ? rs(l.rate) : "–"}</td>{showTax && <td className="r">{l.gst ? `${l.gst}%` : "–"}</td>}
              <td className="r">{l.rate ? rs(lineAmount(l)) : "–"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {t.subtotal > 0 && (
        <>
          <div className="po-tot">
            <div><span>Sub-total</span><span>{rs(t.subtotal)}</span></div>
            {t.taxRows.map((x) => <div key={x.rate}><span>GST {x.rate}% on {rs(x.taxable)}</span><span>{rs(x.tax)}</span></div>)}
            <div className="g"><span>Total</span><span>{rs(t.total)}</span></div>
          </div>
          <p className="po-words">{amountInWords(t.total)}</p>
        </>
      )}
      {(po.terms || po.notes) && (
        <div className="po-notes">
          {po.terms && <div><b>Terms:</b> {po.terms}</div>}
          {po.notes && <div><b>Note:</b> {po.notes}</div>}
        </div>
      )}
      <div className="po-sign">
        <span>Please confirm receipt of this order.</span>
        <span className="line">For {shop.name || "the shop"} — Authorised signatory</span>
      </div>
    </div>
  );
}
