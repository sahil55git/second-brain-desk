"use client";

// 🕘 Attendance (/attendance): mark each person present / half day / absent, check in and out
// with a selfie and the phone's location (shows how far from the shop), and see the month's days.
// Daily wages (Employees → Daily wages) fill the days worked from here.
import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { STATUS_LABEL, shiftText, type AttStatus } from "@/lib/attendance";
import "./attendance.css";

interface Att { status: AttStatus; inAt: string | null; outAt: string | null; photo: string | null; distanceM: number | null; note: string | null; markedBy: string | null }
interface Row { id: string; name: string; role: string; payType: string; att: Att | null }

const todayIST = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
const dmy = (d: string) => d.split("-").reverse().join("-");

/** A small JPEG (longest side 320 px) from a camera photo. */
async function shrink(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((ok, bad) => { const i = new Image(); i.onload = () => ok(i); i.onerror = bad; i.src = url; });
    const k = Math.min(1, 320 / Math.max(img.width, img.height));
    const c = document.createElement("canvas");
    c.width = Math.round(img.width * k);
    c.height = Math.round(img.height * k);
    c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL("image/jpeg", 0.72);
  } finally {
    URL.revokeObjectURL(url);
  }
}
const where = () =>
  new Promise<GeolocationPosition | null>((ok) => {
    if (!navigator.geolocation) return ok(null);
    navigator.geolocation.getCurrentPosition(ok, () => ok(null), { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 });
  });

export default function AttendanceDesk() {
  const { data: session } = useSession();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const isOwner = (session?.user as any)?.role === "OWNER";
  const [date, setDate] = useState(todayIST());
  const [rows, setRows] = useState<Row[] | null>(null);
  const [place, setPlace] = useState<{ lat: number; lng: number } | null>(null);
  const [month, setMonth] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [view, setView] = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = await fetch(`/api/attendance?date=${date}`);
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return setMsg({ ok: false, t: j.error || "Could not load." });
    setRows(j.data);
    setPlace(j.place);
    const m = await fetch(`/api/attendance?month=${date.slice(0, 7)}`).then((x) => x.json()).catch(() => ({}));
    setMonth(m.data?.days || {});
  }, [date]);
  useEffect(() => { void load(); }, [load]);

  const post = async (body: Record<string, unknown>, okText: string) => {
    const r = await fetch("/api/attendance", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ date, ...body }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || "Could not save.");
    setMsg({ ok: true, t: okText + (typeof j.distanceM === "number" ? ` · ${j.distanceM} m from the shop` : "") });
    await load();
  };
  const mark = (row: Row, status: AttStatus) => {
    setBusy(row.id);
    post({ employeeId: row.id, status }, `${row.name}: ${STATUS_LABEL[status]}`).catch((e) => setMsg({ ok: false, t: e.message })).finally(() => setBusy(null));
  };
  const check = async (row: Row, action: "in" | "out", file?: File) => {
    setBusy(row.id);
    try {
      const [photo, pos] = await Promise.all([file ? shrink(file) : Promise.resolve(undefined), where()]);
      await post({ employeeId: row.id, action, photo, lat: pos?.coords.latitude, lng: pos?.coords.longitude, accuracyM: pos?.coords.accuracy }, `${row.name} checked ${action}`);
    } catch (e) {
      setMsg({ ok: false, t: e instanceof Error ? e.message : "Could not save." });
    } finally {
      setBusy(null);
    }
  };
  const setShopHere = async () => {
    const pos = await where();
    if (!pos) return setMsg({ ok: false, t: "Allow location for this site, then try again." });
    const cur = await fetch("/api/settings/app?key=shop").then((r) => r.json()).catch(() => ({}));
    await fetch("/api/settings/app", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: "shop", data: { ...(cur.data || {}), lat: pos.coords.latitude, lng: pos.coords.longitude } }) });
    setMsg({ ok: true, t: "Shop location saved — check-ins now show how far away they were." });
    void load();
  };

  const present = (rows || []).filter((r) => r.att && r.att.status !== "A").length;
  return (
    <div className="hub att">
      <header className="hub-top">
        <div><h1>🕘 Attendance</h1><div className="hub-m">{rows ? `${present} of ${rows.length} at work` : "…"} · {dmy(date)}</div></div>
        <nav className="hub-links">
          <input type="date" value={date} max={todayIST()} onChange={(e) => setDate(e.target.value)} aria-label="Day" disabled={!isOwner} />
          <a className="hub-btn" href="/employees#wages">🧑‍🏭 Daily wages</a>
        </nav>
      </header>
      {msg && <div className={`att-msg${msg.ok ? " ok" : ""}`} role="status">{msg.t}</div>}
      {isOwner && !place && <div className="hub-banner">Stand in the shop and <button className="hub-btn sm" onClick={() => void setShopHere()}>📍 Set the shop&apos;s location</button> so check-ins show the distance.</div>}
      <div className="att-list">
        {(rows || []).map((r) => {
          const a = r.att;
          return (
            <div key={r.id} className={`hub-card att-row ${a ? a.status : "none"}`}>
              <div className="att-who">
                {a?.photo && a.photo !== "yes" ? <button className="att-ph" onClick={() => setView(a.photo)} aria-label={`Photo of ${r.name}`}>{/* eslint-disable-next-line @next/next/no-img-element */}<img src={a.photo} alt="" /></button> : <span className="att-ph empty">{r.name.slice(0, 1)}</span>}
                <div>
                  <b>{r.name}</b> <small className="hub-m">{r.role}{r.payType === "DAILY" ? " · daily wage" : ""}</small>
                  <div className="hub-m small">
                    {a ? `${STATUS_LABEL[a.status]}${a.inAt ? ` · ${shiftText(a.inAt, a.outAt)}` : ""}${a.distanceM != null ? ` · ${a.distanceM < 1000 ? `${a.distanceM} m` : `${(a.distanceM / 1000).toFixed(1)} km`} away` : ""}` : "not marked"}
                    {month[r.id] ? ` · ${month[r.id]} days this month` : ""}
                  </div>
                </div>
              </div>
              <div className="att-btns">
                {(["P", "H", "A"] as AttStatus[]).map((s) => (
                  <button key={s} className={`att-s ${s}${a?.status === s ? " on" : ""}`} disabled={busy === r.id} onClick={() => mark(r, s)}>{s === "P" ? "✓ Present" : s === "H" ? "½ Half" : "✕ Absent"}</button>
                ))}
                {date === todayIST() && (
                  <>
                    <label className={`hub-btn sm att-cam${busy === r.id ? " dis" : ""}`}>
                      📸 {a?.inAt ? "In again" : "Check in"}
                      <input type="file" accept="image/*" capture="user" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void check(r, "in", f); }} />
                    </label>
                    {a?.inAt && !a.outAt && <button className="hub-btn sm" disabled={busy === r.id} onClick={() => void check(r, "out")}>🏁 Check out</button>}
                  </>
                )}
              </div>
            </div>
          );
        })}
        {rows && rows.length === 0 && <p className="hub-m">No staff yet — add people in Employees.</p>}
      </div>
      {isOwner && place && <p className="hub-m small">Shop location set · <button className="hub-btn sm" onClick={() => void setShopHere()}>📍 Set again from here</button></p>}
      {view && (
        <div className="att-view" onClick={() => setView(null)} role="dialog" aria-label="Photo">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={view} alt="Check-in photo" />
        </div>
      )}
    </div>
  );
}
