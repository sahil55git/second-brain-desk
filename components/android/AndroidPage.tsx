"use client";

// /app — in a browser: get the Android app (download, install steps). Inside the app: this
// phone's settings — home-screen widgets (on / off, add, style), alerts and daily reminders,
// printers the phone can reach, keep the screen on, and the widget keys of every phone.
import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import {
  APK_PREVIEW_URL, APK_URL, LocalNotifications, MahadevNative, MahadevPrinter, REMINDERS, isNative, parseTime, reminderNotification, toBase64, type NativePrinter,
} from "@/lib/native";
import "./android.css";

type Info = Awaited<ReturnType<typeof MahadevNative.info>>;
type Status = Awaited<ReturnType<typeof MahadevNative.deviceStatus>>;
interface Key { id: string; name: string; username: string; role: string; createdAt: string; lastUsedAt: string | null; revokedAt: string | null }

const PREFS = "sbd_android_v1";
interface Prefs { style: "dark" | "light" | "glass"; opacity: number; textSize: "s" | "m" | "l"; alerts: boolean; awake: boolean; reminders: Record<string, { on: boolean; time: string }> }
const DEFAULT_PREFS: Prefs = { style: "dark", opacity: 90, textSize: "m", alerts: true, awake: false, reminders: Object.fromEntries(REMINDERS.map((r) => [r.key, { on: r.key === "cash", time: `${String(r.hour).padStart(2, "0")}:${String(r.minute).padStart(2, "0")}` }])) };
const readPrefs = (): Prefs => {
  try {
    const p = JSON.parse(localStorage.getItem(PREFS) || "null");
    return p ? { ...DEFAULT_PREFS, ...p, reminders: { ...DEFAULT_PREFS.reminders, ...(p.reminders || {}) } } : DEFAULT_PREFS;
  } catch {
    return DEFAULT_PREFS;
  }
};
const ago = (t: number | string | null | undefined) => {
  if (!t) return "never";
  const s = Math.round((Date.now() - new Date(t).getTime()) / 1000);
  return s < 90 ? "just now" : s < 5400 ? `${Math.round(s / 60)} min ago` : s < 129600 ? `${Math.round(s / 3600)} h ago` : `${Math.round(s / 86400)} days ago`;
};

export default function AndroidPage() {
  const [native, setNative] = useState<boolean | null>(null);
  useEffect(() => setNative(isNative()), []);
  if (native === null) return <div className="hub" />;
  return <div className="hub and">{native ? <PhoneSettings /> : <GetTheApp />}</div>;
}

// ---------------------------------------------------------------------------
function GetTheApp() {
  return (
    <>
      <header className="hub-top"><div><h1>📱 Android app</h1><div className="hub-m">Mahadev Desk on your phone: home-screen widgets, one-tap printing to the label and receipt printers, reminders and alerts.</div></div></header>
      <section className="hub-card and-hero">
        <a className="and-dl" href={APK_URL}>⬇️ Download the app (APK)</a>
        <div className="hub-m small">About 5 MB · Android 7 or newer · free, not on the Play Store yet</div>
        <details className="and-pre"><summary>Newest test version</summary><a href={APK_PREVIEW_URL}>Download the test build</a> — only if asked to try something new.</details>
      </section>
      <section className="hub-card">
        <h3>Install it (first time)</h3>
        <ol className="and-steps">
          <li>Open this page <b>on the phone</b> in Chrome and tap <b>Download</b>.</li>
          <li>Open the downloaded file. If Android says <i>“For your security, your phone is not allowed to install unknown apps”</i>, tap <b>Settings</b> → turn on <b>Allow from this source</b> → back.</li>
          <li>Tap <b>Install</b>. If Play Protect warns, tap <b>More details → Install anyway</b> (it does not know our own app).</li>
          <li>Open <b>Mahadev Desk</b>, sign in once, then open <b>☰ → Android app</b> (or this page) to turn on widgets, reminders and printers.</li>
        </ol>
        <p className="hub-m small">Updates to screens and features arrive by themselves (the app shows the live site). Only when this page says a new app version is out, download and install it again over the old one — sign-in and settings stay.</p>
      </section>
      <section className="hub-card">
        <h3>What the app adds</h3>
        <ul className="and-feat">
          <li>🧩 <b>Home-screen widgets</b>: today&apos;s sales and cash, barrels waiting, one-tap Sale / Expense / Weigh buttons. Dark, light or see-through.</li>
          <li>🖨️ <b>Print straight to the printer</b> over Bluetooth (the usual cheap thermal printers too) or a USB cable. No print window, exact label size.</li>
          <li>🔔 <b>Alerts</b>: barrels waiting a week, cash not counted, low stock, job-work overdue. <b>Daily reminders</b> you set.</li>
          <li>📤 <b>Share</b> reports, receipts and pictures to WhatsApp, Bluetooth, Drive. Files save to Downloads.</li>
          <li>🚀 <b>Shortcuts</b>: long-press the app icon for Sale, Expense, Weigh full barrel, Quick card. Links to the app open in the app.</li>
          <li>💡 <b>Keep the screen on</b> at the weighing scale.</li>
        </ul>
      </section>
    </>
  );
}

// ---------------------------------------------------------------------------
function PhoneSettings() {
  const { data: session } = useSession();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const isOwner = (session?.user as any)?.role === "OWNER";
  const [info, setInfo] = useState<Info | null>(null);
  const [st, setSt] = useState<Status | null>(null);
  const [p, setP] = useState<Prefs>(DEFAULT_PREFS);
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [printers, setPrinters] = useState<NativePrinter[] | null>(null);
  const [notify, setNotify] = useState<string>("");
  const [keys, setKeys] = useState<Key[] | null>(null);

  const say = (ok: boolean, t: string) => setMsg({ ok, t });
  const load = useCallback(async () => {
    setInfo(await MahadevNative.info().catch(() => null));
    setSt(await MahadevNative.deviceStatus().catch(() => null));
    setNotify((await LocalNotifications.checkPermissions().catch(() => ({ display: "unknown" }))).display);
    fetch("/api/device/tokens").then((r) => r.json()).then((j) => setKeys(j.data ?? [])).catch(() => setKeys([]));
  }, []);
  useEffect(() => {
    setP(readPrefs());
    void load();
  }, [load]);
  const save = (n: Prefs) => {
    setP(n);
    try { localStorage.setItem(PREFS, JSON.stringify(n)); } catch {}
  };
  const run = async (f: () => Promise<void>) => {
    setBusy(true);
    setMsg(null);
    try { await f(); } catch (e) { say(false, e instanceof Error ? e.message : "That did not work."); } finally { setBusy(false); }
  };

  const widgetsOn = () => run(async () => {
    const name = `${info?.model || "Android phone"}${session?.user?.name ? ` · ${session.user.name}` : ""}`;
    const r = await fetch("/api/device/tokens", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.data?.token) throw new Error(j.error || "Could not make a widget key.");
    await MahadevNative.setDevice({ baseUrl: window.location.origin, token: j.data.token, role: isOwner ? "OWNER" : "STAFF", name });
    await MahadevNative.setWidgetStyle({ style: p.style, opacity: p.opacity, textSize: p.textSize });
    await MahadevNative.setAlerts({ on: p.alerts });
    await MahadevNative.refresh();
    say(true, "Widgets are on. Add them to the home screen below (or long-press the home screen → Widgets → Mahadev Desk).");
    await load();
  });
  const widgetsOff = () => run(async () => {
    await MahadevNative.clearDevice();
    say(true, "Widgets switched off on this phone.");
    await load();
  });
  const style = (n: Partial<Prefs>) => {
    const next = { ...p, ...n };
    save(next);
    void MahadevNative.setWidgetStyle({ style: next.style, opacity: next.opacity, textSize: next.textSize }).catch(() => {});
  };

  const askNotify = () => run(async () => {
    const r = await LocalNotifications.requestPermissions();
    setNotify(r.display);
    if (r.display !== "granted") throw new Error("Notifications are blocked. Open Android Settings → Apps → Mahadev Desk → Notifications and allow them.");
    say(true, "Notifications allowed.");
  });
  const applyReminders = (next: Prefs) => run(async () => {
    save(next);
    if (notify !== "granted") {
      const r = await LocalNotifications.requestPermissions();
      setNotify(r.display);
      if (r.display !== "granted") throw new Error("Allow notifications first.");
    }
    await LocalNotifications.cancel({ notifications: REMINDERS.map((r) => ({ id: r.id })) });
    const list = REMINDERS.filter((r) => next.reminders[r.key]?.on).map((r) => {
      const t = parseTime(next.reminders[r.key].time) ?? { hour: r.hour, minute: r.minute };
      return reminderNotification(r, t.hour, t.minute);
    });
    if (list.length) await LocalNotifications.schedule({ notifications: list });
    say(true, list.length ? `${list.length} reminder(s) set.` : "Reminders off.");
  });
  const testNotify = () => run(async () => {
    const r = await LocalNotifications.requestPermissions();
    if (r.display !== "granted") throw new Error("Allow notifications first.");
    await LocalNotifications.schedule({ notifications: [{ id: 799, title: "✅ Mahadev Desk", body: "Notifications work on this phone.", extra: { url: "/app" }, schedule: { at: new Date(Date.now() + 2000) } }] });
    say(true, "A test notification comes in 2 seconds.");
  });

  const findPrinters = () => run(async () => {
    const r = await MahadevPrinter.list();
    setPrinters(r.printers);
    if (!r.bluetoothOn) say(false, "Bluetooth is off. Turn it on to see Bluetooth printers.");
  });
  const testPrinter = (pr: NativePrinter) => run(async () => {
    // a small ESC/POS + TSPL-neutral test: plain text lines and a feed (prints on receipt printers;
    // label printers print it in their text mode or ignore it). The real labels use the Print button.
    const enc = new TextEncoder();
    const bytes = enc.encode("\x1b@MAHADEV DESK TEST\n" + new Date().toLocaleString("en-IN") + "\n" + pr.name + "\n\n\n\n");
    await MahadevPrinter.write({ id: pr.id, base64: toBase64(bytes) });
    say(true, `Sent a test to ${pr.name}. For labels, use 🖨️ Print on the labels page and pick this printer in Print to.`);
  });

  const revoke = (k: Key) => run(async () => {
    const r = await fetch(`/api/device/tokens?id=${encodeURIComponent(k.id)}`, { method: "DELETE" });
    if (!r.ok) throw new Error("Could not switch it off.");
    await load();
  });

  return (
    <>
      <header className="hub-top">
        <div><h1>📱 This phone</h1><div className="hub-m">Mahadev Desk app {info ? `v${info.version} (${info.build}) · ${info.model} · Android SDK ${info.sdk}` : ""}</div></div>
        <nav className="hub-links"><a className="hub-btn" href={APK_URL}>⬇️ Get the newest app</a></nav>
      </header>
      {msg && <div className={`and-msg${msg.ok ? " ok" : ""}`} role="status">{msg.t}</div>}

      <section className="hub-card">
        <h3>🧩 Home-screen widgets</h3>
        {st?.on ? (
          <>
            <p className="hub-m">On · updated {ago(st.lastOk)}{st.lastError ? ` · last problem: ${st.lastError}` : ""}</p>
            <div className="and-row">
              <button className="hub-btn primary" disabled={busy} onClick={() => run(async () => { await MahadevNative.refresh(); say(true, "Updating the widgets…"); setTimeout(load, 4000); })}>⟳ Update now</button>
              <button className="hub-btn" disabled={busy} onClick={widgetsOff}>Switch off</button>
            </div>
            <div className="and-row">
              {(["summary", "actions", "barrels"] as const).map((k) => (
                <button key={k} className="hub-btn" disabled={busy} onClick={() => run(async () => { const r = await MahadevNative.pinWidget({ kind: k }); say(r.ok, r.ok ? "Android asks where to put it: tap Add." : "This phone cannot add widgets from the app. Long-press the home screen → Widgets → Mahadev Desk."); })}>
                  ＋ {k === "summary" ? (isOwner ? "Today's figures" : "Today") : k === "actions" ? "Quick buttons" : "Barrels"}
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            <p className="hub-m">Widgets show {isOwner ? "today's sales, cash, UPI, udhaar and " : ""}barrels waiting on the home screen, and quick buttons that open an entry form. They update about every 30 minutes and when you tap ⟳.</p>
            <button className="hub-btn primary" disabled={busy} onClick={widgetsOn}>Turn on widgets on this phone</button>
          </>
        )}
        <div className="and-grid">
          <span>Look</span>
          <span className="and-chips">{(["dark", "light", "glass"] as const).map((s) => <button key={s} className={p.style === s ? "on" : ""} onClick={() => style({ style: s })}>{s === "dark" ? "Dark" : s === "light" ? "Light" : "See-through"}</button>)}</span>
          <span>Solid</span>
          <span className="and-range"><input type="range" min={20} max={100} step={5} value={p.opacity} onChange={(e) => style({ opacity: Number(e.target.value) })} /> {p.opacity}%</span>
          <span>Text</span>
          <span className="and-chips">{(["s", "m", "l"] as const).map((s) => <button key={s} className={p.textSize === s ? "on" : ""} onClick={() => style({ textSize: s })}>{s === "s" ? "Small" : s === "m" ? "Medium" : "Large"}</button>)}</span>
        </div>
      </section>

      <section className="hub-card">
        <h3>🔔 Alerts and reminders</h3>
        <p className="hub-m">Notifications: <b>{notify === "granted" ? "allowed" : notify || "unknown"}</b>{notify !== "granted" && <> · <button className="hub-btn sm" onClick={askNotify}>Allow</button></>} · <button className="hub-btn sm" onClick={testNotify}>Send a test</button></p>
        <label className="and-chk"><input type="checkbox" checked={p.alerts} onChange={(e) => { const n = { ...p, alerts: e.target.checked }; save(n); void MahadevNative.setAlerts({ on: n.alerts }).catch(() => {}); }} /> Alerts (needs widgets on): barrels waiting 7+ days{isOwner ? ", cash not counted by 8 pm, low stock, job-work overdue" : ""}</label>
        <div className="and-rem">
          {REMINDERS.map((r) => {
            const v = p.reminders[r.key];
            return (
              <div key={r.key} className="and-remrow">
                <label className="and-chk"><input type="checkbox" checked={!!v?.on} onChange={(e) => applyReminders({ ...p, reminders: { ...p.reminders, [r.key]: { ...v, on: e.target.checked } } })} /> {r.title}{r.weekday ? " (Mondays)" : ""}</label>
                <input type="time" value={v?.time || "20:30"} onChange={(e) => save({ ...p, reminders: { ...p.reminders, [r.key]: { ...v, time: e.target.value } } })} onBlur={() => v?.on && applyReminders(p)} aria-label={`${r.title} time`} />
              </div>
            );
          })}
        </div>
      </section>

      <section className="hub-card">
        <h3>🖨️ Printers this phone can reach</h3>
        <p className="hub-m">Pair Bluetooth printers in Android Settings → Bluetooth first (PIN usually 0000 or 1234). USB printers need an OTG cable. On the labels and receipt pages they appear in <b>Print to</b>; the first print saves the one you used.</p>
        <button className="hub-btn primary" disabled={busy} onClick={findPrinters}>🔍 Find printers</button>
        {printers && (
          <ul className="and-list">
            {printers.length === 0 && <li className="hub-m">None found.</li>}
            {printers.map((pr) => (
              <li key={pr.id}>
                <span>{pr.kind === "usb" ? "🔌" : "🔵"} <b>{pr.name}</b> <small>{pr.printer ? "printer" : "device"}</small></span>
                <button className="hub-btn sm" disabled={busy} onClick={() => testPrinter(pr)}>Test</button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="hub-card">
        <h3>💡 Screen</h3>
        <label className="and-chk"><input type="checkbox" checked={p.awake} onChange={(e) => { const n = { ...p, awake: e.target.checked }; save(n); void MahadevNative.keepAwake({ on: n.awake }).catch(() => {}); }} /> Keep the screen on while the app is open (good at the weighing scale)</label>
      </section>

      <section className="hub-card">
        <h3>🔑 Phones with widgets on</h3>
        <p className="hub-m small">Each phone has its own key that can only read the widget figures. Switch off a lost or old phone here.</p>
        <ul className="and-list">
          {(keys ?? []).length === 0 && <li className="hub-m">None yet.</li>}
          {(keys ?? []).map((k) => (
            <li key={k.id} className={k.revokedAt ? "off" : ""}>
              <span><b>{k.name}</b> <small>{k.username} · {k.role === "OWNER" ? "owner" : "staff"} · used {ago(k.lastUsedAt)}{k.revokedAt ? " · switched off" : ""}</small></span>
              {!k.revokedAt && <button className="hub-btn sm" disabled={busy} onClick={() => revoke(k)}>Switch off</button>}
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
