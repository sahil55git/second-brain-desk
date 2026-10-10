"use client";

// Proofs & scans (/records) — Owner only. Every signature, payment photo and
// scanned slip / bill, with the Google Drive link, what was read from it, and
// the register entry it proves. A second tab lists cash that left the
// counter WITHOUT any proof, which is the check that matters for misuse.

import { useCallback, useEffect, useMemo, useState } from "react";
import { PROOF_META, SCAN_FIELDS, isScanKind, type ProofKind } from "@/lib/proofs";
import { businessDate } from "@/lib/register";
import { DeviceCopySettings } from "@/components/register/ProofParts";

interface Rec {
  id: string;
  kind: ProofKind;
  date: string;
  registerEntryId: string | null;
  fileName: string;
  folder: string;
  sizeBytes: number;
  driveFileId: string | null;
  driveUrl: string | null;
  driveError: string | null;
  partyName: string | null;
  amountInr: number | null;
  refNo: string | null;
  fields: Record<string, string | number | null> | null;
  aiFields: Record<string, string | number | null> | null;
  notes: string | null;
  capturedAt: string | null;
  geo: { lat: number; lng: number; acc?: number } | null;
  createdByName: string | null;
  createdAt: string;
  registerEntry: { id: string; kind: string; amountInr: number; partyName: string | null; paymentMode: string; date: string } | null;
}
interface Entry {
  id: string;
  date: string;
  kind: string;
  amountInr: number;
  paymentMode: string;
  partyName: string | null;
  notes: string | null;
  createdByName: string | null;
  createdAt: string;
}

const rs = (n: number | null | undefined) => "₹" + Math.round(Number(n) || 0).toLocaleString("en-IN");
const when = (t: string | null) =>
  t ? new Date(t).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" }) : "";
const KIND_LABEL: Record<string, string> = { PAYMENT: "🤝 Payment / Salary", PURCHASE: "🛒 Purchase", EXPENSE: "🧾 Expense" };

function addDays(d: string, n: number) {
  const t = new Date(`${d}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
}

export default function RecordsDesk() {
  const today = businessDate(Date.now());
  const [range, setRange] = useState<"today" | "7" | "30" | "month" | "custom">("7");
  const [from, setFrom] = useState(addDays(today, -6));
  const [to, setTo] = useState(today);
  const [filter, setFilter] = useState<string>("all");
  const [tab, setTab] = useState<"records" | "missing">("records");
  const [recs, setRecs] = useState<Rec[]>([]);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [driveOn, setDriveOn] = useState<boolean | null>(null);
  const [pending, setPending] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [shown, setShown] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  const pick = (r: typeof range) => {
    setRange(r);
    const start: Record<string, string> = { today, "7": addDays(today, -6), "30": addDays(today, -29), month: today.slice(0, 8) + "01" };
    if (start[r]) {
      setFrom(start[r]);
      setTo(today);
    }
  };

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const [a, e, d] = await Promise.all([
        fetch(`/api/attachments?from=${from}&to=${to}`).then(async (r) => ({ ok: r.ok, j: await r.json().catch(() => ({})) })),
        fetch(`/api/register/range?from=${from}&to=${to}`).then(async (r) => ({ ok: r.ok, j: await r.json().catch(() => ({})) })),
        fetch(`/api/attachments/drive`).then(async (r) => ({ ok: r.ok, j: await r.json().catch(() => ({})) })),
      ]);
      if (!a.ok) throw new Error(a.j.error || "Could not load proofs");
      setRecs(a.j.data || []);
      setDriveOn(!!a.j.driveConfigured);
      setEntries(e.ok ? e.j.data || [] : []);
      setPending(d.ok ? d.j.data?.pending ?? null : null);
    } catch (x) {
      setErr(x instanceof Error ? x.message : "Error");
    } finally {
      setLoading(false);
    }
  }, [from, to]);
  useEffect(() => {
    load();
  }, [load]);

  const list = useMemo(
    () =>
      recs.filter((r) =>
        filter === "all" ? true : filter === "payment" ? ["SIGNATURE", "RECIPIENT_PHOTO", "THUMB_PAPER"].includes(r.kind) : filter === "scan" ? isScanKind(r.kind) : r.kind === filter
      ),
    [recs, filter]
  );

  // Cash that left the counter (payment / purchase / expense) with no proof attached.
  const proved = useMemo(() => new Set(recs.map((r) => r.registerEntryId).filter(Boolean) as string[]), [recs]);
  const missing = useMemo(
    () => entries.filter((e) => ["PAYMENT", "PURCHASE", "EXPENSE"].includes(e.kind) && e.paymentMode === "CASH" && !proved.has(e.id)),
    [entries, proved]
  );
  const missingTotal = missing.reduce((a, e) => a + e.amountInr, 0);

  async function show(r: Rec) {
    const res = await fetch(`/api/attachments/${r.id}`);
    const j = await res.json().catch(() => ({}));
    if (j.data?.dataUrl) setShown((s) => ({ ...s, [r.id]: j.data.dataUrl }));
    else if (r.driveUrl) window.open(r.driveUrl, "_blank", "noopener");
  }
  async function del(r: Rec) {
    if (!window.confirm(`Delete this ${PROOF_META[r.kind].en.toLowerCase()} record from the app?\nThe Google Drive copy (if any) is NOT deleted.`)) return;
    const res = await fetch(`/api/attachments/${r.id}`, { method: "DELETE" });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) return setErr(j.error || "Could not delete");
    load();
  }
  async function retry() {
    setMsg("Uploading to Google Drive…");
    const res = await fetch("/api/attachments/drive", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "retry" }) });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) setMsg(j.error || "Failed");
    else setMsg(`Uploaded ${j.data.uploaded}${j.data.failed ? `, ${j.data.failed} failed (${j.data.firstError})` : ""}. Still waiting: ${j.data.pending ?? "?"}`);
    load();
  }
  function csv() {
    const head = ["Date", "Time", "Type", "Party", "Amount", "Ref", "Entry", "By", "Drive link", "File", "Details"];
    const rows = list.map((r) => [
      r.date,
      when(r.capturedAt || r.createdAt),
      PROOF_META[r.kind]?.en || r.kind,
      r.partyName || "",
      r.amountInr ?? "",
      r.refNo || "",
      r.registerEntry ? `${r.registerEntry.kind} ${r.registerEntry.amountInr}` : "",
      r.createdByName || "",
      r.driveUrl || "",
      r.fileName,
      r.fields ? Object.entries(r.fields).filter(([, v]) => v !== null && v !== "").map(([k, v]) => `${k}=${v}`).join("; ") : "",
    ]);
    const text = [head, ...rows].map((row) => row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["﻿" + text], { type: "text/csv" }));
    a.download = `proofs_and_scans_${from}_to_${to}.csv`;
    a.click();
  }

  return (
    <div className="hub">
      <header className="hub-top">
        <div>
          <h1>🗂️ Proofs &amp; scans</h1>
          <div className="hub-m">
            Signatures and photos taken when cash is paid, and scanned weighbridge / weighing slips, bills and receipts.{" "}
            {driveOn === false && <b className="o">Google Drive upload is not set up — pictures are kept in the app for now.</b>}
            {driveOn && <b className="g">Filed in Google Drive → 06_Scans_&amp;_Proofs.</b>}
          </div>
        </div>
        <nav className="hub-links">
          <a className="hub-btn" href="/register?open=scan">📸 Scan a slip</a>
          <a className="hub-btn" href="/register">📒 Quick Register</a>
          <a className="hub-btn" href="/reports">📊 Reports</a>
          <a className="hub-btn" href="/settings?section=proofs">⚙️ Set-up</a>
        </nav>
      </header>
      {err && <div className="hub-banner">{err}</div>}

      <div className="hub-range">
        {(
          [
            ["today", "Today"],
            ["7", "7 days"],
            ["30", "30 days"],
            ["month", "This month"],
            ["custom", "Custom"],
          ] as const
        ).map(([k, l]) => (
          <button key={k} className={range === k ? "on" : ""} onClick={() => pick(k)}>
            {l}
          </button>
        ))}
        {range === "custom" && (
          <>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /> → <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </>
        )}
        {loading && <span className="hub-m">Loading…</span>}
      </div>

      <div className="hub-tabs">
        <button className={tab === "records" ? "on" : ""} onClick={() => setTab("records")}>
          Records ({recs.length})
        </button>
        <button className={tab === "missing" ? "on" : ""} onClick={() => setTab("missing")}>
          ⚠️ Cash paid without proof ({missing.length})
        </button>
      </div>

      {tab === "records" && (
        <>
          <div className="hub-range">
            {[
              ["all", "All"],
              ["payment", "🛡️ Payment proofs"],
              ["scan", "📸 Scans"],
              ...(Object.keys(PROOF_META) as ProofKind[]).map((k) => [k, `${PROOF_META[k].icon} ${PROOF_META[k].en}`]),
            ].map(([k, l]) => (
              <button key={k} className={filter === k ? "on" : ""} onClick={() => setFilter(k)}>
                {l}
              </button>
            ))}
            <button onClick={csv} disabled={!list.length}>
              ⬇ CSV
            </button>
            {!!pending && driveOn && (
              <button onClick={retry} title="Send pictures still kept in the app to Google Drive">
                ☁️ Upload waiting ({pending})
              </button>
            )}
          </div>
          {msg && <div className="hub-m" style={{ marginBottom: 8 }}>{msg}</div>}
          {!list.length && !loading && <div className="hub-empty">Nothing in this period.</div>}
          <div className="rec-grid">
            {list.map((r) => {
              const m = PROOF_META[r.kind];
              const img = shown[r.id] || (r.driveFileId ? `https://drive.google.com/thumbnail?id=${r.driveFileId}&sz=w600` : null);
              return (
                <section className="hub-card rec-card" key={r.id}>
                  <div className="rec-img" onClick={() => show(r)} role="button" tabIndex={0} title="Show picture">
                    {img ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={img} alt={m.en} referrerPolicy="no-referrer" onError={(e) => ((e.currentTarget.style.display = "none"))} />
                    ) : (
                      <span className="rec-ph">{m.icon}<small>Tap to show</small></span>
                    )}
                  </div>
                  <div className="rec-body">
                    <b>
                      {m.icon} {m.en}
                    </b>{" "}
                    <span className="hub-m">
                      {r.date} · {when(r.capturedAt || r.createdAt)}
                    </span>
                    <div>
                      {r.partyName && <>👤 {r.partyName} </>}
                      {r.amountInr != null && <b>{rs(r.amountInr)} </b>}
                      {r.refNo && <span className="hub-m">No. {r.refNo}</span>}
                    </div>
                    {r.registerEntry ? (
                      <div className="hub-m">
                        📒 {KIND_LABEL[r.registerEntry.kind] || r.registerEntry.kind} {rs(r.registerEntry.amountInr)}
                        {r.registerEntry.partyName ? ` — ${r.registerEntry.partyName}` : ""} ({r.registerEntry.paymentMode})
                      </div>
                    ) : (
                      ["SIGNATURE", "RECIPIENT_PHOTO", "THUMB_PAPER"].includes(r.kind) && <div className="o small">Not linked to an entry (entry deleted?)</div>
                    )}
                    {r.fields && isScanKind(r.kind) && (
                      <table className="hub-table rec-fields">
                        <tbody>
                          {SCAN_FIELDS[r.kind].filter((f) => r.fields?.[f.key] != null && r.fields?.[f.key] !== "").map((f) => {
                            const ai = r.aiFields?.[f.key];
                            const edited = r.aiFields && String(ai ?? "") !== String(r.fields?.[f.key] ?? "");
                            return (
                              <tr key={f.key}>
                                <td className="hub-m">{f.en}</td>
                                <td>
                                  {String(r.fields?.[f.key])}
                                  {edited && <span className="hub-m" title={`AI read: ${ai ?? "—"}`}> ✎ (AI: {ai ?? "—"})</span>}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    )}
                    {r.notes && <div className="hub-m">📝 {r.notes}</div>}
                    <div className="hub-m small">
                      by {r.createdByName || "—"}
                      {r.geo && (
                        <>
                          {" · "}
                          <a href={`https://maps.google.com/?q=${r.geo.lat},${r.geo.lng}`} target="_blank" rel="noopener noreferrer">
                            📍 location
                          </a>
                        </>
                      )}
                    </div>
                    <div className="rec-acts">
                      {r.driveUrl ? (
                        <a className="hub-btn sm" href={r.driveUrl} target="_blank" rel="noopener noreferrer">
                          Open in Drive ↗
                        </a>
                      ) : (
                        <span className="o small" title={r.driveError || ""}>
                          Kept in app{r.driveError ? ` — ${r.driveError.slice(0, 80)}` : ""}
                        </span>
                      )}
                      <button className="hub-btn sm" onClick={() => show(r)}>
                        Show
                      </button>
                      <button className="hub-btn sm" onClick={() => del(r)}>
                        Delete
                      </button>
                    </div>
                  </div>
                </section>
              );
            })}
          </div>
        </>
      )}

      {tab === "missing" && (
        <section className="hub-card">
          <h3>
            Cash paid out with no signature or photo — {missing.length} entries, {rs(missingTotal)}
          </h3>
          <div className="hub-m small" style={{ marginBottom: 8 }}>
            Cash Payment / Purchase / Expense entries in this period with nothing attached. UPI and udhaar are left out (the bank or the
            party ledger is their record). To make proof compulsory, see Settings → Proofs &amp; scans.
          </div>
          <div className="hub-tablewrap">
            <table className="hub-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Time</th>
                  <th>Type</th>
                  <th>To</th>
                  <th className="num">Amount</th>
                  <th>Note</th>
                  <th>Entered by</th>
                </tr>
              </thead>
              <tbody>
                {missing.map((e) => (
                  <tr key={e.id}>
                    <td>{e.date}</td>
                    <td>{when(e.createdAt)}</td>
                    <td>{KIND_LABEL[e.kind] || e.kind}</td>
                    <td>{e.partyName || "—"}</td>
                    <td className="num">{rs(e.amountInr)}</td>
                    <td>{e.notes || ""}</td>
                    <td>{e.createdByName || ""}</td>
                  </tr>
                ))}
                {!missing.length && (
                  <tr>
                    <td colSpan={7} className="hub-empty">
                      Every cash payment in this period has a proof ✓
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="hub-card">
        <h3>This device</h3>
        <DeviceCopySettings lang="en" />
      </section>
    </div>
  );
}
