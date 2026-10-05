"use client";

// Settings (/settings) — Owner only. One place for every setting:
//  • Shop-wide Quick Register config (stored in the database, RegisterConfig)
//  • Defaults for new devices, saved rates, item libraries
//  • This device's register & dashboard preferences (localStorage)
//  • Business profile & scale connections (existing Settings desk)
//  • The fixed business rules (read-only, with where each comes from)
//  • Data backup / export

import { useCallback, useEffect, useState } from "react";
import SettingsDesk from "@/components/SettingsDesk";
import type { BusinessSettingsDTO } from "@/lib/types";
import {
  CATALOG,
  DEFAULT_CONFIG,
  MASS_BALANCE_TOLERANCE_PCT,
  businessDate,
  slugify,
  type RegisterConfigData,
  type RegisterKind,
} from "@/lib/register";
import { CAN_TYPES, CASH_GAP_THRESHOLD_INR, KHALI_SPLIT, STANDARD_RATE } from "@/lib/calculations";
import { JOBWORK_OVERDUE_DAYS } from "@/lib/reports";
import { DEFAULT_HUB_PREFS, WIDGETS, loadHubPrefs, saveHubPrefs, type HubPrefs, type Preset } from "@/lib/hubPrefs";
import { registerItemName } from "@/lib/bizReports";

type Section = "register" | "rates" | "library" | "device" | "dashboard" | "business" | "rules" | "data";
const SECTIONS: { key: Section; label: string }[] = [
  { key: "register", label: "📒 Quick Register" },
  { key: "rates", label: "₹ Saved rates" },
  { key: "library", label: "⭐ Item library" },
  { key: "device", label: "📱 This device" },
  { key: "dashboard", label: "📈 Dashboard & reports" },
  { key: "business", label: "🏢 Business & scales" },
  { key: "rules", label: "📏 Business rules" },
  { key: "data", label: "💾 Data & backup" },
];

const TILE_CHOICES: { key: string; label: string }[] = [
  { key: "SALE", label: "💰 Sale" },
  { key: "FRESH_CRUSH", label: "🫗 Fresh crush" },
  { key: "UDHAAR_IN", label: "🙌 Udhaar received" },
  { key: "PURCHASE", label: "🛒 Purchase" },
  { key: "EXPENSE", label: "🧾 Expense" },
  { key: "PAYMENT", label: "🤝 Payment / Salary" },
  { key: "jwNew", label: "🌾 New intake" },
  { key: "jwSettle", label: "💳 Pay / settle" },
  { key: "PIGMEE", label: "🏦 Pigmee" },
  { key: "OWNER_DRAW", label: "🧔 Sahil took" },
  { key: "count", label: "💵 Count cash" },
  { key: "calc", label: "🧮 Calculator" },
  { key: "reports", label: "🖨️ Reports" },
];
const WORK_CHOICES = [
  { key: "calc", label: "🧮 Calculator" },
  { key: "notepad", label: "📝 Notepad" },
  { key: "FRESH_CRUSH", label: "🫗 Fresh crush" },
  { key: "SALE", label: "💰 Sale" },
  { key: "EXPENSE", label: "🧾 Expense" },
  { key: "PURCHASE", label: "🛒 Purchase" },
  { key: "jwNew", label: "🌾 New intake" },
  { key: "count", label: "💵 Count cash" },
];
const LIB_KINDS: RegisterKind[] = ["SALE", "FRESH_CRUSH", "PURCHASE", "EXPENSE", "PAYMENT"];
const KIND_LABEL: Partial<Record<RegisterKind, string>> = {
  SALE: "Sale items",
  FRESH_CRUSH: "Fresh crush seeds",
  PURCHASE: "Purchase items",
  EXPENSE: "Expense types",
  PAYMENT: "Payment types",
};

function Chips({ options, value, onChange, multi }: { options: { key: string; label: string }[]; value: string[]; onChange: (v: string[]) => void; multi?: boolean }) {
  return (
    <div className="set-chips">
      {options.map((o) => {
        const on = value.includes(o.key);
        return (
          <button
            key={o.key}
            type="button"
            className={`set-chip${on ? " on" : ""}`}
            aria-pressed={on}
            onClick={() => onChange(multi ? (on ? value.filter((v) => v !== o.key) : [...value, o.key]) : [o.key])}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export default function SettingsHub() {
  const [section, setSection] = useState<Section>("register");
  const [cfg, setCfg] = useState<RegisterConfigData | null>(null);
  const [biz, setBiz] = useState<BusinessSettingsDTO | null | undefined>(undefined);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [hub, setHub] = useState<HubPrefs>(DEFAULT_HUB_PREFS);

  const flash = (m: string) => {
    setMsg(m);
    window.setTimeout(() => setMsg(null), 1800);
  };

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/register/config");
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
      setCfg(j.data);
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not load settings");
    }
    fetch("/api/settings")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => setBiz(j?.data ?? null))
      .catch(() => setBiz(null));
  }, []);

  useEffect(() => {
    load();
    setHub(loadHubPrefs());
    const want = new URLSearchParams(window.location.search).get("section") as Section | null;
    if (want && SECTIONS.some((s) => s.key === want)) setSection(want);
  }, [load]);

  async function save(patch: Partial<RegisterConfigData>) {
    if (!cfg) return;
    const next = { ...cfg, ...patch };
    setCfg(next);
    try {
      const r = await fetch("/api/register/config", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(next) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
      setCfg(j.data);
      flash("Saved ✓");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not save");
    }
  }
  const updateHub = (fn: (p: HubPrefs) => HubPrefs) =>
    setHub((p) => {
      const n = fn(p);
      saveHubPrefs(n);
      flash("Saved on this device ✓");
      return n;
    });

  // ------------------------------------------------------------------------
  const rateRows = cfg
    ? Object.entries(cfg.rates)
        .map(([key, rate]) => {
          const [kind, item, unit] = key.split(":");
          const name = registerItemName({ kind: kind as RegisterKind, item: item === "_" ? null : item, itemLabel: (cfg.customItems[kind as RegisterKind] || []).find((c) => c.key === item)?.label || null });
          return { key, kind, name, unit: unit || "", rate };
        })
        .sort((a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name))
    : [];

  return (
    <div className="hub">
      <header className="hub-top">
        <div>
          <h1>⚙️ Settings</h1>
          <div className="hub-m">
            Shop-wide settings are saved for everyone; &ldquo;This device&rdquo; settings stay on this phone or laptop.{" "}
            {msg && <span className="set-saved">{msg}</span>}
          </div>
        </div>
        <nav className="hub-links">
          <a className="hub-btn" href="/register">📒 Quick Register</a>
          <a className="hub-btn" href="/reports">📊 Reports</a>
          <a className="hub-btn" href="/">🗂️ Full desk</a>
        </nav>
      </header>
      {err && <div className="hub-banner">{err}</div>}

      <div className="set-layout">
        <nav className="set-nav" aria-label="Settings sections">
          {SECTIONS.map((s) => (
            <button key={s.key} className={section === s.key ? "on" : ""} onClick={() => setSection(s.key)}>
              {s.label}
            </button>
          ))}
        </nav>

        <div>
          {section === "register" && cfg && (
            <>
              <section className="hub-card">
                <h3>Quick Register — shop-wide</h3>
                <div className="set-row">
                  <span className="lab">
                    Pigmee daily amount
                    <small>Pre-filled when the Pigmee button is tapped.</small>
                  </span>
                  <input type="number" min={0} defaultValue={cfg.pigmeeDefault} onBlur={(e) => save({ pigmeeDefault: Number(e.target.value) || 0 })} style={{ width: 120 }} />
                </div>
                <div className="set-row">
                  <span className="lab">
                    Default language
                    <small>For a device that hasn&apos;t picked one yet.</small>
                  </span>
                  <Chips
                    options={[
                      { key: "both", label: "English + ಕನ್ನಡ" },
                      { key: "en", label: "English only" },
                      { key: "kn", label: "ಕನ್ನಡ only" },
                    ]}
                    value={[cfg.defaultLangMode]}
                    onChange={(v) => save({ defaultLangMode: v[0] as RegisterConfigData["defaultLangMode"] })}
                  />
                </div>
              </section>
              <section className="hub-card">
                <h3>Defaults for new devices</h3>
                <div className="hub-m small" style={{ marginBottom: 6 }}>
                  Applied the first time the register opens on a new phone or laptop. Each device can still change its own.
                </div>
                <div className="set-row">
                  <span className="lab">Screen layout</span>
                  <Chips
                    options={[
                      { key: "auto", label: "⇆ Auto" },
                      { key: "side", label: "◧ Always side by side" },
                      { key: "stack", label: "☰ One column" },
                    ]}
                    value={[cfg.defaultLayout]}
                    onChange={(v) => save({ defaultLayout: v[0] as RegisterConfigData["defaultLayout"] })}
                  />
                </div>
                <div className="set-row" style={{ alignItems: "flex-start" }}>
                  <span className="lab">
                    Favourite buttons
                    <small>Pinned at the top of the register.</small>
                  </span>
                  <Chips options={TILE_CHOICES} value={cfg.defaultFavs} onChange={(v) => save({ defaultFavs: v })} multi />
                </div>
                <div className="set-row" style={{ alignItems: "flex-start" }}>
                  <span className="lab">Workspace shows</span>
                  <Chips options={WORK_CHOICES} value={[cfg.defaultWork]} onChange={(v) => save({ defaultWork: v[0] })} />
                </div>
              </section>
              <section className="hub-card">
                <h3>Opening-cash overrides</h3>
                <div className="hub-m small">Set from &ldquo;Count cash → Change yesterday closing&rdquo;. Remove one to go back to the automatic value.</div>
                {Object.keys(cfg.openings).length ? (
                  Object.entries(cfg.openings)
                    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
                    .slice(0, 30)
                    .map(([d, v]) => (
                      <div className="set-row" key={d}>
                        <span>
                          {d} — ₹{v}
                        </span>
                        <button
                          className="hub-btn sm"
                          onClick={() => {
                            const o = { ...cfg.openings };
                            delete o[d];
                            save({ openings: o });
                          }}
                        >
                          Remove
                        </button>
                      </div>
                    ))
                ) : (
                  <div className="hub-empty">None</div>
                )}
              </section>
            </>
          )}

          {section === "rates" && cfg && (
            <section className="hub-card">
              <h3>Saved rates</h3>
              <div className="hub-m small" style={{ marginBottom: 6 }}>
                Remembered automatically from the last entry; change or remove them here. Fresh crush rates are kept per unit (kg / litre).
              </div>
              {rateRows.length ? (
                <table className="hub-table">
                  <thead>
                    <tr>
                      <th>Type</th>
                      <th>Item</th>
                      <th>Unit</th>
                      <th className="num">₹ rate</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {rateRows.map((r) => (
                      <tr key={r.key}>
                        <td>{KIND_LABEL[r.kind as RegisterKind]?.replace(/s$| items| types| seeds/, "") || r.kind}</td>
                        <td>{r.name}</td>
                        <td>{r.unit || "—"}</td>
                        <td className="num">
                          <input
                            type="number"
                            min={0}
                            defaultValue={r.rate}
                            style={{ width: 110 }}
                            onBlur={(e) => {
                              const v = Number(e.target.value);
                              if (v > 0 && v !== r.rate) save({ rates: { ...cfg.rates, [r.key]: v } });
                            }}
                          />
                        </td>
                        <td>
                          <button
                            className="hub-btn sm"
                            onClick={() => {
                              const rates = { ...cfg.rates };
                              delete rates[r.key];
                              save({ rates });
                            }}
                          >
                            Remove
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="hub-empty">No rates saved yet — they appear after the first entry with a rate.</div>
              )}
            </section>
          )}

          {section === "library" && cfg && (
            <>
              {LIB_KINDS.map((kind) => (
                <LibraryCard key={kind} kind={kind} cfg={cfg} save={save} />
              ))}
            </>
          )}

          {section === "device" && <DeviceCard flash={flash} />}

          {section === "dashboard" && (
            <section className="hub-card">
              <h3>Dashboard &amp; reports — this device</h3>
              <div className="set-row">
                <span className="lab">Auto-refresh (live)</span>
                <Chips
                  options={[
                    { key: "0", label: "Off" },
                    { key: "30", label: "30 s" },
                    { key: "60", label: "1 min" },
                    { key: "300", label: "5 min" },
                  ]}
                  value={[String(hub.refreshSec)]}
                  onChange={(v) => updateHub((p) => ({ ...p, refreshSec: Number(v[0]) }))}
                />
              </div>
              <div className="set-row">
                <span className="lab">Default report period</span>
                <Chips
                  options={[
                    { key: "today", label: "Today" },
                    { key: "yesterday", label: "Yesterday" },
                    { key: "7d", label: "7 days" },
                    { key: "30d", label: "30 days" },
                    { key: "month", label: "This month" },
                    { key: "lastMonth", label: "Last month" },
                  ]}
                  value={[hub.defaultRange]}
                  onChange={(v) => updateHub((p) => ({ ...p, defaultRange: v[0] as Preset }))}
                />
              </div>
              <div className="set-row" style={{ alignItems: "flex-start" }}>
                <span className="lab">
                  Dashboard widgets
                  <small>Order and visibility. Also editable on the dashboard.</small>
                </span>
                <div style={{ minWidth: 320 }}>
                  {hub.widgets.map((id, i) => {
                    const w = WIDGETS.find((x) => x.id === id)!;
                    const off = hub.hidden.includes(id);
                    return (
                      <div key={id} className={`hub-wrow${off ? " off" : ""}`} style={{ marginBottom: 4 }}>
                        <label>
                          <input
                            type="checkbox"
                            checked={!off}
                            onChange={() => updateHub((p) => ({ ...p, hidden: off ? p.hidden.filter((h) => h !== id) : [...p.hidden, id] }))}
                          />{" "}
                          {w.label}
                        </label>
                        <span>
                          <button
                            className="hub-btn sm"
                            disabled={i === 0}
                            onClick={() =>
                              updateHub((p) => {
                                const l = [...p.widgets];
                                [l[i - 1], l[i]] = [l[i], l[i - 1]];
                                return { ...p, widgets: l };
                              })
                            }
                          >
                            ▲
                          </button>
                          <button
                            className="hub-btn sm"
                            disabled={i === hub.widgets.length - 1}
                            onClick={() =>
                              updateHub((p) => {
                                const l = [...p.widgets];
                                [l[i + 1], l[i]] = [l[i], l[i + 1]];
                                return { ...p, widgets: l };
                              })
                            }
                          >
                            ▼
                          </button>
                        </span>
                      </div>
                    );
                  })}
                  <button className="hub-btn sm" onClick={() => updateHub(() => DEFAULT_HUB_PREFS)}>
                    Reset to default
                  </button>
                </div>
              </div>
            </section>
          )}

          {section === "business" &&
            (biz === undefined ? (
              <div className="hub-empty">Loading…</div>
            ) : (
              <SettingsDesk initialSettings={biz} dbConnected={biz !== null} />
            ))}

          {section === "rules" && (
            <section className="hub-card">
              <h3>Business rules (fixed in code)</h3>
              <div className="hub-m small" style={{ marginBottom: 6 }}>
                These come from your SOPs and scripts, and every desk uses the same value. Changing one is a code change, on purpose, so
                money and GST/ITC-04-related maths can&apos;t drift by accident.
              </div>
              <table className="hub-table">
                <thead>
                  <tr>
                    <th>Rule</th>
                    <th>Value</th>
                    <th>Source</th>
                  </tr>
                </thead>
                <tbody>
                  <tr><td>Cash count mismatch flag</td><td>≥ ₹{CASH_GAP_THRESHOLD_INR}</td><td>SOP daily cash & stock closing</td></tr>
                  <tr><td>Mass-balance (invisible loss) flag</td><td>&gt; {MASS_BALANCE_TOLERANCE_PCT}% of seed</td><td>oil_yield_tracker.py</td></tr>
                  <tr><td>Job-work: shop keeps cake</td><td>₹{STANDARD_RATE.SHOP}/kg to customer</td><td>SOP job-work crushing</td></tr>
                  <tr><td>Job-work: customer keeps cake</td><td>₹{STANDARD_RATE.CUSTOMER}/kg from customer</td><td>SOP job-work crushing</td></tr>
                  <tr><td>Oil cans</td><td>{Object.values(CAN_TYPES).map((c) => `${c.label} ₹${c.rate}`).join(" · ")}</td><td>Plan doc v14</td></tr>
                  <tr><td>Khali (cake) split</td><td>{KHALI_SPLIT.oilPct}% oil / {KHALI_SPLIT.khaliPct}% khali</td><td>Plan doc</td></tr>
                  <tr><td>Job-work &ldquo;overdue&rdquo;</td><td>{JOBWORK_OVERDUE_DAYS} days unsettled</td><td>Plan doc default — <b>not yet confirmed by you</b></td></tr>
                  <tr><td>Business day</td><td>Indian Standard Time (midnight to midnight)</td><td>Quick Register</td></tr>
                </tbody>
              </table>
            </section>
          )}

          {section === "data" && <DataCard />}
        </div>
      </div>
    </div>
  );
}

function LibraryCard({ kind, cfg, save }: { kind: RegisterKind; cfg: RegisterConfigData; save: (p: Partial<RegisterConfigData>) => Promise<void> }) {
  const [name, setName] = useState("");
  const list = cfg.customItems[kind] || [];
  const builtIn = CATALOG[kind] || [];
  const setList = (l: { key: string; label: string }[]) => save({ customItems: { ...cfg.customItems, [kind]: l } });
  return (
    <section className="hub-card">
      <h3>{KIND_LABEL[kind]}</h3>
      <div className="hub-m small">Built in: {builtIn.map((b) => b.en).join(", ") || "—"}</div>
      {list.map((c, i) => (
        <div className="set-row" key={c.key}>
          <input
            defaultValue={c.label}
            onBlur={(e) => {
              const v = e.target.value.trim();
              if (v && v !== c.label) setList(list.map((x, j) => (j === i ? { ...x, label: v } : x)));
            }}
            aria-label="Item name"
          />
          <button className="hub-btn sm" onClick={() => setList(list.filter((x) => x.key !== c.key))}>
            Remove
          </button>
        </div>
      ))}
      <div className="set-row">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Add a new item…" aria-label="New item name" />
        <button
          className="hub-btn sm primary"
          disabled={!name.trim()}
          onClick={() => {
            const label = name.trim();
            if (list.some((x) => x.label.toLowerCase() === label.toLowerCase())) return;
            setList([...list, { key: slugify(label), label }]);
            setName("");
          }}
        >
          Add
        </button>
      </div>
    </section>
  );
}

function DeviceCard({ flash }: { flash: (m: string) => void }) {
  const [info, setInfo] = useState<{ lang: string; layout: string; favs: string[]; work: string } | null>(null);
  const read = () => {
    try {
      const p = JSON.parse(localStorage.getItem("qr-prefs") || "null") || {};
      setInfo({ lang: localStorage.getItem("qr-lang") || "(shop default)", layout: p.layout || "(shop default)", favs: p.favs || [], work: p.work || "(shop default)" });
    } catch {
      setInfo(null);
    }
  };
  useEffect(read, []);
  return (
    <section className="hub-card">
      <h3>This device</h3>
      <div className="hub-m small" style={{ marginBottom: 6 }}>
        Saved only in this browser. Change them inside the Quick Register (⭐, ⇆, 🗣️ buttons) or reset here.
      </div>
      {info ? (
        <>
          <div className="set-row"><span className="lab">Language</span><span>{info.lang}</span></div>
          <div className="set-row"><span className="lab">Layout</span><span>{info.layout}</span></div>
          <div className="set-row"><span className="lab">Favourites</span><span>{info.favs.join(", ") || "—"}</span></div>
          <div className="set-row"><span className="lab">Workspace</span><span>{info.work}</span></div>
        </>
      ) : (
        <div className="hub-empty">Not available</div>
      )}
      <div className="set-row">
        <span className="lab">
          Reset this device
          <small>Language, layout, favourites, workspace, folded sections. The notepad text is kept. Entries are never touched.</small>
        </span>
        <button
          className="hub-btn"
          onClick={() => {
            try {
              localStorage.removeItem("qr-prefs");
              localStorage.removeItem("qr-lang");
            } catch {
              /* ignore */
            }
            read();
            flash("This device reset ✓");
          }}
        >
          Reset
        </button>
      </div>
    </section>
  );
}

function DataCard() {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  async function backup() {
    setBusy(true);
    setMsg(null);
    try {
      const to = businessDate(Date.now());
      const [hub, cfg] = await Promise.all([
        fetch(`/api/reports/hub?from=2000-01-01&to=${to}`).then((r) => r.json()),
        fetch("/api/register/config").then((r) => r.json()),
      ]);
      if (!hub.data) throw new Error(hub.error || "Could not load data");
      const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), registerConfig: cfg.data ?? DEFAULT_CONFIG, ...hub.data }, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `second-brain-backup_${to}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setMsg("Backup downloaded ✓");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Backup failed");
    }
    setBusy(false);
  }
  return (
    <section className="hub-card">
      <h3>Data &amp; backup</h3>
      <div className="set-row">
        <span className="lab">
          Full backup (JSON)
          <small>
            Sales, purchases, expenses, Quick Register, job-work, manufacturing, cash counts, items and register settings — one file. Keep
            it in Google Drive (02 / 01 folders) as an extra copy. Read-only: nothing is changed.
          </small>
        </span>
        <button className="hub-btn primary" onClick={backup} disabled={busy}>
          {busy ? "Preparing…" : "⬇ Download backup"}
        </button>
      </div>
      <div className="set-row">
        <span className="lab">
          CSV per report
          <small>Every table in Reports has its own ⬇ CSV button (sales, purchases, stock, udhaar, day book…).</small>
        </span>
        <a className="hub-btn" href="/reports?tab=daybook">
          Open reports
        </a>
      </div>
      {msg && <div className="hub-m">{msg}</div>}
    </section>
  );
}
