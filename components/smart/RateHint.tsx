"use client";

import { rateHistory } from "@/lib/smartEntry";
import type { DraftLine } from "@/lib/smartLines";

/** "last ₹156 · 05 Oct (this supplier)" under the rate box — tap to use it. */
export default function RateHint({ bills, line, partyId, onUse, label = "last" }: { bills: { date: string; partyId: string; party?: { name: string } | null; lineItems: { itemId: string | null; name: string; qty: number; rateInr: number }[] }[]; line: DraftLine; partyId?: string; onUse?: (rate: number) => void; label?: string }) {
  if (!line.itemId && !line.name.trim()) return null;
  const key = { itemId: line.itemId || null, name: line.name };
  const mine = partyId ? rateHistory(bills, key, partyId)[0] : undefined;
  const any = mine ?? rateHistory(bills, key)[0];
  if (!any) return null;
  const d = new Date(any.date + "T12:00:00").toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
  const text = `${label} ₹${any.rate} · ${d}${mine ? "" : any.party ? ` (${any.party.split(" ")[0]})` : ""}`;
  if (!onUse) return <span className="text-[11px] opacity-70" title={any.party ?? ""}>{text}</span>;
  return (
    <button type="button" onClick={() => onUse(any.rate)} className="text-[11px] text-left text-[var(--accent-ink)] underline decoration-dotted" title={`Use this rate${any.party ? ` (${any.party})` : ""}`}>
      {text}
    </button>
  );
}
