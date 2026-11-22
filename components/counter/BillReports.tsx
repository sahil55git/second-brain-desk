"use client";

// Reports tab of the Bills page: pick the dates once, see the headline numbers, then open any report.
// Simple on purpose: five big numbers on top, report chips under them, one clean list below, Excel for each.
import { useEffect, useMemo, useState } from "react";
import type { SavedBill } from "@/lib/counterRecords";
import { cancelledBills, customerWise, dayWise, discountBills, heldBills, hourWise, itemWise, pendingBills, presetRange, staffWise, totals, udhaarDue, type AuditLite, type CancelRow } from "@/lib/billReports";
import { waitText } from "@/lib/counterTrack";
import { rupees } from "@/lib/receipt";
import "./billReports.css";

type Rep = "days" | "items" | "pay" | "disc" | "pend" | "held" | "cust" | "staff" | "hours" | "cancel";
type Preset = "today" | "yesterday" | "7d" | "30d" | "month" | "lastMonth";

const REPORTS: { id: Rep; icon: string; en: string; kn: string }[] = [
  { id: "days", icon: "📈", en: "Sales by day", kn: "ದಿನದ ಮಾರಾಟ" },
  { id: "items", icon: "🛢️", en: "Item-wise", kn: "ವಸ್ತುವಾರು" },
  { id: "pay", icon: "💳", en: "Payments", kn: "ಪಾವತಿ" },
  { id: "pend", icon: "⏳", en: "Pending payment", kn: "ಹಣ ಬಾಕಿ" },
  { id: "held", icon: "🔒", en: "Oil held", kn: "ಎಣ್ಣೆ ಹಿಡಿದಿದೆ" },
  { id: "disc", icon: "🏷️", en: "Discounts", kn: "ರಿಯಾಯಿತಿ" },
  { id: "cancel", icon: "🚫", en: "Cancelled", kn: "ರದ್ದಾದ ಬಿಲ್" },
  { id: "cust", icon: "👥", en: "Customers", kn: "ಗ್ರಾಹಕರು" },
  { id: "staff", icon: "🧑‍💼", en: "Staff", kn: "ಸಿಬ್ಬಂದಿ" },
  { id: "hours", icon: "🕒", en: "Busy hours", kn: "ಬಿಜಿ ಸಮಯ" },
];
const PRESETS: { id: Preset; en: string; kn: string }[] = [
  { id: "today", en: "Today", kn: "ಇಂದು" },
  { id: "yesterday", en: "Yesterday", kn: "ನಿನ್ನೆ" },
  { id: "7d", en: "7 days", kn: "7 ದಿನ" },
  { id: "30d", en: "30 days", kn: "30 ದಿನ" },
  { id: "month", en: "This month", kn: "ಈ ತಿಂಗಳು" },
  { id: "lastMonth", en: "Last month", kn: "ಹಿಂದಿನ ತಿಂಗಳು" },
];

const kgText = (n: number) => `${n.toFixed(3).replace(/\.?0+$/, "") || "0"} kg`;
const dayText = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-IN", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short" });
const clock = (iso: string) => new Date(iso).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit" });
const hourText = (h: number) => `${h % 12 || 12} ${h < 12 ? "am" : "pm"}`;

function download(name: string, rows: (string | number)[][]) {
  const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv" }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

export default function BillReports({
  bills, k, from, to, today, onRange, returned, modeName, error, dashboard = false, onOpenReport,
}: {
  bills: SavedBill[];
  dashboard?: boolean;
  onOpenReport?: () => void;
  k: (en: string, ka: string) => string;
  from: string;
  to: string;
  today: string;
  onRange: (from: string, to: string) => void;
  returned: number;
  modeName: (m: string) => string;
  error?: string;
}) {
  const [rep, setRep] = useState<Rep>("days");
  const open = (report: Rep) => { setRep(report); onOpenReport?.(); };
  const [custom, setCustom] = useState(false);
  const t = useMemo(() => totals(bills), [bills]);
  const active = (Object.keys(Object.fromEntries(PRESETS.map((p) => [p.id, 1]))) as Preset[]).find((p) => {
    const r = presetRange(p, today);
    return r.from === from && r.to === to;
  });
  const range = from === to ? dayText(from) : `${dayText(from)} → ${dayText(to)}`;
  const file = (n: string) => `counter-${n}_${from}_${to}.csv`;

  // cancelled bills: the owner's activity log (the server only gives it to the owner)
  const [canc, setCanc] = useState<CancelRow[] | null>(null);
  const [cancErr, setCancErr] = useState("");
  useEffect(() => {
    if (rep !== "cancel") return;
    let stop = false;
    setCanc(null);
    setCancErr("");
    fetch(`/api/audit?entity=RegisterEntry&from=${from}&to=${to}&limit=1000`, { cache: "no-store" })
      .then(async (r) => {
        const j = await r.json().catch(() => ({}));
        if (stop) return;
        if (r.status === 401 || r.status === 403) return setCancErr(k("Only the owner can see cancelled bills.", "ರದ್ದಾದ ಬಿಲ್‌ಗಳನ್ನು ಮಾಲೀಕರು ಮಾತ್ರ ನೋಡಬಹುದು."));
        if (!r.ok) return setCancErr(j.error || k("Could not load.", "ಲೋಡ್ ಆಗಲಿಲ್ಲ."));
        setCanc(cancelledBills((j.data || []) as AuditLite[]));
      })
      .catch(() => !stop && setCancErr(k("Could not load.", "ಲೋಡ್ ಆಗಲಿಲ್ಲ.")));
    return () => { stop = true; };
  }, [rep, from, to]); // eslint-disable-line react-hooks/exhaustive-deps

  const Bar = ({ v, max, tone = "" }: { v: number; max: number; tone?: string }) => (
    <i className={`rpt-bar ${tone}`} aria-hidden><b style={{ width: `${max > 0 ? Math.max(2, Math.round((v / max) * 100)) : 0}%` }} /></i>
  );
  const Empty = () => <p className="rpt-empty">{k("Nothing here for these dates.", "ಈ ದಿನಾಂಕಗಳಿಗೆ ಏನೂ ಇಲ್ಲ.")}</p>;
  const Foot = ({ children, onCsv }: { children?: React.ReactNode; onCsv: () => void }) => (
    <div className="rpt-foot"><span>{children}</span><button type="button" onClick={onCsv}>⬇ Excel</button></div>
  );

  const body = () => {
    if (rep === "days") {
      const rows = dayWise(bills);
      const max = Math.max(0, ...rows.map((r) => r.total));
      return rows.length ? (
        <>
          <ul className="rpt-list">
            {rows.map((r) => (
              <li key={r.date}>
                <div className="l"><b>{dayText(r.date)}</b><small>{r.bills} {k("bills", "ಬಿಲ್")} · {kgText(r.kg)}{r.discount > 0 ? ` · ${k("discount", "ರಿಯಾಯಿತಿ")} ${rupees(r.discount)}` : ""}</small></div>
                <Bar v={r.total} max={max} />
                <b className="v">{rupees(r.total)}</b>
              </li>
            ))}
          </ul>
          <Foot onCsv={() => download(file("sales-by-day"), [["Date", "Bills", "Kg", "Discount", "Sales"], ...rows.map((r) => [r.date, r.bills, r.kg, r.discount, r.total])])}>
            {k("Total", "ಒಟ್ಟು")} <b>{rupees(t.sales)}</b>
          </Foot>
        </>
      ) : <Empty />;
    }
    if (rep === "items") {
      const rows = itemWise(bills);
      const max = Math.max(0, ...rows.map((r) => r.amount));
      return rows.length ? (
        <>
          <ul className="rpt-list">
            {rows.map((r) => (
              <li key={r.key}>
                <div className="l"><b>{r.label}</b><small>{r.unit === "kg" ? kgText(r.qty) : `${r.qty} ${r.unit}`} · {r.bills} {k("bills", "ಬಿಲ್")}{r.avgRate > 0 ? ` · ${k("avg", "ಸರಾಸರಿ")} ${rupees(r.avgRate)}/${r.unit || "unit"}` : ""}</small></div>
                <Bar v={r.amount} max={max} />
                <b className="v">{rupees(r.amount)}<small>{r.share}%</small></b>
              </li>
            ))}
          </ul>
          <Foot onCsv={() => download(file("item-wise"), [["Item", "Unit", "Qty", "Bills", "Avg rate", "Amount", "Share %"], ...rows.map((r) => [r.label, r.unit, r.qty, r.bills, r.avgRate, r.amount, r.share])])}>
            {rows.length} {k("items", "ವಸ್ತುಗಳು")} · <b>{rupees(t.sales)}</b>
          </Foot>
        </>
      ) : <Empty />;
    }
    if (rep === "pay") {
      const entries = Object.entries(t.modes).sort((a, b) => b[1] - a[1]);
      const max = Math.max(0, ...entries.map(([, v]) => v));
      const ud = udhaarDue(bills);
      return entries.length ? (
        <>
          <ul className="rpt-list">
            {entries.map(([m, v]) => (
              <li key={m}>
                <div className="l"><b>{modeName(m)}</b><small>{t.sales > 0 ? Math.round((v / t.sales) * 100) : 0}% {k("of sales", "ಮಾರಾಟದ")}</small></div>
                <Bar v={v} max={max} tone={m === "PENDING" ? "warn" : ""} />
                <b className="v">{rupees(v)}</b>
              </li>
            ))}
          </ul>
          {ud.length > 0 && (
            <>
              <h5 className="rpt-h">📒 {k("Udhaar still to collect", "ಉದ್ರಿ ಇನ್ನೂ ಬರಬೇಕು")}</h5>
              <ul className="rpt-list">
                {ud.map((u) => <li key={u.name}><div className="l"><b>{u.name}</b><small>{u.bills} {k("bills", "ಬಿಲ್")}</small></div><b className="v bad">{rupees(u.due)}</b></li>)}
              </ul>
            </>
          )}
          <Foot onCsv={() => download(file("payments"), [["Mode", "Amount"], ...entries.map(([m, v]) => [modeName(m), v]), [], ["Udhaar due", "Amount"], ...ud.map((u) => [u.name, u.due])])}>
            {k("To collect", "ಬರಬೇಕಾದದ್ದು")} <b>{rupees(t.pending)}</b>
          </Foot>
        </>
      ) : <Empty />;
    }
    if (rep === "pend") {
      const rows = pendingBills(bills);
      const sum = rows.reduce((a, r) => a + r.due, 0);
      return rows.length ? (
        <>
          <ul className="rpt-list">
            {rows.map((r) => (
              <li key={r.bill.key}>
                <div className="l"><b>#{r.bill.no} · {r.bill.party || k("Walk-in", "ವಾಕ್-ಇನ್")}</b><small>{r.bill.date} {clock(r.bill.createdAt)} · {r.udhaar ? `📒 ${k("udhaar", "ಉದ್ರಿ")}` : `⏳ ${waitText(r.waitingMs)}`}</small></div>
                <b className="v bad">{rupees(r.due)}</b>
              </li>
            ))}
          </ul>
          <Foot onCsv={() => download(file("pending-payment"), [["Bill", "Date", "Time", "Customer", "Due", "Type"], ...rows.map((r) => [r.bill.no, r.bill.date, clock(r.bill.createdAt), r.bill.party || "", r.due, r.udhaar ? "Udhaar" : "Pending"])])}>
            {rows.length} {k("bills", "ಬಿಲ್")} · <b>{rupees(sum)}</b>
          </Foot>
        </>
      ) : <p className="rpt-empty ok">✓ {k("No pending payment. All money is in.", "ಬಾಕಿ ಹಣ ಇಲ್ಲ.")}</p>;
    }
    if (rep === "held") {
      const rows = heldBills(bills);
      return rows.length ? (
        <>
          <ul className="rpt-list">
            {rows.map((r) => (
              <li key={r.bill.key}>
                <div className="l"><b>#{r.bill.no} · {r.bill.party || k("Walk-in", "ವಾಕ್-ಇನ್")}</b><small>{r.bill.lines.map((l) => l.label).join(", ")} · ⏳ {waitText(r.waitingMs)}</small></div>
                <b className="v">{rupees(r.bill.total)}<small className={r.blocked > 0 ? "bad" : "ok"}>{r.blocked > 0 ? `${k("money due", "ಹಣ ಬಾಕಿ")} ${rupees(r.blocked)}` : k("ready to give", "ಕೊಡಲು ಸಿದ್ಧ")}</small></b>
              </li>
            ))}
          </ul>
          <Foot onCsv={() => download(file("oil-held"), [["Bill", "Date", "Time", "Customer", "Items", "Total", "Money due"], ...rows.map((r) => [r.bill.no, r.bill.date, clock(r.bill.createdAt), r.bill.party || "", r.bill.lines.map((l) => l.label).join("; "), r.bill.total, r.blocked])])}>
            {rows.length} {k("bills waiting for oil to be given", "ಬಿಲ್‌ಗಳಲ್ಲಿ ಎಣ್ಣೆ ಕೊಡಬೇಕು")}
          </Foot>
        </>
      ) : <p className="rpt-empty ok">✓ {k("No oil is held. Everything is given.", "ಹಿಡಿದ ಎಣ್ಣೆ ಇಲ್ಲ.")}</p>;
    }
    if (rep === "disc") {
      const rows = discountBills(bills);
      const sum = rows.reduce((a, r) => a + r.total, 0);
      return rows.length ? (
        <>
          <ul className="rpt-list">
            {rows.map((r) => (
              <li key={r.bill.key}>
                <div className="l"><b>#{r.bill.no} · {r.bill.party || k("Walk-in", "ವಾಕ್-ಇನ್")}</b><small>{r.bill.date} {clock(r.bill.createdAt)}{r.bill.by ? ` · ${r.bill.by}` : ""} · {k("bill", "ಬಿಲ್")} {rupees(r.bill.total)}{r.item > 0 ? ` · ${k("item", "ವಸ್ತು")} ${rupees(r.item)}` : ""}{r.billDisc > 0 ? ` · ${k("whole bill", "ಇಡೀ ಬಿಲ್")} ${rupees(r.billDisc)}` : ""}</small></div>
                <b className="v">−{rupees(r.total)}<small>{r.pct}%</small></b>
              </li>
            ))}
          </ul>
          <Foot onCsv={() => download(file("discounts"), [["Bill", "Date", "Customer", "By", "Bill total", "Item discount", "Bill discount", "Total discount", "%"], ...rows.map((r) => [r.bill.no, r.bill.date, r.bill.party || "", r.bill.by || "", r.bill.total, r.item, r.billDisc, r.total, r.pct])])}>
            {rows.length} {k("bills", "ಬಿಲ್")} · {k("given", "ಕೊಟ್ಟದ್ದು")} <b>{rupees(sum)}</b>
          </Foot>
        </>
      ) : <p className="rpt-empty ok">✓ {k("No discount given in these dates.", "ರಿಯಾಯಿತಿ ಕೊಟ್ಟಿಲ್ಲ.")}</p>;
    }
    if (rep === "cancel") {
      if (cancErr) return <p className="rpt-empty">{cancErr}</p>;
      if (!canc) return <p className="rpt-empty">…</p>;
      const real = canc.filter((c) => !c.edited);
      const edited = canc.filter((c) => c.edited);
      const sum = real.reduce((a, c) => a + c.amount, 0);
      const row = (c: CancelRow) => (
        <li key={c.id}>
          <div className="l"><b>#{c.bill || "—"}{c.party ? ` · ${c.party}` : ""}</b><small>{new Date(c.at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} · {c.by}{c.reason ? ` · “${c.reason}”` : ""}</small></div>
          <b className="v">{rupees(c.amount)}</b>
        </li>
      );
      return canc.length ? (
        <>
          {real.length > 0 ? <ul className="rpt-list">{real.map(row)}</ul> : <p className="rpt-empty ok">✓ {k("No bill was cancelled.", "ಯಾವ ಬಿಲ್ ರದ್ದಾಗಿಲ್ಲ.")}</p>}
          {edited.length > 0 && (
            <>
              <h5 className="rpt-h">✏️ {k("Edited and saved again", "ತಿದ್ದಿ ಮತ್ತೆ ಉಳಿಸಿದ್ದು")} ({edited.length})</h5>
              <ul className="rpt-list soft">{edited.map(row)}</ul>
            </>
          )}
          <Foot onCsv={() => download(file("cancelled"), [["When", "By", "Bill", "Customer", "Amount", "Reason", "Type"], ...canc.map((c) => [c.at, c.by, c.bill, c.party, c.amount, c.reason, c.edited ? "Edited" : "Cancelled"])])}>
            {real.length} {k("cancelled", "ರದ್ದು")} · <b>{rupees(sum)}</b>
          </Foot>
          <p className="rpt-note">{k("Shown by the date it was cancelled.", "ರದ್ದು ಮಾಡಿದ ದಿನಾಂಕದಂತೆ ತೋರಿಸಲಾಗಿದೆ.")}</p>
        </>
      ) : <p className="rpt-empty ok">✓ {k("No bill was cancelled.", "ಯಾವ ಬಿಲ್ ರದ್ದಾಗಿಲ್ಲ.")}</p>;
    }
    if (rep === "cust" || rep === "staff") {
      const rows = rep === "cust" ? customerWise(bills, k("Walk-in", "ವಾಕ್-ಇನ್")) : staffWise(bills);
      const max = Math.max(0, ...rows.map((r) => r.total));
      return rows.length ? (
        <>
          <ul className="rpt-list">
            {rows.map((r) => (
              <li key={r.name}>
                <div className="l"><b>{r.name}</b><small>{r.bills} {k("bills", "ಬಿಲ್")} · {kgText(r.kg)}</small></div>
                <Bar v={r.total} max={max} />
                <b className="v">{rupees(r.total)}<small>{r.share}%</small></b>
              </li>
            ))}
          </ul>
          <Foot onCsv={() => download(file(rep === "cust" ? "customers" : "staff"), [[rep === "cust" ? "Customer" : "Staff", "Bills", "Kg", "Sales", "Share %"], ...rows.map((r) => [r.name, r.bills, r.kg, r.total, r.share])])}>
            {rows.length} {rep === "cust" ? k("customers", "ಗ್ರಾಹಕರು") : k("people", "ಜನ")}
          </Foot>
        </>
      ) : <Empty />;
    }
    const rows = hourWise(bills);
    const max = Math.max(0, ...rows.map((r) => r.total));
    const best = rows.reduce((a, r) => (r.total > (a?.total ?? -1) ? r : a), undefined as (typeof rows)[number] | undefined);
    return rows.length ? (
      <>
        <ul className="rpt-list">
          {rows.map((r) => (
            <li key={r.hour}>
              <div className="l"><b>{hourText(r.hour)}</b><small>{r.bills} {k("bills", "ಬಿಲ್")}</small></div>
              <Bar v={r.total} max={max} tone={best && r.hour === best.hour ? "best" : ""} />
              <b className="v">{rupees(r.total)}</b>
            </li>
          ))}
        </ul>
        <Foot onCsv={() => download(file("busy-hours"), [["Hour", "Bills", "Sales"], ...rows.map((r) => [hourText(r.hour), r.bills, r.total])])}>
          {best && <>{k("Busiest", "ಹೆಚ್ಚು ಬಿಜಿ")}: <b>{hourText(best.hour)}</b></>}
        </Foot>
      </>
    ) : <Empty />;
  };

  return (
    <div className="rpt">
      <div className="rpt-presets" role="group" aria-label={k("Dates", "ದಿನಾಂಕ")}>
        {PRESETS.map((p) => (
          <button key={p.id} type="button" className={active === p.id && !custom ? "on" : ""} onClick={() => { setCustom(false); const r = presetRange(p.id, today); onRange(r.from, r.to); }}>{k(p.en, p.kn)}</button>
        ))}
        <button type="button" className={custom || !active ? "on" : ""} onClick={() => setCustom(!custom)}>📅 {k("Custom", "ಆಯ್ಕೆ")}</button>
      </div>
      {(custom || !active) && (
        <div className="rpt-custom">
          <label><span>{k("From", "ಇಂದ")}</span><input type="date" value={from} max={today} onChange={(e) => e.target.value && onRange(e.target.value, e.target.value > to ? e.target.value : to)} /></label>
          <label><span>{k("To", "ವರೆಗೆ")}</span><input type="date" value={to} min={from} max={today} onChange={(e) => e.target.value && onRange(from, e.target.value)} /></label>
        </div>
      )}
      <p className="rpt-range">{range}</p>
      {error && <p className="ctr-msg bad">{error}</p>}

      <div className="rpt-kpis">
        <div className="big"><small>{k("Total sales", "ಒಟ್ಟು ಮಾರಾಟ")}</small><b>{rupees(t.sales)}</b></div>
        <div><small>{k("Bills", "ಬಿಲ್")}</small><b>{t.bills}</b></div>
        <div><small>{k("Weight", "ತೂಕ")}</small><b>{kgText(t.kg)}</b></div>
        <div><small>{k("Avg bill", "ಸರಾಸರಿ")}</small><b>{rupees(t.avg)}</b></div>
      </div>
      <div className="rpt-kpis sub">
        <button type="button" className={t.pending > 0 ? "warn" : ""} onClick={() => open("pend")}><small>⏳ {k("To collect", "ಬರಬೇಕು")}</small><b>{rupees(t.pending)}</b></button>
        <button type="button" className={t.held > 0 ? "warn" : ""} onClick={() => open("held")}><small>🔒 {k("Oil held", "ಎಣ್ಣೆ ಹಿಡಿದಿದೆ")}</small><b>{t.held}</b></button>
        <button type="button" onClick={() => open("disc")}><small>🏷️ {k("Discount", "ರಿಯಾಯಿತಿ")}</small><b>{rupees(t.discount)}</b></button>
        {returned > 0 && <div><small>↩️ {k("Returned", "ಹಿಂತಿರುಗಿದ್ದು")}</small><b>−{rupees(returned)}</b></div>}
      </div>

      {dashboard && <div className="rpt-kpis sub">
        <button type="button" onClick={() => open("pay")}><small>{k("Cash on selected bills", "ಆಯ್ದ ಬಿಲ್‌ಗಳ ನಗದು")}</small><b>{rupees(t.modes.CASH || 0)}</b></button>
        <button type="button" onClick={() => open("pay")}><small>{k("UPI on selected bills", "ಆಯ್ದ ಬಿಲ್‌ಗಳ ಯುಪಿಐ")}</small><b>{rupees(t.modes.UPI || 0)}</b></button>
        <button type="button" onClick={() => open("items")}><small>{k("View item-wise sales", "ವಸ್ತುವಾರು ಮಾರಾಟ")}</small></button>
        <button type="button" onClick={() => open("hours")}><small>{k("View busy hours", "ಬಿಜಿ ಸಮಯ")}</small></button>
      </div>}

      {!dashboard && <><div className="rpt-chips" role="tablist" aria-label={k("Reports", "ವರದಿಗಳು")}>
        {REPORTS.map((r) => (
          <button key={r.id} type="button" role="tab" aria-selected={rep === r.id} className={rep === r.id ? "on" : ""} onClick={() => setRep(r.id)}><i aria-hidden>{r.icon}</i> {k(r.en, r.kn)}</button>
        ))}
      </div>
      <h4 className="rpt-title">{REPORTS.find((r) => r.id === rep)!.icon} {k(REPORTS.find((r) => r.id === rep)!.en, REPORTS.find((r) => r.id === rep)!.kn)}</h4>
      {body()}</>}
    </div>
  );
}
