"use client";

// Sales split view: bills of the day on the left (hour chart + All/Paid/Udhaar
// filters), the selected bill on the right. On a phone it is a list; tapping a
// bill opens its detail full-width with a Back button.
import { useCallback, useEffect, useMemo, useState } from "react";
import { businessDate, itemsFor, type RegisterConfigData } from "@/lib/register";
import { billTotals, filterBills, groupBills, hourBuckets, type Bill, type BillFilter, type SaleRow } from "@/lib/salesBills";
import { useLauncher } from "@/components/launcher/LauncherProvider";

const rs = (n: number) => "₹" + (Math.round(n * 100) / 100).toLocaleString("en-IN");
const clock = (ts: number) => new Date(ts).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" });
const hourLabel = (h: number) => `${h % 12 || 12}${h < 12 ? "a" : "p"}`;
const CH: Record<string, string> = { CASH: "Cash", UPI: "UPI", CREDIT: "Udhaar", OWNER_PHONEPE: "Owner PhonePe" };

interface DayData { entries: (SaleRow & { kind: string })[]; config: RegisterConfigData }

export default function SalesSplit() {
  const today = businessDate(Date.now());
  const [date, setDate] = useState(today);
  const [data, setData] = useState<DayData | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<BillFilter>("all");
  const [hour, setHour] = useState<number | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [mobileDetail, setMobileDetail] = useState(false);
  const { openPop } = useLauncher();

  const load = useCallback(async () => {
    setErr(null);
    try {
      const res = await fetch(`/api/register?date=${date}`, { cache: "no-store" });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Could not load");
      setData(j.data);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not load");
    }
  }, [date]);
  useEffect(() => { setData(null); setSel(null); setHour(null); load(); }, [load]);

  const bills = useMemo(() => {
    if (!data) return [];
    const nameOf = (r: SaleRow) => {
      if ((r as { totalSale?: boolean }).totalSale) return "Total sale";
      const it = itemsFor(r.kind as "SALE", data.config).find((i) => i.key === r.item);
      return it ? it.en : r.itemLabel || r.item || "Item";
    };
    return groupBills(data.entries, nameOf);
  }, [data]);
  const buckets = useMemo(() => hourBuckets(bills), [bills]);
  const shown = useMemo(() => filterBills(bills, filter, hour), [bills, filter, hour]);
  const tot = billTotals(shown);
  const all = billTotals(bills);
  const cur = shown.find((b) => b.id === sel) || (mobileDetail ? null : shown[0]) || null;
  const first = Math.max(0, Math.min(...buckets.map((v, i) => (v ? i : 24)), 8));
  const last = Math.min(23, Math.max(...buckets.map((v, i) => (v ? i : 0)), 20));
  const max = Math.max(...buckets, 1);

  const pop = (title: string, open: string) => openPop({ title, url: `/register?open=${open}&embed=1` });
  const waText = (b: Bill) =>
    encodeURIComponent(
      `Mahadev Traders — bill ${clock(b.at)}\n` +
        b.items.map((i) => `${i.name}${i.qty ? ` ${i.qty}${i.unit || ""}` : ""} — ${rs(i.amount)}`).join("\n") +
        `\nTotal ${rs(b.total)}` + (b.pending ? `\nPending ${rs(b.pending)}` : "\nPaid in full"),
    );

  return (
    <div className="hub ssp">
      <header className="hub-top">
        <div>
          <h1>🧾 Sales</h1>
          <div className="hub-m">Bills of the day — pick one to see the items, payment and what is pending.</div>
        </div>
        <nav className="hub-links">
          <a className="hub-btn" href="/register">📒 Quick Register</a>
          <a className="hub-btn" href="/">🗂️ Full desk</a>
        </nav>
      </header>

      <div className="stk-bar">
        <div className="stk-seg"><button className={date === today ? "on" : ""} onClick={() => setDate(today)}>Today</button></div>
        <input type="date" value={date} max={today} onChange={(e) => e.target.value && setDate(e.target.value)} aria-label="Date" />
        <button className="hub-btn" onClick={load}>↻ Refresh</button>
      </div>

      {err && <div className="ssp-err">⚠ {err}</div>}
      {!data && !err && <div className="hub-m">Loading…</div>}

      {data && (
        <div className={`ssp-wrap${mobileDetail ? " detail" : ""}`}>
          <section className="ssp-list">
            <div className="ssp-sum">
              <b>{rs(all.total)}</b> <span>{all.count} bills</span>
              {all.pending > 0 && <span className="ssp-udh">Udhaar {rs(all.pending)}</span>}
            </div>
            <div className="ssp-hours" role="group" aria-label="Sales by hour — tap a bar to filter">
              {buckets.map((v, h) => h < first || h > last ? null : (
                <button key={h} className={`ssp-hr${hour === h ? " on" : ""}`} onClick={() => setHour(hour === h ? null : h)} title={`${hourLabel(h)}: ${rs(v)}`} aria-pressed={hour === h}>
                  <i style={{ height: `${Math.max(v ? 8 : 2, (v / max) * 100)}%` }} />
                  <small>{hourLabel(h)}</small>
                </button>
              ))}
            </div>
            <div className="ssp-filters">
              {(["all", "paid", "udhaar"] as const).map((f) => (
                <button key={f} className={filter === f ? "on" : ""} onClick={() => setFilter(f)}>{f === "all" ? "All" : f === "paid" ? "Paid" : "Udhaar"}</button>
              ))}
              {hour !== null && <button className="clr" onClick={() => setHour(null)}>{hourLabel(hour)} ✕</button>}
              <span className="ssp-cnt">{tot.count} · {rs(tot.total)}</span>
            </div>
            <ul className="ssp-rows">
              {shown.map((b) => (
                <li key={b.id}>
                  <button className={`ssp-row ${b.status === "paid" ? "paid" : "udh"}${cur?.id === b.id ? " on" : ""}`} onClick={() => { setSel(b.id); setMobileDetail(true); }}>
                    <span className="t">{clock(b.at)}</span>
                    <span className="n">{b.party || (b.fresh ? "Fresh crush" : "Walk-in")}<small>{b.items.map((i) => i.name).join(", ")}</small></span>
                    <span className="a">{rs(b.total)}{b.pending > 0 && <small>{rs(b.pending)} due</small>}</span>
                  </button>
                </li>
              ))}
              {!shown.length && <li className="ssp-none">No bills here.</li>}
            </ul>
          </section>

          <section className="ssp-detail">
            {!cur ? <div className="ssp-none">Select a bill.</div> : (
              <div className="ssp-bill" id="ssp-print">
                <button className="ssp-back hub-btn" onClick={() => setMobileDetail(false)}>← Bills</button>
                <div className="ssp-bh">
                  <div>
                    <h2>{cur.party || (cur.fresh ? "Fresh crush" : "Walk-in customer")}</h2>
                    <div className="hub-m">{date} · {clock(cur.at)}{cur.notes ? ` · ${cur.notes}` : ""}</div>
                  </div>
                  <span className={`ssp-st ${cur.status}`}>{cur.status === "paid" ? "Paid" : cur.status === "udhaar" ? "Udhaar" : "Part paid"}</span>
                </div>
                <table className="ssp-tbl">
                  <thead><tr><th>Item</th><th>Qty</th><th>Rate</th><th>Amount</th></tr></thead>
                  <tbody>
                    {cur.items.map((i, k) => (
                      <tr key={k}><td>{i.name}</td><td>{i.qty ? `${i.qty} ${i.unit || ""}` : "—"}</td><td>{i.rate ? rs(i.rate) : "—"}</td><td>{rs(i.amount)}</td></tr>
                    ))}
                  </tbody>
                </table>
                <dl className="ssp-tot">
                  <div><dt>Total</dt><dd>{rs(cur.total)}</dd></div>
                  {cur.channels.filter((c) => c.channel !== "CREDIT").map((c) => <div key={c.channel}><dt>Paid · {CH[c.channel] || c.channel}</dt><dd>{rs(c.amount)}</dd></div>)}
                  <div className={cur.pending ? "due" : ""}><dt>Pending (udhaar)</dt><dd>{rs(cur.pending)}</dd></div>
                </dl>
                <div className="ssp-act">
                  <button className="hub-btn" onClick={() => window.print()}>🖨️ Print</button>
                  <a className="hub-btn" href={`https://wa.me/?text=${waText(cur)}`} target="_blank" rel="noreferrer">💬 WhatsApp</a>
                  <button className="hub-btn" onClick={() => pop("Refund (money out)", "payment")}>↩ Refund</button>
                  {cur.pending > 0 && <button className="hub-btn pri" onClick={() => pop("Collect udhaar", "udhaar")}>💰 Collect udhaar</button>}
                </div>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
