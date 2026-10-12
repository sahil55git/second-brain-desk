"use client";

// "Collect first" hint on a Quick Register sale: when the customer typed
// already owes udhaar, show the balance so the counter can collect it before
// taking a new sale on credit. Read-only; it never changes the entry.
import { useEffect, useState } from "react";
import { udhaarFor, type UdhaarRow } from "@/lib/udhaarHint";

export default function UdhaarHint({ party }: { party: string }) {
  const [rows, setRows] = useState<UdhaarRow[]>([]);

  useEffect(() => {
    let live = true;
    fetch("/api/udhaar")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (live && j?.data?.rows) setRows(j.data.rows);
      })
      .catch(() => {
        /* the hint is optional; the entry works without it */
      });
    return () => {
      live = false;
    };
  }, []);

  const balance = udhaarFor(rows, party);
  if (balance === null) return null;
  return (
    <div role="status" className="mt-1 text-xs text-[var(--accent-ink)]">
      Udhaar ₹{balance.toLocaleString("en-IN")} owed · collect first?
    </div>
  );
}
