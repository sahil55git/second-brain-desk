"use client";

// Activity log tab on /records (owner only): who deleted, changed or paid out
// what on the older desks. Newest first; filter by record type, and by date
// range using the range picker above the tabs. Read-only — nothing here edits
// the log.

import { Fragment, useCallback, useEffect, useState } from "react";
import { AUDIT_ENTITIES, auditToCsv, type AuditRow } from "@/lib/auditFormat";

interface Row extends AuditRow {
  before: unknown;
  after: unknown;
}

const ENTITY_LABEL: Record<string, string> = {
  SalesInvoice: "Sales invoice",
  PurchaseBill: "Purchase bill",
  Expense: "Expense",
  Party: "Party",
  Item: "Item",
  JobWorkIntake: "Job-work entry",
  JobWorkDayOutput: "Job-work day output",
  DailyClosing: "Daily closing",
};

const when = (t: string | Date) =>
  new Date(t).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

export default function ActivityLog({ from, to }: { from: string; to: string }) {
  const [entity, setEntity] = useState("all");
  const [rows, setRows] = useState<Row[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const qs = new URLSearchParams({ from, to });
      if (entity !== "all") qs.set("entity", entity);
      const res = await fetch(`/api/audit?${qs.toString()}`);
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || "Could not load the activity log");
      setRows(j.data || []);
    } catch (x) {
      setErr(x instanceof Error ? x.message : "Error");
    } finally {
      setLoading(false);
    }
  }, [from, to, entity]);
  useEffect(() => {
    load();
  }, [load]);

  function csv() {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["﻿" + auditToCsv(rows)], { type: "text/csv" }));
    a.download = `activity_log_${from}_to_${to}.csv`;
    a.click();
  }

  return (
    <section className="hub-card">
      <h3>Activity log — {rows.length} entries</h3>
      <div className="hub-m small" style={{ marginBottom: 8 }}>
        Every delete, change and job-work payment on the sales, purchase, expense, party, item, job-work and daily-closing desks. Open a row to
        see the record as it was before (a deleted invoice keeps all its lines).
      </div>
      {err && <div className="hub-banner">{err}</div>}
      <div className="hub-range">
        <select value={entity} onChange={(e) => setEntity(e.target.value)}>
          <option value="all">All records</option>
          {AUDIT_ENTITIES.map((k) => (
            <option key={k} value={k}>
              {ENTITY_LABEL[k] || k}
            </option>
          ))}
        </select>
        <button onClick={csv} disabled={!rows.length}>
          ⬇️ CSV
        </button>
        {loading && <span className="hub-m">Loading…</span>}
      </div>
      <div className="hub-tablewrap">
        <table className="hub-table">
          <thead>
            <tr>
              <th>When</th>
              <th>Who</th>
              <th>Action</th>
              <th>Record</th>
              <th>Summary</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <Fragment key={r.id}>
                <tr>
                  <td>{when(r.at)}</td>
                  <td>
                    {r.by}
                    {r.isOwner ? " (owner)" : ""}
                  </td>
                  <td>{r.action}</td>
                  <td>{ENTITY_LABEL[r.entity] || r.entity}</td>
                  <td>{r.summary}</td>
                  <td>
                    <button onClick={() => setOpen(open === r.id ? null : r.id)}>{open === r.id ? "Hide" : "Details"}</button>
                  </td>
                </tr>
                {open === r.id && (
                  <tr>
                    <td colSpan={6}>
                      <div className="hub-m small">Before</div>
                      <pre style={{ whiteSpace: "pre-wrap", fontSize: 12 }}>{r.before ? JSON.stringify(r.before, null, 2) : "—"}</pre>
                      {r.after ? (
                        <>
                          <div className="hub-m small">After</div>
                          <pre style={{ whiteSpace: "pre-wrap", fontSize: 12 }}>{JSON.stringify(r.after, null, 2)}</pre>
                        </>
                      ) : null}
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
            {!rows.length && !loading && (
              <tr>
                <td colSpan={6} className="hub-empty">
                  Nothing was deleted, changed or paid out in this period.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
