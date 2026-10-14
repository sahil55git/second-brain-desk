"use client";

// A weight typed straight into a table column (lot table, register): one box and one button.
// It uses the same save route as the Weigh tab, marked "typed" with a short reason.
import { useState } from "react";
import { api, type BarrelRow, type Lot } from "@/components/barrels/shared";
import type { Phase } from "@/lib/barrels";

export default function WeightCell({ code, phase, onDone }: { code: string; phase: Phase; onDone: (j: { data: Lot; barrel: BarrelRow; kg: number }) => void }) {
  const [v, setV] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const n = Number(v.trim().replace(",", "."));
  const save = async () => {
    if (!(n > 0)) return setErr("Type the weight in kg.");
    setBusy(true);
    setErr(null);
    try {
      const j = await api<{ data: Lot; barrel: BarrelRow; kg: number }>("/api/barrels/weigh", {
        method: "POST",
        json: { code, phase, source: "MANUAL", kg: n, note: "Typed in the table" },
      });
      onDone(j);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <span className="bd-wcell" onClick={(e) => e.stopPropagation()}>
      <input
        inputMode="decimal"
        placeholder={phase === "GROSS" ? "full kg" : "empty kg"}
        value={v}
        onChange={(e) => setV(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && save()}
        aria-label={phase === "GROSS" ? "Full barrel weight in kg" : "Empty barrel weight in kg"}
      />
      <button className="bd-btn" disabled={busy} onClick={save}>
        {busy ? "…" : "Save"}
      </button>
      {err && <span className="bd-bad tiny">{err}</span>}
    </span>
  );
}
