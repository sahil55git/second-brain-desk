"use client";

// 🧾 /purchase-orders — the order desk on its own page (it is also in Insights → Orders & suppliers).
// Loads six months of purchases so each order can fill itself and show the last rate paid.
import { useEffect, useMemo, useState } from "react";
import type { BizData } from "@/lib/bizReports";
import { businessDate } from "@/lib/register";
import PoDesk from "./PoDesk";
import "@/components/insights/insights.css";

const shift = (d: string, days: number) => new Date(new Date(`${d}T00:00:00Z`).getTime() + days * 86400000).toISOString().slice(0, 10);

export default function PoPage() {
  const today = useMemo(() => businessDate(Date.now()), []);
  const [data, setData] = useState<BizData | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    fetch(`/api/reports/hub?from=${shift(today, -180)}&to=${today}`)
      .then(async (r) => {
        const j = await r.json().catch(() => ({}));
        if (!r.ok || !j.data) throw new Error(j.error || "Could not load the figures.");
        setData(j.data);
      })
      .catch((e: Error) => setErr(e.message));
  }, [today]);
  return (
    <div className="hub ins">
      <header className="hub-top">
        <div><h1>🧾 Purchase orders</h1><div className="hub-m">Order from suppliers, send it on WhatsApp or as a link, and see what has arrived.</div></div>
      </header>
      {err && <div className="hub-banner ins-bad">{err}</div>}
      {!data && !err && <p className="hub-m">Loading…</p>}
      {data && <PoDesk d={data} today={today} />}
    </div>
  );
}
