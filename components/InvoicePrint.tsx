"use client";

// Printable GST invoice (erp-architecture-plan.md, Phase 2). Renders a clean
// invoice in a modal and prints just that node via window.print() + a
// print-only stylesheet — so it works today with any printer the browser can
// reach (A4 laser/inkjet, or an 80mm thermal roll if the OS print dialog is
// set to that paper size). A dedicated thermal ESC/POS driver and saved
// printer settings are a later step (see roadmap); this covers the common
// "print / save PDF" need now.
import ShareButton from "@/components/share/ShareButton";
import { useEffect, useState } from "react";
import ReceiptSheet from "@/components/print/ReceiptSheet";
import { EwayButton, InvoiceTaxBlock } from "@/components/InvoiceExtras";
import { billReceipt } from "@/lib/receipt";
import type { SalesInvoiceDTO, BusinessSettingsDTO, PartyDTO } from "@/lib/types";

export default function InvoicePrint({
  invoice,
  settings,
  party,
  onClose,
}: {
  invoice: SalesInvoiceDTO;
  settings: BusinessSettingsDTO | null;
  party: PartyDTO | null;
  onClose: () => void;
}) {
  const [roll, setRoll] = useState(false);
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !roll) onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, roll]);

  const tax = invoice.interState ? invoice.igstInr : invoice.cgstInr + invoice.sgstInr;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 flex items-start justify-center overflow-auto p-4 print:static print:bg-transparent print:p-0"
      onClick={onClose}
    >
      <div
        className="relative bg-white text-black w-full max-w-2xl rounded-lg shadow-xl my-8 print:my-0 print:shadow-none print:rounded-none"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Toolbar — hidden when printing */}
        <div className="flex items-center justify-between border-b px-4 py-2 print:hidden">
          <span className="text-sm font-medium text-gray-600">Invoice preview</span>
          <div className="flex gap-2">
            <button
              onClick={() => window.print()}
              className="rounded bg-gray-900 text-white px-3 py-1.5 text-sm font-medium"
            >
              Print A4 / Save PDF
            </button>
            <ShareButton area="#invoice-print-area" title="Invoice" url={false} className="rounded border border-black/20 px-3 py-1.5 text-sm font-medium" />
            <button onClick={() => setRoll(true)} className="rounded border px-3 py-1.5 text-sm font-medium" title="Print on the receipt printer (58 / 80 mm roll)">
              🧾 Roll receipt
            </button>
            <EwayButton invoice={invoice} settings={settings} party={party} />
            <button onClick={onClose} className="rounded border px-3 py-1.5 text-sm">
              Close
            </button>
          </div>
        </div>

        {/* The invoice itself */}
        <div id="invoice-print-area" className="p-6 text-sm">
          <div className="flex justify-between items-start mb-4">
            <div>
              <h1 className="text-lg font-bold">{settings?.businessName || "Second Brain Desk"}</h1>
              {settings?.address && <p className="text-xs text-gray-600">{settings.address}</p>}
              {settings?.gstin && <p className="text-xs text-gray-600">GSTIN: {settings.gstin}</p>}
              {settings?.phone && <p className="text-xs text-gray-600">Ph: {settings.phone}</p>}
            </div>
            <div className="text-right">
              <div className="font-semibold">TAX INVOICE</div>
              <div className="text-xs text-gray-600">{invoice.invoiceNo}</div>
              <div className="text-xs text-gray-600">{invoice.date}</div>
            </div>
          </div>

          <div className="border-t border-b py-2 mb-3">
            <div className="text-xs text-gray-500">Bill to</div>
            <div className="font-medium">{party?.name || invoice.party?.name || "—"}</div>
            {party?.gstin && <div className="text-xs text-gray-600">GSTIN: {party.gstin}</div>}
            {party?.address && <div className="text-xs text-gray-600">{party.address}</div>}
            {party?.state && <div className="text-xs text-gray-600">State: {party.state}</div>}
          </div>

          <table className="w-full text-xs mb-3">
            <thead>
              <tr className="border-b text-left text-gray-500">
                <th className="py-1">#</th>
                <th className="py-1">Item</th>
                <th className="py-1">HSN</th>
                <th className="py-1 text-right">Qty</th>
                <th className="py-1 text-right">Rate</th>
                <th className="py-1 text-right">GST%</th>
                <th className="py-1 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {invoice.lineItems.map((l, i) => (
                <tr key={l.id} className="border-b border-gray-100">
                  <td className="py-1">{i + 1}</td>
                  <td className="py-1">{l.name}</td>
                  <td className="py-1">{l.hsnCode || "—"}</td>
                  <td className="py-1 text-right">
                    {l.qty} {l.unit}
                  </td>
                  <td className="py-1 text-right">₹{l.rateInr.toFixed(2)}</td>
                  <td className="py-1 text-right">{l.gstRatePct}%</td>
                  <td className="py-1 text-right">₹{l.lineSubtotalInr.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="flex justify-end">
            <div className="w-56 text-xs space-y-1">
              <PrintRow label="Subtotal" value={invoice.subtotalInr} />
              {invoice.interState ? (
                <PrintRow label="IGST" value={invoice.igstInr} />
              ) : (
                <>
                  <PrintRow label="CGST" value={invoice.cgstInr} />
                  <PrintRow label="SGST" value={invoice.sgstInr} />
                </>
              )}
              <div className="border-t pt-1">
                <PrintRow label="Total" value={invoice.totalInr} bold />
              </div>
            </div>
          </div>

          <InvoiceTaxBlock invoice={invoice} settings={settings} />
          {invoice.notes && <p className="mt-3 text-xs text-gray-600">Note: {invoice.notes}</p>}
          <p className="mt-4 text-[10px] text-gray-400">
            {invoice.interState ? "Inter-state supply (IGST)" : "Intra-state supply (CGST + SGST)"} ·
            Payment: {invoice.paymentMode} · Tax ₹{tax.toFixed(2)}
          </p>
        </div>
      </div>

      {roll && (
        <ReceiptSheet
          onClose={() => setRoll(false)}
          doc={billReceipt({
            title: "TAX INVOICE",
            no: invoice.invoiceNo,
            date: invoice.date,
            party: party?.name || invoice.party?.name || undefined,
            lines: invoice.lineItems.map((l) => ({ name: l.name, qty: l.qty, unit: l.unit, rateInr: l.rateInr, discountPct: l.discountPct, totalInr: l.lineTotalInr })),
            subtotalInr: invoice.subtotalInr,
            cgstInr: invoice.cgstInr,
            sgstInr: invoice.sgstInr,
            igstInr: invoice.igstInr,
            totalInr: invoice.totalInr,
            paymentMode: invoice.paymentMode,
            notes: invoice.notes,
          })}
        />
      )}

      {/* Print-only: hide everything except the invoice area. */}
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #invoice-print-area, #invoice-print-area * { visibility: visible; }
          #invoice-print-area { position: absolute; left: 0; top: 0; width: 100%; }
        }
      `}</style>
    </div>
  );
}

function PrintRow({ label, value, bold }: { label: string; value: number; bold?: boolean }) {
  return (
    <div className={`flex justify-between ${bold ? "font-semibold" : "text-gray-700"}`}>
      <span>{label}</span>
      <span>₹{value.toFixed(2)}</span>
    </div>
  );
}
