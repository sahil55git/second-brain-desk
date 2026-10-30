"use client";

// Employee ledger (/employees): one account per person.
//   Staff        — a card per person with the balance (who owes whom)
//   Ledger       — one person, one month: credit (earned), debit (paid), running balance
//   Month-end    — days present → earned, advance taken off, net payable, post and pay
//   Report       — every balance, print and Excel
// Credit = earned, debit = paid or deducted. Positive balance: the shop owes the person.
// Negative: the person holds an advance. Edits and deletes need a reason and stay in the history.
import { useCallback, useEffect, useMemo, useState } from "react";
import { api, L, rs } from "@/components/barrels/shared";
import { Dropdown, MenuBtn, MenuHead } from "@/components/barrels/Menus";
import { printArea } from "@/components/print/PrintButton";
import { downloadText } from "@/components/barrels/fleet/types";
import { ENTRY_TYPES, earnedForDays, ledgerCsv, monthLabel, payrollNet, TYPE_LABEL, type EntryType } from "@/lib/employeeLedger";

interface Emp {
  id: string; name: string; role: string; phone: string | null; monthlySalaryInr: number; joinDate: string; active: boolean;
  balanceInr: number; creditInr: number; debitInr: number; earnedThisMonthInr: number; earnPostedThisMonth: boolean;
  last: { date: string; type: string; amountInr: number } | null;
}
interface Row { id: string; date: string; month: string; type: EntryType; creditInr: number; debitInr: number; mode: string | null; note: string | null; editNote: string | null; enteredBy: string | null; balanceInr: number }
interface Ev { id: string; action: string; by: string; at: string; entryId: string | null; detail: Record<string, unknown> | null }
interface LedgerData { month: string; employee: Emp; openingInr: number; creditInr: number; debitInr: number; closingInr: number; rows: Row[]; months: string[]; events: Ev[] }
interface PayRow { id: string; name: string; role: string; monthlySalaryInr: number; posted: boolean; carriedInr: number }

type Tab = "staff" | "ledger" | "pay" | "report";
const abs = (n: number) => rs(Math.abs(n));
const balText = (n: number) => (n === 0 ? "₹0" : abs(n));
const balLabel = (n: number) => (n > 0 ? "We owe" : n < 0 ? "Advance with him" : "Settled");
const balCls = (n: number) => (n > 0 ? "o" : n < 0 ? "g" : "");
const dmy = (d: string) => d.split("-").reverse().join("-");

export default function EmployeeDesk() {
  const [tab, setTab] = useState<Tab>("staff");
  const [emps, setEmps] = useState<Emp[] | null>(null);
  const [month, setMonth] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [who, setWho] = useState<string | null>(null);
  const [adding, setAdding] = useState<{ emp: string; type?: string } | null>(null);
  const [newEmp, setNewEmp] = useState(false);

  const loadList = useCallback(async () => {
    try {
      const j = await api<{ month: string; data: Emp[] }>("/api/employees");
      setEmps(j.data);
      setMonth((m) => m ?? j.month);
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not load.");
      setEmps([]);
    }
  }, []);
  useEffect(() => { loadList(); }, [loadList]);

  const flash = (t: string) => { setOk(t); setTimeout(() => setOk(null), 4000); };
  const active = useMemo(() => (emps ?? []).filter((e) => e.active), [emps]);
  const owe = active.filter((e) => e.balanceInr > 0).reduce((a, e) => a + e.balanceInr, 0);
  const adv = -active.filter((e) => e.balanceInr < 0).reduce((a, e) => a + e.balanceInr, 0);
  const cost = active.reduce((a, e) => a + e.earnedThisMonthInr, 0);
  const forbidden = err?.includes("owner only");

  const tabs: [Tab, string, string, string][] = [["staff", "👥", "Staff", "ಸಿಬ್ಬಂದಿ"], ["ledger", "📒", "Ledger", "ಖಾತೆ"], ["pay", "🗓️", "Month-end salary", "ಸಂಬಳ"], ["report", "📊", "Report", "ವರದಿ"]];

  return (
    <div className="bd-wrap" style={{ maxWidth: 1100 }}>
      <header className="bd-noprint">
        <a className="bd-m small" href="/go">← Quick links</a>
        <h1>👷 <L en="Employee ledger" kn="ನೌಕರರ ಖಾತೆ" /></h1>
      </header>

      {forbidden ? (
        <div className="bd-card"><b>The employee ledger is for the owner only.</b><div className="bd-m small">Salaries are private. Sign in as the owner to see it.</div></div>
      ) : (
        <>
          <div className="bd-steps bd-tabs bd-noprint" role="tablist">
            {tabs.map(([id, icon, en, kn]) => (
              <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? "on" : ""} onClick={() => setTab(id)}>{icon} <L en={en} kn={kn} /></button>
            ))}
          </div>
          {err && <div className="bd-err">{err}</div>}
          {ok && <div className="bd-ok">{ok}</div>}

          <div className="bd-kpis bd-noprint">
            <div className="bd-kpi"><div className="l">Staff</div><div className="v">{active.length}</div></div>
            <div className="bd-kpi"><div className="l">Earned this month</div><div className="v">{rs(cost)}</div></div>
            <div className="bd-kpi o"><div className="l">We owe staff</div><div className="v">{rs(owe)}</div></div>
            <div className="bd-kpi g"><div className="l">Staff owe us (advances)</div><div className="v">{rs(adv)}</div></div>
          </div>

          {emps === null && <div className="bd-m">Loading…</div>}

          {tab === "staff" && emps && (
            <>
              <div className="bd-row bd-gap">
                <div className="bd-m">Tap a card to open that person&apos;s ledger.</div>
                <button className="bd-btn primary" style={{ marginLeft: "auto" }} onClick={() => setNewEmp(true)}>＋ New employee</button>
              </div>
              {emps.length === 0 && <div className="bd-card bd-m">No employees yet. Add the first one.</div>}
              <div className="bd-lots">
                {emps.map((e) => (
                  <div key={e.id} className="bd-card" style={{ opacity: e.active ? 1 : 0.55 }}>
                    <div className="bd-row bd-gap">
                      <b style={{ fontSize: 17 }}>{e.name}</b>
                      <span className="bd-m small">{e.role}</span>
                      {!e.active && <span className="bd-chip">Left</span>}
                      <span className={`bd-chip ${balCls(e.balanceInr)}`} style={{ marginLeft: "auto" }}>{balLabel(e.balanceInr)}</span>
                    </div>
                    <div className="bd-kpis">
                      <div className="bd-kpi"><div className="l">Monthly salary</div><div className="v">{rs(e.monthlySalaryInr)}</div></div>
                      <div className={`bd-kpi ${balCls(e.balanceInr)}`}><div className="l">{balLabel(e.balanceInr)}</div><div className="v">{balText(e.balanceInr)}</div></div>
                    </div>
                    <div className="bd-m small">{e.last ? `Last: ${dmy(e.last.date)} · ${TYPE_LABEL[e.last.type as EntryType] ?? e.last.type} ${rs(e.last.amountInr)}` : "No entries yet"}</div>
                    <div className="bd-row">
                      <button className="bd-btn" onClick={() => { setWho(e.id); setTab("ledger"); }}>📒 Open ledger</button>
                      <button className="bd-btn primary" disabled={!e.active} onClick={() => { setWho(e.id); setAdding({ emp: e.id }); }}>＋ Entry</button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {tab === "ledger" && emps && (
            <LedgerView emps={emps} who={who ?? emps[0]?.id ?? null} setWho={setWho} month={month} setMonth={setMonth} onAdd={(emp, type) => setAdding({ emp, type })} onChanged={() => loadList()} flash={flash} />
          )}
          {tab === "pay" && emps && <PayView month={month ?? ""} setMonth={setMonth} onDone={(t) => { loadList(); flash(t); }} />}
          {tab === "report" && emps && <ReportView emps={emps} />}
        </>
      )}

      {adding && emps && (
        <EntryModal emps={emps} init={adding} onClose={() => setAdding(null)} onSaved={(emp) => { setAdding(null); setWho(emp); setTab("ledger"); loadList(); flash("Saved ✓"); }} />
      )}
      {newEmp && <NewEmpModal onClose={() => setNewEmp(false)} onSaved={() => { setNewEmp(false); loadList(); flash("Employee added ✓"); }} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
function LedgerView({ emps, who, setWho, month, setMonth, onAdd, onChanged, flash }: {
  emps: Emp[]; who: string | null; setWho: (id: string) => void; month: string | null; setMonth: (m: string) => void;
  onAdd: (emp: string, type?: string) => void; onChanged: () => void; flash: (t: string) => void;
}) {
  const [d, setD] = useState<LedgerData | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [fix, setFix] = useState<{ row: Row; mode: "edit" | "delete" } | null>(null);
  const [showHist, setShowHist] = useState(false);
  const load = useCallback(async () => {
    if (!who) return;
    try {
      setD(await api<LedgerData>(`/api/employees/${who}?month=${month ?? ""}`));
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not load.");
    }
  }, [who, month]);
  useEffect(() => { load(); }, [load]);
  if (!who) return <div className="bd-card bd-m">Add an employee first.</div>;
  const e = d?.employee;
  const refresh = () => { load(); onChanged(); };
  return (
    <div className="bd-card" id="emp-print">
      <div className="bd-row bd-gap bd-noprint">
        <Dropdown label={`👷 ${emps.find((x) => x.id === who)?.name ?? "Choose"} ▾`} width={260}>
          {(close) => emps.map((x) => <MenuBtn key={x.id} onClick={() => { setWho(x.id); close(); }}>{x.name} <span className="bd-m small">· {balText(x.balanceInr)}</span></MenuBtn>)}
        </Dropdown>
        <Dropdown label={`🗓️ ${d ? monthLabel(d.month) : "Month"} ▾`} width={190}>
          {(close) => (d?.months ?? []).map((m) => <MenuBtn key={m} onClick={() => { setMonth(m); close(); }}>{monthLabel(m)}</MenuBtn>)}
        </Dropdown>
        <button className="bd-btn primary" style={{ marginLeft: "auto" }} onClick={() => onAdd(who)}>＋ New entry</button>
        <Dropdown label="🖨️ Print ▾" className="bd-btn" width={250}>
          {(close) => (
            <>
              <MenuHead>THIS PERSON</MenuHead>
              <MenuBtn onClick={() => { close(); printArea("#emp-print"); }}>📄 Ledger statement (A4)</MenuBtn>
              <MenuHead>EXPORT</MenuHead>
              <MenuBtn off={!d} onClick={() => { close(); if (d && e) downloadText(`ledger-${e.name}-${d.month}.csv`, "﻿" + ledgerCsv(e.name, d.month, d.openingInr, d.rows)); }}>📊 Excel file (CSV)</MenuBtn>
            </>
          )}
        </Dropdown>
      </div>
      {err && <div className="bd-err">{err}</div>}
      {e && d && (
        <>
          <h2 style={{ margin: "4px 0" }}>{e.name} <span className="bd-m small">· {e.role} · {rs(e.monthlySalaryInr)} a month · joined {dmy(e.joinDate)}</span></h2>
          <div className="bd-m small">Statement for {monthLabel(d.month)}</div>
          <div className="bd-kpis">
            <div className="bd-kpi"><div className="l">Opening balance</div><div className="v">{d.openingInr < 0 ? "−" : ""}{balText(d.openingInr)}</div></div>
            <div className="bd-kpi g"><div className="l">Earned (credit)</div><div className="v">{rs(d.creditInr)}</div></div>
            <div className="bd-kpi r"><div className="l">Paid / deducted (debit)</div><div className="v">{rs(d.debitInr)}</div></div>
            <div className={`bd-kpi ${balCls(d.closingInr)}`}><div className="l">Closing · {balLabel(d.closingInr)}</div><div className="v">{balText(d.closingInr)}</div></div>
          </div>
          <div className="bd-tablewrap">
            <table className="bd-table">
              <thead><tr><th>Date</th><th>Entry</th><th>Note</th><th className="num">Credit · earned</th><th className="num">Debit · paid</th><th className="num">Balance</th><th className="bd-noprint" /></tr></thead>
              <tbody>
                {d.rows.length === 0 && <tr><td colSpan={7} className="bd-m">No entries in this month.</td></tr>}
                {d.rows.map((r) => (
                  <tr key={r.id}>
                    <td>{dmy(r.date)}<div className="bd-m tiny">{r.enteredBy}</div></td>
                    <td><span className="bd-chip">{TYPE_LABEL[r.type] ?? r.type}</span>{r.mode && <div className="bd-m tiny">by {r.mode.toLowerCase()}</div>}</td>
                    <td>{r.note}{r.editNote && <div className="bd-m tiny">✎ {r.editNote}</div>}</td>
                    <td className="num">{r.creditInr ? rs(r.creditInr) : ""}</td>
                    <td className="num">{r.debitInr ? rs(r.debitInr) : ""}</td>
                    <td className="num"><b>{r.balanceInr < 0 ? "−" : ""}{balText(r.balanceInr)}</b></td>
                    <td className="bd-noprint">
                      <Dropdown label="⋯" className="bd-dots" width={200}>
                        {(close) => (
                          <>
                            <MenuBtn off={r.type === "OPEN"} why="Delete and enter again" onClick={() => { close(); setFix({ row: r, mode: "edit" }); }}>✎ Edit entry</MenuBtn>
                            <MenuBtn danger onClick={() => { close(); setFix({ row: r, mode: "delete" }); }}>🗑 Delete entry</MenuBtn>
                          </>
                        )}
                      </Dropdown>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="bd-m small">Balance = earned − paid − deducted. Positive: the shop owes the person. Negative: the person holds an advance. Changes need a reason and stay in the history.</div>
          <div className="bd-row bd-noprint">
            <button className="bd-btn" onClick={() => setShowHist((v) => !v)}>🕘 {showHist ? "Hide" : "Show"} history</button>
          </div>
          {showHist && (
            <ul className="bd-events bd-noprint">
              {d.events.map((x) => (
                <li key={x.id}><b>{x.action}</b> · {x.by} · {new Date(x.at).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" })}{x.detail ? <code>{JSON.stringify(x.detail)}</code> : null}</li>
              ))}
            </ul>
          )}
        </>
      )}
      {fix && who && <FixModal empId={who} fix={fix} onClose={() => setFix(null)} onDone={() => { setFix(null); refresh(); flash(fix.mode === "edit" ? "Changed and logged in the history ✓" : "Deleted and logged in the history ✓"); }} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
function PayView({ month, setMonth, onDone }: { month: string; setMonth: (m: string) => void; onDone: (t: string) => void }) {
  const [rows, setRows] = useState<PayRow[] | null>(null);
  const [days, setDays] = useState<Record<string, string>>({});
  const [mode, setMode] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [mlabel, setMlabel] = useState("");
  const load = useCallback(async () => {
    try {
      const j = await api<{ label: string; data: PayRow[] }>(`/api/employees/payroll?month=${month}`);
      setRows(j.data);
      setMlabel(j.label);
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not load.");
    }
  }, [month]);
  useEffect(() => { if (month) load(); }, [load, month]);
  const calc = (r: PayRow) => {
    const d = Number(days[r.id] ?? 30);
    const earned = earnedForDays(r.monthlySalaryInr, Number.isFinite(d) ? d : 0);
    return { earned, ...payrollNet(earned, r.carriedInr) };
  };
  const post = async (r: PayRow) => {
    setBusy(r.id);
    try {
      await api("/api/employees/payroll", { method: "POST", json: { month, rows: [{ employeeId: r.id, days: Number(days[r.id] ?? 30), mode: mode[r.id] || "CASH" }] } });
      onDone(`${r.name}: ${mlabel} salary posted ✓`);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not post.");
    } finally {
      setBusy(null);
    }
  };
  const [y, m] = month ? month.split("-").map(Number) : [0, 0];
  const shift = (n: number) => { const dt = new Date(Date.UTC(y, m - 1 + n, 1)); setMonth(`${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}`); };
  return (
    <div className="bd-card">
      <div className="bd-row bd-gap">
        <button className="bd-btn" onClick={() => shift(-1)}>◀</button>
        <h2 style={{ margin: 0 }}>🗓️ Month-end salary — {mlabel}</h2>
        <button className="bd-btn" onClick={() => shift(1)}>▶</button>
      </div>
      <div className="bd-m small">Type days present. Earned = monthly salary × days ÷ 30. An advance already given is taken off. If the advance is bigger than the month&apos;s earning, the rest carries to next month.</div>
      {err && <div className="bd-err">{err}</div>}
      <div className="bd-tablewrap">
        <table className="bd-table">
          <thead><tr><th>Person</th><th className="num">Salary</th><th>Days</th><th className="num">Earned</th><th className="num">Carried (− advance)</th><th className="num">Net payable</th><th>Paid by</th><th /></tr></thead>
          <tbody>
            {(rows ?? []).map((r) => {
              const c = calc(r);
              return (
                <tr key={r.id}>
                  <td><b>{r.name}</b><div className="bd-m tiny">{r.role}</div></td>
                  <td className="num">{rs(r.monthlySalaryInr)}</td>
                  <td><input className="bd-n" style={{ width: 64 }} inputMode="numeric" disabled={r.posted} value={days[r.id] ?? "30"} onChange={(e) => setDays({ ...days, [r.id]: e.target.value })} aria-label={`Days present for ${r.name}`} /></td>
                  <td className="num">{rs(c.earned)}</td>
                  <td className="num">{r.carriedInr < 0 ? "−" : r.carriedInr > 0 ? "+" : ""}{balText(r.carriedInr)}</td>
                  <td className="num"><b>{rs(c.net)}</b>{c.carryForward < 0 && <div className="bd-m tiny">advance left {abs(c.carryForward)}</div>}</td>
                  <td>
                    <select value={mode[r.id] ?? "CASH"} disabled={r.posted} onChange={(e) => setMode({ ...mode, [r.id]: e.target.value })} aria-label="Paid by">
                      <option value="CASH">Cash</option><option value="UPI">UPI</option><option value="BANK">Bank</option>
                    </select>
                  </td>
                  <td>{r.posted ? <span className="bd-chip g">Posted ✓</span> : <button className="bd-btn primary" disabled={busy === r.id} onClick={() => post(r)}>{busy === r.id ? "…" : "Post and pay ▸"}</button>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="bd-m small">“Post and pay” writes “salary earned” and, if something is payable, “salary paid” into that person&apos;s ledger. Once per person per month. This ledger is separate from the Cash tally: type cash salary in the Cash tally&apos;s Salary line too, as before.</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
function ReportView({ emps }: { emps: Emp[] }) {
  const csv = () => downloadText("employee-balances.csv", "﻿" + ["Employee,Role,Monthly salary,Earned (total),Paid (total),Balance", ...emps.map((e) => [e.name, e.role, e.monthlySalaryInr, e.creditInr, e.debitInr, e.balanceInr].join(","))].join("\r\n"));
  return (
    <div className="bd-card" id="emp-report">
      <div className="bd-row bd-gap">
        <h2 style={{ margin: 0 }}>📊 Balance of every employee</h2>
        <span className="bd-noprint" style={{ marginLeft: "auto", display: "inline-flex", gap: 8 }}>
          <Dropdown label="🖨️ Print and export ▾" width={240}>
            {(close) => (
              <>
                <MenuBtn onClick={() => { close(); printArea("#emp-report"); }}>📄 All balances (A4)</MenuBtn>
                <MenuBtn onClick={() => { close(); csv(); }}>📊 Excel file (CSV)</MenuBtn>
              </>
            )}
          </Dropdown>
        </span>
      </div>
      <div className="bd-tablewrap">
        <table className="bd-table">
          <thead><tr><th>Person</th><th className="num">Salary</th><th className="num">Earned</th><th className="num">Paid</th><th className="num">Balance</th><th /></tr></thead>
          <tbody>
            {emps.map((e) => (
              <tr key={e.id} className={e.balanceInr < 0 && -e.balanceInr > e.monthlySalaryInr ? "alert" : ""}>
                <td><b>{e.name}</b>{!e.active && <span className="bd-m tiny"> · left</span>}<div className="bd-m tiny">{e.role}</div></td>
                <td className="num">{rs(e.monthlySalaryInr)}</td>
                <td className="num">{rs(e.creditInr)}</td>
                <td className="num">{rs(e.debitInr)}</td>
                <td className="num"><b>{e.balanceInr < 0 ? "−" : ""}{balText(e.balanceInr)}</b></td>
                <td>{e.balanceInr > 0 ? "we owe" : e.balanceInr < 0 ? (-e.balanceInr > e.monthlySalaryInr ? "🚩 advance above one month's salary" : "advance") : "settled"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="bd-modalback" onClick={onClose}>
      <div className="bd-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <h3>{title}</h3>
        {children}
      </div>
    </div>
  );
}

function EntryModal({ emps, init, onClose, onSaved }: { emps: Emp[]; init: { emp: string; type?: string }; onClose: () => void; onSaved: (emp: string) => void }) {
  const [emp, setEmp] = useState(init.emp);
  const [type, setType] = useState<string>(init.type ?? "ADV");
  const [amt, setAmt] = useState("");
  const [mode, setMode] = useState("CASH");
  const [note, setNote] = useState("");
  const [date, setDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const def = ENTRY_TYPES[type as keyof typeof ENTRY_TYPES];
  const save = async () => {
    setBusy(true);
    setErr(null);
    try {
      await api(`/api/employees/${emp}/entries`, { method: "POST", json: { type, amountInr: Number(amt), mode, note, date: date || undefined } });
      onSaved(emp);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title="New entry" onClose={() => !busy && onClose()}>
      <label>Person<select value={emp} onChange={(e) => setEmp(e.target.value)}>{emps.filter((e) => e.active).map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</select></label>
      <div className="bd-row">
        {Object.entries(ENTRY_TYPES).map(([k, v]) => <button key={k} type="button" className={`bd-chip${type === k ? " on" : ""}`} style={{ cursor: "pointer" }} onClick={() => setType(k)}>{v.label}</button>)}
      </div>
      <div className="bd-m small">{def?.help}</div>
      <label>Amount (₹)<input inputMode="decimal" value={amt} onChange={(e) => setAmt(e.target.value)} autoFocus style={{ fontSize: 22, textAlign: "right" }} /></label>
      {def?.moves && <label>Paid by<select value={mode} onChange={(e) => setMode(e.target.value)}><option value="CASH">Cash</option><option value="UPI">UPI</option><option value="BANK">Bank</option></select></label>}
      <label>Date (blank = today)<input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
      <label>Note<input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Diwali advance, 2 days absent" /></label>
      {err && <div className="bd-err">{err}</div>}
      <div className="bd-row"><button className="bd-btn" disabled={busy} onClick={onClose}>Cancel</button><button className="bd-btn primary" disabled={busy || !(Number(amt) > 0)} onClick={save}>{busy ? "…" : "Save entry"}</button></div>
    </Modal>
  );
}

function FixModal({ empId, fix, onClose, onDone }: { empId: string; fix: { row: Row; mode: "edit" | "delete" }; onClose: () => void; onDone: () => void }) {
  const r = fix.row;
  const [amt, setAmt] = useState(String(r.creditInr || r.debitInr));
  const [note, setNote] = useState(r.note ?? "");
  const [why, setWhy] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const go = async () => {
    setBusy(true);
    setErr(null);
    try {
      if (fix.mode === "edit") await api(`/api/employees/${empId}/entries/${r.id}`, { method: "PATCH", json: { amountInr: Number(amt), note, reason: why } });
      else await api(`/api/employees/${empId}/entries/${r.id}`, { method: "DELETE", json: { reason: why } });
      onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title={`${fix.mode === "edit" ? "Edit" : "Delete"} entry — ${TYPE_LABEL[r.type]}`} onClose={() => !busy && onClose()}>
      <p className="bd-m">{fix.mode === "edit" ? `Saved now: ${rs(r.creditInr || r.debitInr)}. Type the correct amount and say why.` : `Removes “${r.note ?? TYPE_LABEL[r.type]}” (${rs(r.creditInr || r.debitInr)}) from the ledger. It stays in the history.`}</p>
      {fix.mode === "edit" && (
        <>
          <label>Amount (₹)<input inputMode="decimal" value={amt} onChange={(e) => setAmt(e.target.value)} autoFocus style={{ fontSize: 22, textAlign: "right" }} /></label>
          <label>Note<input value={note} onChange={(e) => setNote(e.target.value)} /></label>
        </>
      )}
      <label>Reason (at least 3 letters)<input value={why} onChange={(e) => setWhy(e.target.value)} placeholder="e.g. typed wrong" autoFocus={fix.mode === "delete"} /></label>
      {err && <div className="bd-err">{err}</div>}
      <div className="bd-row"><button className="bd-btn" disabled={busy} onClick={onClose}>Cancel</button><button className={`bd-btn ${fix.mode === "delete" ? "danger" : "primary"}`} disabled={busy || why.trim().length < 3} onClick={go}>{busy ? "…" : fix.mode === "edit" ? "Save change" : "Delete entry"}</button></div>
    </Modal>
  );
}

function NewEmpModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({ name: "", role: "", sal: "", open: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const save = async () => {
    setBusy(true);
    setErr(null);
    try {
      await api("/api/employees", { method: "POST", json: { name: f.name, role: f.role, monthlySalaryInr: Number(f.sal), openingBalanceInr: Number(f.open) || 0 } });
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title="New employee" onClose={() => !busy && onClose()}>
      <label>Name<input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoFocus /></label>
      <label>Work (counter, crushing, driver…)<input value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })} /></label>
      <label>Monthly salary (₹)<input inputMode="numeric" value={f.sal} onChange={(e) => setF({ ...f, sal: e.target.value })} /></label>
      <label>Opening balance (₹, optional) — an advance already given is a minus number<input inputMode="numeric" value={f.open} onChange={(e) => setF({ ...f, open: e.target.value })} placeholder="0" /></label>
      {err && <div className="bd-err">{err}</div>}
      <div className="bd-row"><button className="bd-btn" disabled={busy} onClick={onClose}>Cancel</button><button className="bd-btn primary" disabled={busy || !f.name.trim() || !(Number(f.sal) > 0)} onClick={save}>{busy ? "…" : "Add employee"}</button></div>
    </Modal>
  );
}
