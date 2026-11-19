"use client";

// The receipt sheet: a bill, payment receipt, job-work challan or day summary shown as it will come out of
// the roll printer, with the same "Print to [printer ▾] · Copies · Print" bar as the label pages. It uses
// this device's saved slip printer (or the one found / used last); the print window prints only the slip,
// at the roll width. Any page opens it with <ReceiptSheet doc={...} onClose={...} />.
import ShareButton from "@/components/share/ShareButton";
import "@/app/barrels/barrels.css";
import "./print.css";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import PrintCenter from "@/components/barrels/PrintCenter";
import QrCode from "@/components/barrels/QrCode";
import { useSavedPrint } from "@/components/barrels/PrintKit";
import SlipPrinterSetup from "@/components/print/SlipPrinterSetup";
import { isNative } from "@/lib/native";
import { dropUnprinted, explainSlipError, getSlipPrinter, keepUnprinted, printSlip, resolveSlipPrinter, slipId, turnOnBluetooth, type SlipPrinterCfg } from "@/lib/slipPrinter";
import { SLIP_SIZES, pageCss, slipLayout, type PaperSize } from "@/lib/printSizes";
import { DEFAULT_SHOP, cleanReceipt, receiptName, rupees, type ReceiptDoc, type ShopInfo } from "@/lib/receipt";
import { useShopPay } from "@/lib/useShopPay";

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

export default function ReceiptSheet({ doc: docIn, onClose, onPrinted, autoPrint = false, quiet = false }: { doc: ReceiptDoc; onClose: () => void; onPrinted?: () => void; /** one-click: print at once and close when it worked */ autoPrint?: boolean; /** with autoPrint: show only a small "Printing…" note; the full printer panel opens only if printing does not start or fails */ quiet?: boolean }) {
  const [saved, save] = useSavedPrint();
  const [mounted, setMounted] = useState(false);
  const hidden0 = quiet && autoPrint;
  const [hidden, setHidden] = useState(hidden0);
  const started = useRef(false);
  const [state, setState] = useState<"wait" | "ok">("wait");
  // quiet mode: no printer could be used within a few seconds → show the panel so it can be set up
  useEffect(() => {
    if (!hidden0) return;
    const t = setTimeout(() => { if (!started.current) setHidden(false); }, 5000);
    return () => clearTimeout(t);
  }, [hidden0]);
  const shop = useShop();
  // a receipt that says how much the customer still has to pay gets the shop's UPI pay QR (any UPI app can scan it)
  const sp = useShopPay();
  const doc = useMemo<ReceiptDoc>(() => {
    if (docIn.qr || !(docIn.payDue && docIn.payDue > 0)) return docIn;
    const link = sp.linkFor(docIn.payDue, `${docIn.title} ${docIn.no ?? ""}`.trim(), shop.name);
    if (!link) return docIn;
    return { ...docIn, qr: link, notes: [...(docIn.notes ?? []), `Scan to pay ${rupees(docIn.payDue)} by UPI · ${sp.vpaOf()}`] };
  }, [docIn, sp, shop.name]);
  const size = rollFor(saved.slip);
  const lay = slipLayout(size);
  useEffect(() => setMounted(true), []);

  // ---- Android app: the counter slip printer of this device, straight over Bluetooth (no print window)
  const native = useMemo(() => isNative(), []);
  /** undefined = still looking, null = none chosen (and none found by itself) */
  const [direct, setDirect] = useState<SlipPrinterCfg | null | undefined>(native ? undefined : null);
  const [dState, setDState] = useState<"idle" | "printing" | "ok" | "fail">("idle");
  const [dErr, setDErr] = useState<ReturnType<typeof explainSlipError> | null>(null);
  const directFired = useRef(false);
  useEffect(() => {
    if (!native) return;
    let live = true;
    void resolveSlipPrinter().then((c) => live && setDirect(c));
    const h = () => setDirect(getSlipPrinter());
    window.addEventListener("md-slip-printer", h);
    return () => {
      live = false;
      window.removeEventListener("md-slip-printer", h);
    };
  }, [native]);
  const printDirect = async (cfg: SlipPrinterCfg | null | undefined = direct) => {
    if (!cfg) return;
    started.current = true;
    setDState("printing");
    setDErr(null);
    const id = slipId(doc);
    try {
      await printSlip(doc, shop, cfg);
      dropUnprinted(id);
      setDState("ok");
      onPrinted?.();
      if (autoPrint) setTimeout(onClose, 900);
    } catch (e) {
      const x = explainSlipError(e);
      setDErr(x);
      setDState("fail");
      // the bill is saved; keep the slip so it can be printed again from the red bar
      keepUnprinted({ id, at: Date.now(), doc, shop, error: x.en });
    }
  };
  // Save & Print: print as soon as the printer is known (and the UPI QR is ready when the bill needs one)
  useEffect(() => {
    if (!autoPrint || directFired.current || !direct) return;
    if (docIn.payDue && docIn.payDue > 0 && !sp.ready) return;
    directFired.current = true;
    void printDirect(direct);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoPrint, direct, sp.ready]);
  // in the app with no slip printer chosen yet: open the sheet at once to choose one (never the Android print window)
  useEffect(() => {
    if (native && direct === null) setHidden(false);
  }, [native, direct]);
  const directBusy = dState === "printing";
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
    <>
    {hidden && native && direct && dState === "fail" && dErr && (
      <div className="rc-toast bad" role="alert">
        <span className="rc-why">🧾✗ {dErr.en}<small>{dErr.kn}</small></span>
        {dErr.fix === "bt-on" && <button type="button" onClick={async () => { await turnOnBluetooth(); setTimeout(() => void printDirect(), 3000); }}>Turn on Bluetooth</button>}
        <button type="button" className="big" onClick={() => void printDirect()}>🔁 Print again</button>
        <button type="button" onClick={() => setHidden(false)}>⚙</button>
        <button type="button" onClick={onClose} aria-label="Close">✕</button>
      </div>
    )}
    {hidden && !(native && direct && dState === "fail") && (
      <div className={`rc-toast${state === "ok" || dState === "ok" ? " ok" : ""}`} role="status">
        <span>{state === "ok" || dState === "ok" ? "✅ Printed · ಮುದ್ರಣ ಆಯಿತು" : "🖨️ Printing… ಮುದ್ರಿಸುತ್ತಿದೆ"}</span>
        <button type="button" onClick={() => setHidden(false)}>⚙</button>
      </div>
    )}
    <div className={`rc-portal${hidden ? " rc-quiet" : ""}`} role="dialog" aria-modal="true" aria-label={`Print ${doc.title.toLowerCase()}`} onClick={(e) => { e.stopPropagation(); onClose(); }}>
      <div className="rc-panel bd-printpage" onClick={(e) => e.stopPropagation()}>
        <div className="rc-ctl">
          <div className="rc-head">
            <b>🧾 Print {doc.title.toLowerCase()}</b>
            <button type="button" className="bd-btn" onClick={onClose} aria-label="Close">✕</button>
          </div>
          {native && (
            <>
              {direct && (
                <div className="bd-row">
                  <button type="button" className="bd-btn primary" style={{ fontSize: 18, padding: "10px 18px" }} disabled={directBusy} onClick={() => void printDirect()}>
                    {directBusy ? "Printing… ಮುದ್ರಿಸುತ್ತಿದೆ" : `🖨️ Print on ${direct.name}`}
                  </button>
                  {dState === "ok" && <span className="bd-m">✅ Printed</span>}
                </div>
              )}
              {dState === "fail" && dErr && <div className="sp-msg">{dErr.en} · {dErr.kn}</div>}
              <SlipPrinterSetup shop={shop} compact={!!direct} onChange={(c) => setDirect(c)} />
            </>
          )}
          <div className="bd-row">
            <span className="bd-m small">Roll</span>
            {ROLLS.map((r) => (
              <button key={r.id} type="button" className={`bd-chip${r.id === size.id ? " on" : ""}`} onClick={() => save({ slip: r.id })}>{r.name}</button>
            ))}
          </div>
          <PrintCenter kind="slip" size={size} selector=".rc-portal .rc-slip" marginMm={lay.margin} count={1} label="Print" name={receiptName(doc)} saved={saved} onSave={save} autoPrint={!native && autoPrint && (sp.ready || !docIn.payDue)} onStart={() => { started.current = true; }} onFail={() => setHidden(false)} onDone={() => { onPrinted?.(); setState("ok"); if (autoPrint) setTimeout(onClose, 900); }} />
          <div className="bd-row"><ShareButton area=".rc-portal .rc-slip" className="bd-btn" title={receiptName(doc)} url={false} label="📤 Share receipt (WhatsApp, picture…)" /></div>
        </div>
        <div className="rc-preview">
          <ReceiptView doc={doc} shop={shop} widthMm={lay.inner} />
        </div>
      </div>
    </div>
    </>,
    document.body
  );
}
