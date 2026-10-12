"use client";

// Quick Register bill: several lines, a discount per line, hold and resume.
// Saves through /api/sales and /api/held-bills, the same routes the Sales desk
// uses, so a bill made here is an ordinary sale: stock, numbering and GST are
// the same. Holding never touches stock.

import { useEffect, useMemo, useState } from "react";
import { computeLine, computeTotals, gstTreatment, type GstLineInput } from "@/lib/gst";
import { blankLine, type DraftLine } from "@/lib/smartLines";
import { clampDiscount, type HeldDraft, type HeldLine } from "@/lib/billDraft";
import { formatInr } from "@/lib/globalSearch";
import { businessDate } from "@/lib/register";
import type { ItemDTO, PartyDTO } from "@/lib/types";

type Lang = "both" | "en" | "kn";
type PayMode = "CASH" | "UPI" | "BANK" | "CREDIT";
interface HeldRow {
  id: string;
  label: string;
  createdAt: string;
  draft: HeldDraft;
}

const toInput = (l: DraftLine): GstLineInput => ({
  qty: Number(l.qty) || 0,
  rateInr: Number(l.rateInr) || 0,
  gstRatePct: Number(l.gstRatePct) || 0,
  discountPct: clampDiscount(l.discountPct),
});

export default function BillSheet({
  lang,
  date,
  onSaved,
  toast,
}: {
  lang: Lang;
  date?: string;
  onSaved: (msg: string) => void;
  toast: (msg: string) => void;
}) {
  // Bilingual labels, shown in the register's chosen language mode.
  const T = (en: string, kn: string) => (lang === "kn" ? kn : lang === "en" ? en : `${en} · ${kn}`);

  const [parties, setParties] = useState<PartyDTO[]>([]);
  const [items, setItems] = useState<ItemDTO[]>([]);
  const [bizState, setBizState] = useState<string | null>(null);
  const [held, setHeld] = useState<HeldRow[]>([]);
  const [partyId, setPartyId] = useState("");
  const [mode, setMode] = useState<PayMode>("CASH");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([blankLine()]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const billDate = date || businessDate(Date.now());

  const loadHeld = () =>
    fetch("/api/held-bills")
      .then((r) => r.json())
      .then((j) => setHeld(j.data ?? []))
      .catch(() => setHeld([]));

  useEffect(() => {
    Promise.all([
      fetch("/api/parties").then((r) => r.json()),
      fetch("/api/items").then((r) => r.json()),
      fetch("/api/settings").then((r) => r.json()),
    ])
      .then(([p, i, s]) => {
        setParties((p.data ?? []).filter((x: PartyDTO) => x.type !== "SUPPLIER"));
        setItems((i.data ?? []).filter((x: ItemDTO) => x.active !== false));
        setBizState(s.data?.state ?? null);
      })
      .catch(() => setError(T("Could not load customers and items.", "ಗ್ರಾಹಕರು ಮತ್ತು ವಸ್ತುಗಳನ್ನು ಲೋಡ್ ಮಾಡಲಾಗಲಿಲ್ಲ.")));
    loadHeld();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const party = parties.find((p) => p.id === partyId);
  const clean = lines.filter((l) => (Number(l.qty) || 0) > 0 && l.name.trim());
  const totals = useMemo(
    () => computeTotals(clean.map(toInput), gstTreatment(bizState, party?.state)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lines, bizState, party?.state]
  );

  const setLine = (idx: number, patch: Partial<DraftLine>) =>
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));

  const pickItem = (idx: number, itemId: string) => {
    const item = items.find((i) => i.id === itemId);
    setLine(idx, {
      itemId,
      name: item ? item.name : "",
      hsnCode: item?.hsnCode || "",
      unit: item?.unit || "kg",
      gstRatePct: item?.gstRatePct != null ? String(item.gstRatePct) : "",
    });
  };

  const clearForm = () => {
    setPartyId("");
    setMode("CASH");
    setNotes("");
    setLines([blankLine()]);
  };

  async function save() {
    setError(null);
    if (!partyId) return setError(T("Choose a customer.", "ಗ್ರಾಹಕರನ್ನು ಆಯ್ಕೆ ಮಾಡಿ."));
    if (clean.length === 0) return setError(T("Add at least one line with a name and quantity.", "ಹೆಸರು ಮತ್ತು ಪ್ರಮಾಣದೊಂದಿಗೆ ಕನಿಷ್ಠ ಒಂದು ಸಾಲು ಸೇರಿಸಿ."));
    setBusy(true);
    try {
      const res = await fetch("/api/sales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          partyId,
          date: billDate,
          paymentMode: mode,
          notes: notes.trim() || null,
          lineItems: clean.map((l) => ({
            itemId: l.itemId || null,
            name: l.name.trim(),
            hsnCode: l.hsnCode || null,
            qty: Number(l.qty) || 0,
            unit: l.unit || "kg",
            rateInr: Number(l.rateInr) || 0,
            gstRatePct: l.gstRatePct === "" ? null : Number(l.gstRatePct),
            discountPct: clampDiscount(l.discountPct),
          })),
        }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || T("Could not save the bill.", "ಬಿಲ್ ಉಳಿಸಲಾಗಲಿಲ್ಲ."));
      clearForm();
      onSaved(T("Bill saved", "ಬಿಲ್ ಉಳಿಸಲಾಯಿತು"));
    } catch (e) {
      setError(e instanceof Error ? e.message : T("Could not save the bill.", "ಬಿಲ್ ಉಳಿಸಲಾಗಲಿಲ್ಲ."));
    } finally {
      setBusy(false);
    }
  }

  async function hold() {
    setError(null);
    if (clean.length === 0) return setError(T("Add at least one line before holding.", "ಹಿಡಿದಿಡುವ ಮೊದಲು ಕನಿಷ್ಠ ಒಂದು ಸಾಲು ಸೇರಿಸಿ."));
    const draft: HeldDraft = {
      partyId,
      date: billDate,
      paymentMode: mode,
      notes,
      lines: clean.map(
        (l): HeldLine => ({
          itemId: l.itemId,
          name: l.name,
          hsnCode: l.hsnCode,
          qty: l.qty,
          unit: l.unit,
          rateInr: l.rateInr,
          gstRatePct: l.gstRatePct,
          discountPct: String(clampDiscount(l.discountPct)),
        })
      ),
    };
    setBusy(true);
    try {
      const res = await fetch("/api/held-bills", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draft }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || T("Could not hold the bill.", "ಬಿಲ್ ಹಿಡಿದಿಡಲಾಗಲಿಲ್ಲ."));
      clearForm();
      toast(T("Bill held", "ಬಿಲ್ ಹಿಡಿದಿಡಲಾಯಿತು"));
      loadHeld();
    } catch (e) {
      setError(e instanceof Error ? e.message : T("Could not hold the bill.", "ಬಿಲ್ ಹಿಡಿದಿಡಲಾಗಲಿಲ್ಲ."));
    } finally {
      setBusy(false);
    }
  }

  async function resume(h: HeldRow) {
    setError(null);
    if (clean.length > 0 || partyId) {
      return setError(T("Save or hold the current bill first.", "ಪ್ರಸ್ತುತ ಬಿಲ್ ಉಳಿಸಿ ಅಥವಾ ಹಿಡಿದಿಡಿ."));
    }
    setPartyId(h.draft.partyId || "");
    setMode(h.draft.paymentMode === "UPI" || h.draft.paymentMode === "BANK" || h.draft.paymentMode === "CREDIT" ? h.draft.paymentMode : "CASH");
    setNotes(h.draft.notes || "");
    setLines(h.draft.lines.map((l) => ({ ...blankLine(), ...l })));
    await discard(h.id);
  }

  async function discard(id: string) {
    await fetch(`/api/held-bills/${id}`, { method: "DELETE" });
    loadHeld();
  }

  const inp = "rounded border px-2 py-1 text-sm w-full";

  return (
    <div className="space-y-4 text-sm">
      {error && <p className="text-red-600">{error}</p>}

      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block">
          <span className="opacity-70">{T("Customer", "ಗ್ರಾಹಕ")}</span>
          <select className={inp} value={partyId} onChange={(e) => setPartyId(e.target.value)}>
            <option value="">{T("Choose…", "ಆಯ್ಕೆ ಮಾಡಿ…")}</option>
            {parties.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <div>
          <span className="opacity-70">{T("Payment", "ಪಾವತಿ")}</span>
          <div className="mt-1 flex flex-wrap gap-2">
            {(["CASH", "UPI", "BANK", "CREDIT"] as PayMode[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={`rounded px-3 py-1 ${mode === m ? "bg-[var(--accent)] text-[var(--accent-contrast)]" : "border"}`}
              >
                {m}
              </button>
            ))}
          </div>
        </div>
        <label className="block">
          <span className="opacity-70">{T("Note", "ಟಿಪ್ಪಣಿ")}</span>
          <input className={inp} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>
      </div>

      <div className="space-y-2">
        {lines.map((l, idx) => {
          const lt = clean.includes(l) ? computeLine(toInput(l)).lineTotalInr : 0;
          return (
            <div key={idx} className="grid grid-cols-2 gap-2 rounded border p-2 sm:grid-cols-7">
              <select className={inp + " col-span-2"} value={l.itemId} onChange={(e) => pickItem(idx, e.target.value)}>
                <option value="">{T("Item (or type below)", "ವಸ್ತು (ಅಥವಾ ಕೆಳಗೆ ಬರೆಯಿರಿ)")}</option>
                {items.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name}
                  </option>
                ))}
              </select>
              <input className={inp + " col-span-2"} placeholder={T("Name", "ಹೆಸರು")} value={l.name} onChange={(e) => setLine(idx, { name: e.target.value })} />
              <input className={inp} inputMode="decimal" placeholder={T("Qty", "ಪ್ರಮಾಣ")} value={l.qty} onChange={(e) => setLine(idx, { qty: e.target.value })} />
              <input className={inp} inputMode="decimal" placeholder={T("Rate", "ದರ")} value={l.rateInr} onChange={(e) => setLine(idx, { rateInr: e.target.value })} />
              <input className={inp} inputMode="decimal" placeholder={T("Disc %", "ರಿಯಾಯಿತಿ %")} value={l.discountPct ?? ""} onChange={(e) => setLine(idx, { discountPct: e.target.value })} />
              <div className="flex items-center justify-between gap-2">
                <span>{lt ? formatInr(lt) : ""}</span>
                <button type="button" className="opacity-60" onClick={() => setLines((p) => p.filter((_, i) => i !== idx))} aria-label={T("Remove line", "ಸಾಲು ತೆಗೆ")}>
                  ✕
                </button>
              </div>
            </div>
          );
        })}
        <button type="button" className="rounded border px-3 py-1" onClick={() => setLines((p) => [...p, blankLine()])}>
          + {T("Add line", "ಸಾಲು ಸೇರಿಸಿ")}
        </button>
      </div>

      <div className="flex flex-wrap gap-4">
        <span>{T("Subtotal", "ಉಪಮೊತ್ತ")}: <strong>{formatInr(totals.subtotalInr)}</strong></span>
        {totals.cgstInr > 0 && <span>CGST+SGST: <strong>{formatInr(totals.cgstInr + totals.sgstInr)}</strong></span>}
        {totals.igstInr > 0 && <span>IGST: <strong>{formatInr(totals.igstInr)}</strong></span>}
        <span>{T("Total", "ಒಟ್ಟು")}: <strong>{formatInr(totals.totalInr)}</strong></span>
      </div>

      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={busy} onClick={save} className="rounded bg-[var(--accent)] px-4 py-2 font-semibold text-[var(--accent-contrast)] disabled:opacity-50">
          {T("Save bill", "ಬಿಲ್ ಉಳಿಸಿ")}
        </button>
        <button type="button" disabled={busy} onClick={hold} className="rounded border px-4 py-2 disabled:opacity-50">
          {T("Hold bill", "ಬಿಲ್ ಹಿಡಿದಿಡಿ")}
        </button>
      </div>

      {held.length > 0 && (
        <div className="space-y-2 border-t pt-3">
          <p className="font-semibold">{T("Held bills", "ಹಿಡಿದಿಟ್ಟ ಬಿಲ್‌ಗಳು")}</p>
          {held.map((h) => (
            <div key={h.id} className="flex flex-wrap items-center justify-between gap-2 rounded border p-2">
              <span>
                {h.label} · {h.draft.lines.length} {T("lines", "ಸಾಲುಗಳು")}
              </span>
              <span className="flex gap-2">
                <button type="button" className="rounded border px-3 py-1" onClick={() => resume(h)}>
                  {T("Resume", "ಮುಂದುವರಿಸಿ")}
                </button>
                <button type="button" className="rounded border px-3 py-1 opacity-70" onClick={() => discard(h.id)}>
                  {T("Discard", "ತಿರಸ್ಕರಿಸಿ")}
                </button>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
