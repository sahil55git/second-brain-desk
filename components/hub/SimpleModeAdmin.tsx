"use client";

// Settings → Simple mode (Owner only). Pick the big buttons, letter size and
// language, save the choice under a NAME, and decide which setting opens by
// itself when each person signs in (one person ↔ one setting).
import { useCallback, useEffect, useState } from "react";
import { SIMPLE_TILE_CHOICES, assignPerson, deleteMode, normalizeSimpleAssign, normalizeSimpleModes, type SimpleMode, type SimpleSize } from "@/lib/simpleMode";
import type { LangMode } from "@/lib/register";

interface UserRow { id: string; username: string; name: string; role: string; active: boolean }
const LANGS: [LangMode, string][] = [["both", "EN + ಕನ್ನಡ"], ["en", "EN"], ["kn", "ಕನ್ನಡ"]];
const SIZES: SimpleSize[] = ["S", "M", "L"];
const newId = () => `s${Date.now().toString(36)}`;

export default function SimpleModeAdmin() {
  const [modes, setModes] = useState<SimpleMode[]>([]);
  const [assign, setAssign] = useState<Record<string, string>>({});
  const [users, setUsers] = useState<UserRow[]>([]);
  const [sel, setSel] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [c, u] = await Promise.all([fetch("/api/register/config"), fetch("/api/users")]);
      const cj = await c.json();
      if (!c.ok) throw new Error(cj.error || `HTTP ${c.status}`);
      const m = normalizeSimpleModes(cj.data?.simpleModes);
      setModes(m);
      setAssign(normalizeSimpleAssign(cj.data?.simpleAssign, m));
      setSel((cur) => (cur && m.some((x) => x.id === cur) ? cur : m[0]?.id ?? null));
      const uj = await u.json().catch(() => ({}));
      if (u.ok) setUsers((uj.data as UserRow[]).filter((x) => x.active));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not load");
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const cur = modes.find((m) => m.id === sel) || null;
  const patch = (p: Partial<SimpleMode>) => cur && setModes((all) => all.map((m) => (m.id === cur.id ? { ...m, ...p } : m)));
  const toggleTile = (k: string) => cur && patch({ tiles: cur.tiles.includes(k) ? cur.tiles.filter((t) => t !== k) : [...cur.tiles, k] });

  async function save(nextModes = modes, nextAssign = assign, ok = "Saved ✓") {
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch("/api/register/config", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ simpleModes: nextModes, simpleAssign: nextAssign }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
      const m = normalizeSimpleModes(j.data.simpleModes);
      setModes(m);
      setAssign(normalizeSimpleAssign(j.data.simpleAssign, m));
      setMsg(ok);
      window.setTimeout(() => setMsg(null), 1800);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not save");
    } finally {
      setBusy(false);
    }
  }
  const add = () => {
    const m: SimpleMode = { id: newId(), name: `Setting ${modes.length + 1}`, tiles: ["SALE", "EXPENSE", "UDHAAR_IN", "count", "cashtally"], size: "L", lang: "both" };
    setModes([...modes, m]);
    setSel(m.id);
  };
  const remove = () => {
    if (!cur || !window.confirm(`Delete "${cur.name}"? People using it go back to the full register.`)) return;
    const r = deleteMode(modes, assign, cur.id);
    setSel(r.modes[0]?.id ?? null);
    save(r.modes, r.assign, "Deleted");
  };
  const toggleUser = (username: string) => {
    if (!cur) return;
    const u = username.toLowerCase();
    setAssign((a) => assignPerson(a, u, a[u] === cur.id ? null : cur.id));
  };

  return (
    <section className="hub-card">
      <div className="hub-card-head"><h3>🧸 Simple mode</h3></div>
      <div className="hub-m">
        Make the Quick Register easy for someone who finds it too busy. Choose the big buttons, letter size and language, save it under a name, then say who gets it. It opens by itself when that person signs in. They can still tap 🧸 to see everything, but they cannot change the buttons you chose.
      </div>
      {err && <div className="hub-banner">{err}</div>}
      {msg && <div className="hub-banner" style={{ borderColor: "var(--h-g)", color: "var(--h-g)" }}>{msg}</div>}

      <div className="stk-row" style={{ flexWrap: "wrap", gap: 6, margin: "10px 0" }}>
        {modes.map((m) => (
          <button key={m.id} className={`hub-btn sm${m.id === sel ? " on" : ""}`} style={m.id === sel ? { borderColor: "var(--h-acc)" } : undefined} onClick={() => setSel(m.id)}>
            {m.name}
          </button>
        ))}
        <button className="hub-btn sm" onClick={add}>＋ New setting</button>
      </div>

      {!cur ? (
        <div className="hub-empty">No simple setting yet. Press “New setting”.</div>
      ) : (
        <div style={{ display: "grid", gap: 12 }}>
          <label style={{ display: "grid", gap: 4, maxWidth: 320, fontWeight: 700, fontSize: 13 }}>
            Name
            <input value={cur.name} maxLength={40} onChange={(e) => patch({ name: e.target.value })} />
          </label>
          <div>
            <b style={{ fontSize: 13 }}>Big buttons to show</b>
            <div className="stk-row" style={{ flexWrap: "wrap", gap: 6, marginTop: 6 }}>
              {SIMPLE_TILE_CHOICES.map((t) => {
                const on = cur.tiles.includes(t.key);
                return (
                  <button key={t.key} className="hub-btn sm" aria-pressed={on} style={on ? { borderColor: "var(--h-g)", background: "#e3e8d7", color: "#3f4a2d" } : undefined} onClick={() => toggleTile(t.key)}>
                    {on ? "✓ " : ""}{t.icon} {t.en}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="stk-row" style={{ flexWrap: "wrap", gap: 18 }}>
            <div>
              <b style={{ fontSize: 13 }}>Letter size</b>
              <div className="stk-seg" style={{ marginTop: 6 }}>
                {SIZES.map((s) => <button key={s} className={cur.size === s ? "on" : ""} onClick={() => patch({ size: s })}>{s}</button>)}
              </div>
            </div>
            <div>
              <b style={{ fontSize: 13 }}>Language</b>
              <div className="stk-seg" style={{ marginTop: 6 }}>
                {LANGS.map(([v, l]) => <button key={v} className={cur.lang === v ? "on" : ""} onClick={() => patch({ lang: v })}>{l}</button>)}
              </div>
            </div>
          </div>
          <div>
            <b style={{ fontSize: 13 }}>Opens automatically for</b>
            <div className="hub-m">One person can have one setting. Choosing someone who already has another setting moves them here.</div>
            <div className="stk-row" style={{ flexWrap: "wrap", gap: 6, marginTop: 6 }}>
              {users.length === 0 && <span className="hub-m">No other people yet. Add them under Users &amp; profiles.</span>}
              {users.map((u) => {
                const mine = assign[u.username.toLowerCase()] === cur.id;
                const other = modes.find((m) => m.id === assign[u.username.toLowerCase()] && m.id !== cur.id);
                return (
                  <button key={u.id} className="hub-btn sm" aria-pressed={mine} style={mine ? { borderColor: "var(--h-g)", background: "#e3e8d7", color: "#3f4a2d" } : undefined} onClick={() => toggleUser(u.username)}>
                    {mine ? "✓ " : ""}{u.name || u.username}{other ? ` (now: ${other.name})` : ""}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="stk-row" style={{ gap: 8 }}>
            <button className="hub-btn" style={{ background: "var(--h-acc)", color: "#fff" }} disabled={busy || !cur.name.trim() || !cur.tiles.length} onClick={() => save()}>
              {busy ? "Saving…" : "Save this setting"}
            </button>
            <button className="hub-btn" onClick={remove}>Delete</button>
          </div>
        </div>
      )}
    </section>
  );
}
