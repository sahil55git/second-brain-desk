"use client";

// The receipt sheet: a bill, payment receipt, job-work challan or day summary shown as it will come out of
// the roll printer, with the same "Print to [printer ▾] · Copies · Print" bar as the label pages. It uses
// this device's saved slip printer (or the one found / used last); the print window prints only the slip,
// at the roll width. Any page opens it with <ReceiptSheet doc={...} onClose={...} />.
import ShareButton from "@/components/share/ShareButton";
import "@/app/barrels/barrels.css";
import "./print.css";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import PrintCenter from "@/components/barrels/PrintCenter";
import QrCode from "@/components/barrels/QrCode";
import { useSavedPrint } from "@/components/barrels/PrintKit";
import { SLIP_SIZES, pageCss, slipLayout, type PaperSize } from "@/lib/printSizes";
import { DEFAULT_SHOP, cleanReceipt, receiptName, type ReceiptDoc, type ShopInfo } from "@/lib/receipt";

const ROLLS = SLIP_SIZES.filter((s) => s.h == null);
const rollFor = (id?: string): PaperSize => ROLLS.find((s) => s.id === id) ?? ROLLS[0];

let shopCache: ShopInfo | null = null;
/** The shop's name, address, phone and GSTIN from Settings (falls back to the name alone). */
export function useShop(): ShopInfo {
  const [shop, setShop] = useState<ShopInfo>(shopCache ?? DEFAULT_SHOP);
  useEffect(() => {
    if (shopCache) return;
    fetch("/api/settings", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        const s = j?.data;
        if (s?.businessName) {
          shopCache = { name: String(s.businessName).toUpperCase(), address: s.address, phone: s.phone, gstin: s.gstin };
          setShop(shopCache);
        }
      })
      .catch(() => {});
  }, []);
  return shop;
}

export function ReceiptView({ doc, shop, widthMm }: { doc: ReceiptDoc; shop: ShopInfo; widthMm: number }) {
  const d = cleanReceipt(doc);
  const small = widthMm <= 60;
  return (
    <div className={`rc-slip${small ? " small" : ""}`} style={{ width: `${widthMm}mm` }}>
      <div className="rc-shop">
        <b>{shop.name}</b>
        {shop.address && <span>{shop.address}</span>}
        {(shop.phone || shop.gstin) && <span>{[shop.phone && `Ph ${shop.phone}`, shop.gstin && `GSTIN ${shop.gstin}`].filter(Boolean).join(" · ")}</span>}
      </div>
      <div className="rc-title">{d.title}</div>
      {(d.no || d.when) && (
        <div className="rc-meta">
          {d.no && <span>No. {d.no}</span>}
          {d.when && <span>{d.when}</span>}
        </div>
      )}
      {d.party && <div className="rc-party">{d.party}</div>}
      {d.rows.length > 0 && (
        <div className="rc-rows">
          {d.rows.map((r, i) => (
            <div key={i} className="rc-row">
              <div className="rc-l">
                <span>{r.name}</span>
                {r.detail && <small>{r.detail}</small>}
              </div>
              {r.amount && <b className="rc-a">{r.amount}</b>}
            </div>
          ))}
        </div>
      )}
      {d.pre && <pre className="rc-pre">{d.pre}</pre>}
      {d.totals && d.totals.length > 0 && (
        <div className="rc-totals">
          {d.totals.map((t, i) => (
            <div key={i} className={`rc-tot${t.strong ? " big" : ""}`}>
              <span>{t.label}</span>
              <b>{t.value}</b>
            </div>
          ))}
        </div>
      )}
      {d.notes && d.notes.length > 0 && (
        <div className="rc-notes">
          {d.notes.map((n, i) => <div key={i}>{n}</div>)}
        </div>
      )}
      {d.qr && (
        <div className="rc-qr">
          <QrCode value={d.qr} moduleSize={3} />
        </div>
      )}
      <div className="rc-end">Thank you · ಧನ್ಯವಾದಗಳು</div>
    </div>
  );
}

export default function ReceiptSheet({ doc, onClose, onPrinted }: { doc: ReceiptDoc; onClose: () => void; onPrinted?: () => void }) {
  const [saved, save] = useSavedPrint();
  const [mounted, setMounted] = useState(false);
  const shop = useShop();
  const size = rollFor(saved.slip);
  const lay = slipLayout(size);
  useEffect(() => setMounted(true), []);
  // while the sheet is open, the print window prints only the slip, at the roll width
  useEffect(() => {
    const html = document.documentElement;
    html.classList.add("rc-open");
    const style = document.createElement("style");
    style.textContent = pageCss(size, "slip");
    document.head.appendChild(style);
    return () => {
      html.classList.remove("rc-open");
      style.remove();
    };
  }, [size]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  if (!mounted) return null;
  return createPortal(
    <div className="rc-portal" role="dialog" aria-modal="true" aria-label={`Print ${doc.title.toLowerCase()}`} onClick={(e) => { e.stopPropagation(); onClose(); }}>
      <div className="rc-panel bd-printpage" onClick={(e) => e.stopPropagation()}>
        <div className="rc-ctl">
          <div className="rc-head">
            <b>🧾 Print {doc.title.toLowerCase()}</b>
            <button type="button" className="bd-btn" onClick={onClose} aria-label="Close">✕</button>
          </div>
          <div className="bd-row">
            <span className="bd-m small">Roll</span>
            {ROLLS.map((r) => (
              <button key={r.id} type="button" className={`bd-chip${r.id === size.id ? " on" : ""}`} onClick={() => save({ slip: r.id })}>{r.name}</button>
            ))}
          </div>
          <PrintCenter kind="slip" size={size} selector=".rc-portal .rc-slip" marginMm={lay.margin} count={1} label="Print" name={receiptName(doc)} saved={saved} onSave={save} onDone={onPrinted} />
          <div className="bd-row"><ShareButton area=".rc-portal .rc-slip" className="bd-btn" title={receiptName(doc)} url={false} label="📤 Share receipt (WhatsApp, picture…)" /></div>
        </div>
        <div className="rc-preview">
          <ReceiptView doc={doc} shop={shop} widthMm={lay.inner} />
        </div>
      </div>
    </div>,
    document.body
  );
}
