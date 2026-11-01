"use client";

// Extras on the printed GST invoice: HSN-wise tax summary, amount in words, a UPI "scan to pay"
// QR (when the shop's UPI id is set in Insights → Udhaar), and the e-way bill JSON for bills over
// ₹50,000. The e-way JSON is for upload at ewaybillgst.gov.in → Generate Bulk; check it there.
import { useEffect, useState } from "react";
import QrCode from "@/components/barrels/QrCode";
import { amountInWords, ewayJson, ewayNeeded, ewayProblems, hsnSummary, upiPay, validVpa } from "@/lib/money";
import type { BusinessSettingsDTO, PartyDTO, SalesInvoiceDTO } from "@/lib/types";

let shopCache: Promise<{ upi?: string; name?: string } | null> | null = null;
const loadShop = () => (shopCache ||= fetch("/api/settings/app?key=shop").then((r) => r.json()).then((j) => j.data || null).catch(() => null));

export function InvoiceTaxBlock({ invoice, settings }: { invoice: SalesInvoiceDTO; settings: BusinessSettingsDTO | null }) {
  const [vpa, setVpa] = useState<string | null>(null);
  useEffect(() => { void loadShop().then((s) => setVpa(validVpa(s?.upi) ? s!.upi!.trim() : null)); }, []);
  const rows = hsnSummary(invoice.lineItems, invoice.interState);
  const due = invoice.paymentMode !== "CASH";
  return (
    <div className="mt-3 text-xs">
      <table className="w-full mb-2">
        <thead>
          <tr className="border-b text-left text-gray-500">
            <th className="py-1">HSN</th><th className="py-1 text-right">Taxable</th>
            {invoice.interState ? <th className="py-1 text-right">IGST</th> : <><th className="py-1 text-right">CGST</th><th className="py-1 text-right">SGST</th></>}
            <th className="py-1 text-right">Total tax</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={`${r.hsn}-${r.rate}`} className="border-b border-gray-100">
              <td className="py-1">{r.hsn} @ {r.rate}%</td>
              <td className="py-1 text-right">₹{r.taxable.toFixed(2)}</td>
              {invoice.interState ? <td className="py-1 text-right">₹{r.igst.toFixed(2)}</td> : <><td className="py-1 text-right">₹{r.cgst.toFixed(2)}</td><td className="py-1 text-right">₹{r.sgst.toFixed(2)}</td></>}
              <td className="py-1 text-right">₹{r.tax.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex justify-between items-end gap-4">
        <div>
          <div className="font-medium">{amountInWords(invoice.totalInr)}</div>
          <div className="text-[10px] text-gray-500 mt-2">This is a computer-generated invoice.</div>
          <div className="mt-6 text-[10px]">For {settings?.businessName || "the business"} — Authorised signatory</div>
        </div>
        {vpa && due && (
          <div className="text-center">
            <QrCode value={upiPay(vpa, settings?.businessName || "Shop", invoice.totalInr, invoice.invoiceNo)} moduleSize={3} />
            <div className="text-[10px] text-gray-600">Scan to pay ₹{invoice.totalInr.toFixed(2)}<br />{vpa}</div>
          </div>
        )}
      </div>
    </div>
  );
}

export function EwayButton({ invoice, settings, party }: { invoice: SalesInvoiceDTO; settings: BusinessSettingsDTO | null; party: PartyDTO | null }) {
  const [open, setOpen] = useState(false);
  const [vehicleNo, setVehicle] = useState("");
  const [km, setKm] = useState("");
  if (!ewayNeeded(invoice.totalInr)) return null;
  const input = {
    invoice,
    seller: { gstin: settings?.gstin || null, businessName: settings?.businessName || "", address: settings?.address || null, state: settings?.state || null },
    buyer: { gstin: party?.gstin || null, name: party?.name || invoice.party?.name || "", address: party?.address || null, state: party?.state || invoice.partyStateSnapshot || null },
    transport: { vehicleNo, distanceKm: Number(km) || 0 },
  };
  const problems = ewayProblems(input);
  const save = () => {
    const blob = new Blob([JSON.stringify(ewayJson(input), null, 1)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `eway-${invoice.invoiceNo}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };
  return (
    <>
      <button onClick={() => setOpen(!open)} className="rounded border px-3 py-1.5 text-sm font-medium" title="Over ₹50,000 — e-way bill needed for transport">🚚 E-way bill</button>
      {open && (
        <div className="absolute right-4 top-12 z-10 w-72 rounded border bg-white p-3 text-xs shadow-lg space-y-2" onClick={(e) => e.stopPropagation()}>
          <div className="font-semibold">E-way bill JSON (bill over ₹50,000)</div>
          <input className="w-full rounded border px-2 py-1" placeholder="Vehicle no. e.g. KA38A1234" value={vehicleNo} onChange={(e) => setVehicle(e.target.value)} />
          <input className="w-full rounded border px-2 py-1" placeholder="Distance km" inputMode="numeric" value={km} onChange={(e) => setKm(e.target.value)} />
          {problems.length > 0 && <ul className="list-disc pl-4 text-red-700">{problems.map((p) => <li key={p}>{p}</li>)}</ul>}
          <button disabled={problems.length > 0} onClick={save} className="w-full rounded bg-gray-900 px-2 py-1.5 text-white disabled:opacity-40">⬇ Download JSON</button>
          <p className="text-gray-500">Upload at ewaybillgst.gov.in → e-Waybill → Generate Bulk. Check the details there before submitting.</p>
        </div>
      )}
    </>
  );
}
