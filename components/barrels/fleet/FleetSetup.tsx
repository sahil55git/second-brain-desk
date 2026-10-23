"use client";

// Setup: register the barrels once (owner), print their permanent labels, and keep each barrel's
// details: mark, capacity, condition, retired or not. Staff can report a dent or a leak.
import { useCallback, useEffect, useState } from "react";
import { CONDITIONS } from "@/lib/barrelFleet";
import { api, kg, when } from "@/components/barrels/shared";
import type { FBarrel } from "@/components/barrels/fleet/types";

export default function FleetSetup({ isOwner, defaults, onChanged }: { isOwner: boolean; defaults: { capacityKg: number; usualFillKg: number }; onChanged: () => void }) {
  const [all, setAll] = useState<FBarrel[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [count, setCount] = useState("20");
  const [startNo, setStartNo] = useState("");
  const [capacity, setCapacity] = useState(String(defaults.capacityKg));
  const [mark, setMark] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [showRetired, setShowRetired] = useState(false);

  const load = useCallback(async () => {
    try {
      const j = await api<{ data: FBarrel[] }>("/api/barrel-fleet?all=1");
      setAll(j.data);
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not load.");
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const register = async () => {
    setBusy(true);
    setOk(null);
    setErr(null);
    try {
      const j = await api<{ data: FBarrel[] }>("/api/barrel-fleet", { method: "POST", json: { count: Number(count), startNo: startNo ? Number(startNo) : undefined, capacityKg: Number(capacity), mark: mark.trim() || undefined } });
      setOk(`${j.data.length} barrel(s) registered: ${j.data[0].code}${j.data.length > 1 ? ` … ${j.data[j.data.length - 1].code}` : ""}. Print their labels, stick them on, then weigh each one empty to set its tare.`);
      setMark("");
      await load();
      onChanged();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not register.");
    } finally {
      setBusy(false);
    }
  };

  const rows = all.filter((b) => showRetired || b.active);
  const live = all.filter((b) => b.active);
  const retiredCount = all.length - live.length;

  return (
    <>
      {isOwner && (
        <div className="bd-card">
          <h3>➕ Register barrels</h3>
          <div className="bd-m small">Each barrel gets one permanent code (BRL-01, BRL-02 …). Numbers already used are skipped. Registering never changes existing barrels.</div>
          <div className="bd-form" style={{ marginTop: 8 }}>
            <label>
              How many
              <input inputMode="numeric" value={count} onChange={(e) => setCount(e.target.value)} aria-label="How many barrels" />
            </label>
            <label>
              Start at number (optional)
              <input inputMode="numeric" value={startNo} onChange={(e) => setStartNo(e.target.value)} placeholder="next free" aria-label="Start number" />
            </label>
            <label>
              Capacity kg (most oil it may take)
              <input inputMode="decimal" value={capacity} onChange={(e) => setCapacity(e.target.value)} aria-label="Capacity in kg" />
            </label>
            {Number(count) === 1 && (
              <label>
                Mark (optional)
                <input value={mark} onChange={(e) => setMark(e.target.value)} placeholder="blue, dent on lid" aria-label="Mark" />
              </label>
            )}
          </div>
          <div className="bd-m small">Usual fill is {defaults.usualFillKg} kg; a barrel can take up to {defaults.capacityKg} kg. A full weighing above the capacity is flagged.</div>
          <button className="bd-btn primary big" disabled={busy || !(Number(count) >= 1)} onClick={register}>
            ➕ Register {Number(count) >= 1 ? count : ""} barrel(s)
          </button>
        </div>
      )}
      {ok && <div className="bd-ok">{ok}</div>}
      {err && <div className="bd-err">{err}</div>}

      <div className="bd-card">
        <div className="bd-row bd-gap">
          <h3 style={{ margin: 0 }}>🛢️ Our barrels ({live.length})</h3>
          <a className="bd-btn" href="/barrels/fleet/labels?codes=all" target="_blank" rel="noreferrer">🏷️ Print all labels</a>
          {retiredCount > 0 && (
            <label className="bd-check">
              <input type="checkbox" checked={showRetired} onChange={(e) => setShowRetired(e.target.checked)} /> show {retiredCount} retired
            </label>
          )}
        </div>
        {!rows.length && <div className="bd-empty">No barrels yet.</div>}
        <div className="bd-tablewrap">
          <table className="bd-table">
            <thead>
              <tr>
                <th>Barrel</th>
                <th>Mark</th>
                <th className="num">Capacity</th>
                <th className="num">Tare</th>
                <th>Condition</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((b) => (
                <FragmentRow key={b.id} b={b} isOwner={isOwner} editing={editing === b.code} onEdit={() => setEditing(editing === b.code ? null : b.code)} onSaved={() => { setEditing(null); load(); onChanged(); }} />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

function FragmentRow({ b, isOwner, editing, onEdit, onSaved }: { b: FBarrel; isOwner: boolean; editing: boolean; onEdit: () => void; onSaved: () => void }) {
  return (
    <>
      <tr className={b.condition === "LEAKING" ? "alert" : b.condition === "DENTED" ? "warn" : ""}>
        <td><b>{b.code}</b></td>
        <td>{b.mark ?? <span className="bd-m">—</span>}</td>
        <td className="num">{kg(b.capacityKg)} kg</td>
        <td className="num">{b.tareKg != null ? `${kg(b.tareKg)} kg` : "not set"}{b.tareAt ? <div className="bd-m tiny">{when(b.tareAt)}{b.tareBy ? ` · ${b.tareBy}` : ""}</div> : null}</td>
        <td>{b.condition}{b.notes ? <div className="bd-m tiny">{b.notes}</div> : null}</td>
        <td>
          <a className="bd-linkbtn" href={`/barrels/fleet/labels?codes=${encodeURIComponent(b.code)}`} target="_blank" rel="noreferrer">label</a>{" "}
          <button className="bd-linkbtn" onClick={onEdit}>{editing ? "close" : "edit"}</button>
        </td>
      </tr>
      {editing && (
        <tr>
          <td colSpan={6}>
            <EditPanel b={b} isOwner={isOwner} onSaved={onSaved} />
          </td>
        </tr>
      )}
    </>
  );
}

function EditPanel({ b, isOwner, onSaved }: { b: FBarrel; isOwner: boolean; onSaved: () => void }) {
  const [mark, setMark] = useState(b.mark ?? "");
  const [capacity, setCapacity] = useState(String(b.capacityKg));
  const [condition, setCondition] = useState(b.condition);
  const [notes, setNotes] = useState(b.notes ?? "");
  const [why, setWhy] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Staff may only report a problem; the owner can choose anything.
  const options = isOwner ? CONDITIONS.filter((c) => c !== "RETIRED") : Array.from(new Set([b.condition, "DENTED", "LEAKING"])).filter((c) => c !== "RETIRED");

  const patch = async (body: Record<string, unknown>) => {
    setBusy(true);
    setErr(null);
    try {
      await api(`/api/barrel-fleet/${encodeURIComponent(b.code)}`, { method: "PATCH", json: { ...body, note: why.trim() || undefined } });
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  };
  const save = () => {
    const body: Record<string, unknown> = {};
    if (notes.trim() !== (b.notes ?? "")) body.notes = notes.trim();
    if (condition !== b.condition) body.condition = condition;
    if (isOwner && mark.trim() !== (b.mark ?? "")) body.mark = mark.trim();
    if (isOwner && Number(capacity) !== b.capacityKg) body.capacityKg = Number(capacity);
    if (!Object.keys(body).length) return setErr("Nothing changed.");
    void patch(body);
  };

  return (
    <div className="bd-mbox">
      <div className="bd-form">
        {isOwner && (
          <>
            <label>
              Mark
              <input value={mark} onChange={(e) => setMark(e.target.value)} aria-label="Mark" />
            </label>
            <label>
              Capacity kg
              <input inputMode="decimal" value={capacity} onChange={(e) => setCapacity(e.target.value)} aria-label="Capacity" />
            </label>
          </>
        )}
        <label>
          Condition
          <select value={condition} onChange={(e) => setCondition(e.target.value)} aria-label="Condition">
            {options.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <label>
          Notes
          <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. lid does not seal" aria-label="Notes" />
        </label>
        <label className="wide">
          Reason (needed when the owner marks a barrel OK again or retires it)
          <input value={why} onChange={(e) => setWhy(e.target.value)} aria-label="Reason" />
        </label>
      </div>
      {!isOwner && <div className="bd-m small">You can report a dent or a leak. Only the owner can mark a barrel OK again, retire it, or change its tare.</div>}
      {err && <div className="bd-err">{err}</div>}
      <div className="bd-row">
        <button className="bd-btn primary" disabled={busy} onClick={save}>Save changes</button>
        {isOwner && b.active && (
          <button className="bd-btn danger" disabled={busy} onClick={() => patch({ active: false })}>Retire this barrel</button>
        )}
        {isOwner && !b.active && (
          <button className="bd-btn" disabled={busy} onClick={() => patch({ active: true })}>Bring it back</button>
        )}
      </div>
    </div>
  );
}
