"use client";

// Settings → Users & profiles (Owner only). Add logins, give each a profile, and
// edit what a profile can open, use, see and have hidden.
import { useCallback, useEffect, useState } from "react";
import { FN_DEFS, HIDE_DEFS, PAGE_DEFS, WIN_DEFS, BUILTIN_IDS, type Perms, type ProfileDef } from "@/lib/access";

interface UserRow { id: string; username: string; name: string; role: string; active: boolean; profileKey: string | null }

async function call<T>(url: string, method: string, body?: unknown): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  try {
    const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return { ok: false, error: j.error || `Something went wrong (${r.status})` };
    return { ok: true, data: j.data as T };
  } catch {
    return { ok: false, error: "Could not reach the server." };
  }
}

export default function AccessAdmin() {
  const [profiles, setProfiles] = useState<ProfileDef[]>([]);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [sel, setSel] = useState("counter");
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", username: "", password: "", profileKey: "counter" });
  const [adding, setAdding] = useState(false);

  const flash = (m: string) => { setErr(null); setMsg(m); window.setTimeout(() => setMsg(null), 1800); };
  const fail = (e: string) => { setMsg(null); setErr(e); };

  const load = useCallback(async () => {
    const [p, u] = await Promise.all([call<ProfileDef[]>("/api/access/profiles", "GET"), call<UserRow[]>("/api/users", "GET")]);
    if (p.ok) setProfiles(p.data); else fail(p.error);
    if (u.ok) setUsers(u.data); else fail(u.error);
  }, []);
  useEffect(() => { load(); }, [load]);

  const prof = profiles.find((p) => p.id === sel) || profiles[0];
  const locked = !prof || prof.id === "owner";
  const nameOf = (key: string | null) => profiles.find((p) => p.id === (key || "manager"))?.name || "Manager";

  async function toggle(group: keyof Perms, key: string) {
    if (!prof || locked) return;
    const next = { ...prof.perms, [group]: { ...prof.perms[group], [key]: !(prof.perms[group] as Record<string, boolean>)[key] } } as Perms;
    setProfiles((ps) => ps.map((p) => (p.id === prof.id ? { ...p, perms: next } : p)));
    const r = await call<ProfileDef>(`/api/access/profiles/${prof.id}`, "PATCH", { perms: next });
    if (!r.ok) { fail(r.error); load(); } else flash("Saved");
  }
  async function rename(name: string) {
    if (!prof || locked || !name.trim() || name.trim() === prof.name) return;
    const r = await call<ProfileDef>(`/api/access/profiles/${prof.id}`, "PATCH", { name });
    if (!r.ok) return fail(r.error);
    flash("Saved"); load();
  }
  async function newProfile() {
    const r = await call<ProfileDef>("/api/access/profiles", "POST", { copyFrom: prof?.id || "counter", name: `${prof?.name || "Profile"} copy` });
    if (!r.ok) return fail(r.error);
    await load(); setSel(r.data.id); flash("New profile made — rename it and choose what it can do");
  }
  async function removeProfile() {
    if (!prof || BUILTIN_IDS.includes(prof.id)) return;
    if (!window.confirm(`Delete the profile "${prof.name}"?`)) return;
    const r = await call<{ id: string }>(`/api/access/profiles/${prof.id}`, "DELETE");
    if (!r.ok) return fail(r.error);
    setSel("counter"); flash("Deleted"); load();
  }
  async function patchUser(u: UserRow, body: Record<string, unknown>, done: string) {
    const r = await call<UserRow>(`/api/users/${u.id}`, "PATCH", body);
    if (!r.ok) return fail(r.error);
    flash(done); load();
  }
  async function addUser(e: React.FormEvent) {
    e.preventDefault();
    setAdding(true);
    const r = await call<UserRow>("/api/users", "POST", form);
    setAdding(false);
    if (!r.ok) return fail(r.error);
    setForm({ name: "", username: "", password: "", profileKey: form.profileKey });
    flash(`${r.data.name} added`); load();
  }

  const Group = ({ title, group, defs, hint, invert }: { title: string; group: keyof Perms; defs: readonly { key: string; label: string }[]; hint?: string; invert?: boolean }) => (
    <div className="set-row" style={{ alignItems: "flex-start" }}>
      <span className="lab">{title}{hint && <small>{hint}</small>}</span>
      <div className="set-chips" style={{ justifyContent: "flex-end" }}>
        {defs.map((d) => {
          const v = !!(prof!.perms[group] as Record<string, boolean>)[d.key];
          return (
            <button key={d.key} type="button" disabled={locked} className={`set-chip${v ? " on" : ""}`} aria-pressed={v} onClick={() => toggle(group, d.key)}>
              {invert ? (v ? "🙈 " : "👁 ") : v ? "✓ " : "✕ "}{d.label}
            </button>
          );
        })}
      </div>
    </div>
  );

  return (
    <>
      <div className="hub-m" style={{ minHeight: 20 }}>
        {msg && <span className="set-saved">{msg}</span>}
        {err && <span style={{ color: "var(--h-r)", fontWeight: 700 }}>{err}</span>}
      </div>

      <section className="hub-card">
        <h3>Users</h3>
        <div className="hub-m small" style={{ marginBottom: 6 }}>Each person signs in with their own login. Their profile decides what they can open, use and see.</div>
        {users.map((u) => (
          <div key={u.id} className="set-row" style={{ opacity: u.active ? 1 : 0.55 }}>
            <span className="lab">
              {u.name}{u.role === "OWNER" && " (owner)"}
              <small>login: {u.username}{!u.active && " · switched off"}</small>
            </span>
            <span style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
              {u.role === "OWNER" ? (
                <span className="set-chip on">Owner</span>
              ) : (
                <>
                  <select value={u.profileKey || "manager"} onChange={(e) => patchUser(u, { profileKey: e.target.value }, "Profile changed")} aria-label={`Profile for ${u.name}`}>
                    {profiles.filter((p) => p.id !== "owner").map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    {!u.profileKey && <option value="manager">{nameOf(null)}</option>}
                  </select>
                  <button className="hub-btn sm" onClick={() => patchUser(u, { active: !u.active }, u.active ? "Switched off" : "Switched on")}>{u.active ? "Switch off" : "Switch on"}</button>
                  <button className="hub-btn sm" onClick={() => { const pw = window.prompt(`New password for ${u.name} (6+ characters)`); if (pw) patchUser(u, { password: pw }, "Password changed"); }}>Reset password</button>
                </>
              )}
            </span>
          </div>
        ))}
        <form onSubmit={addUser} style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", marginTop: 12 }}>
          <input placeholder="Name (e.g. Ravi)" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          <input placeholder="Login name" autoCapitalize="none" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} required />
          <input placeholder="Password (6+)" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required minLength={6} />
          <select value={form.profileKey} onChange={(e) => setForm({ ...form, profileKey: e.target.value })} aria-label="Profile">
            {profiles.filter((p) => p.id !== "owner").map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <button className="hub-btn primary" disabled={adding}>+ Add user</button>
        </form>
      </section>

      <section className="hub-card">
        <h3>Profiles</h3>
        <div className="set-chips" style={{ margin: "8px 0" }}>
          {profiles.map((p) => (
            <button key={p.id} className={`set-chip${sel === p.id ? " on" : ""}`} onClick={() => setSel(p.id)}>
              {p.name} · {users.filter((u) => (u.role === "OWNER" ? "owner" : u.profileKey || "manager") === p.id).length}
            </button>
          ))}
          <button className="set-chip" onClick={newProfile}>+ New profile (copy of this)</button>
        </div>
        {prof && (
          <>
            <div className="set-row">
              <span className="lab">Name<small>{locked ? "The Owner profile always sees everything." : prof.who}</small></span>
              <span style={{ display: "flex", gap: 6 }}>
                <input key={prof.id} defaultValue={prof.name} disabled={locked} onBlur={(e) => rename(e.target.value)} style={{ width: 160 }} />
                {!BUILTIN_IDS.includes(prof.id) && <button className="hub-btn sm" onClick={removeProfile}>Delete</button>}
              </span>
            </div>
            <Group title="Pages they can open" group="pg" defs={PAGE_DEFS.filter((d) => d.key !== "settings")} hint="Settings is always the owner's alone." />
            <Group title="Quick Register functions" group="fn" defs={FN_DEFS} hint="Switched-off ones disappear from the buttons and are refused by the server." />
            <Group title="Windows they see" group="win" defs={WIN_DEFS} />
            <Group title="Data to hide" group="hide" defs={HIDE_DEFS} invert hint="Other users' entries and rates are removed on the server. Totals, profit and udhaar are hidden on screen." />
          </>
        )}
      </section>
    </>
  );
}
