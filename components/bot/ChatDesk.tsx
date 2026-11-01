"use client";

// 💬 Chat (/chat): type to the shop desk — "today", "udhaar ramesh", "sale 500 upi suresh",
// "report today pdf" — and get answers, ✅ Save / ❌ Cancel for entries, and PDF / Excel files.
// The same commands work from Telegram and Discord once linked (Connect tab). The owner also
// connects the bots here. History stays on this device only.
import { useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { pieces, type BotReply } from "@/lib/bot/format";
import { download, nativeShare } from "@/lib/exporters";
import { MahadevNative, isNative } from "@/lib/native";
import "./chat.css";

interface Msg { id: string; me: boolean; text: string; buttons?: BotReply["buttons"]; file?: BotReply["file"]; open?: BotReply["open"]; at: number; used?: boolean }
const HIST = "sbd_chat_v1";
const CHIPS: { label: string; text: string; owner?: boolean }[] = [
  { label: "📊 Today", text: "today", owner: true },
  { label: "🙌 Udhaar", text: "udhaar", owner: true },
  { label: "💵 Cash", text: "cash", owner: true },
  { label: "📦 Stock", text: "stock" },
  { label: "🛢️ Barrels", text: "barrels" },
  { label: "🌾 Job-work", text: "jobwork", owner: true },
  { label: "🔔 Alerts", text: "alerts" },
  { label: "📄 Today PDF", text: "report today pdf", owner: true },
  { label: "📅 Week", text: "week", owner: true },
  { label: "❓ Help", text: "help" },
];
const EXAMPLES = ["sale 500 upi suresh", "got 1000 ramesh", "expense 200 diesel", "udhaar ramesh", "sales week excel"];
const newId = () => Math.random().toString(36).slice(2, 10);
const blobOf = (f: NonNullable<BotReply["file"]>) => {
  const bin = atob(f.base64);
  const a = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
  return new Blob([a], { type: f.mime });
};

export default function ChatDesk() {
  const { data: session } = useSession();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const isOwner = (session?.user as any)?.role === "OWNER";
  const [tab, setTab] = useState<"chat" | "connect">("chat");
  useEffect(() => {
    if (window.location.hash === "#connect") setTab("connect");
  }, []);
  return (
    <div className="hub cb">
      <header className="cb-top">
        <h1>💬 Chat</h1>
        <nav className="cb-tabs" role="tablist">
          <button role="tab" aria-selected={tab === "chat"} className={tab === "chat" ? "on" : ""} onClick={() => setTab("chat")}>Chat</button>
          <button role="tab" aria-selected={tab === "connect"} className={tab === "connect" ? "on" : ""} onClick={() => setTab("connect")}>Connect Telegram / Discord</button>
        </nav>
      </header>
      {tab === "chat" ? <ChatBox isOwner={isOwner} /> : <Connect isOwner={isOwner} />}
    </div>
  );
}

function Text({ text }: { text: string }) {
  return (
    <>
      {text.split("\n").map((line, i) => (
        <div key={i} className={line ? "" : "cb-gap"}>
          {pieces(line).map((p, j) => (p.b ? <b key={j}>{p.t}</b> : <span key={j}>{p.t}</span>))}
        </div>
      ))}
    </>
  );
}

function ChatBox({ isOwner }: { isOwner: boolean }) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      const h = JSON.parse(localStorage.getItem(HIST) || "[]") as Msg[];
      // files are not kept (too big); their message says so
      setMsgs(Array.isArray(h) ? h.slice(-60) : []);
    } catch {}
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(HIST, JSON.stringify(msgs.slice(-60).map((m) => (m.file ? { ...m, file: undefined, text: `${m.text}\n(file not kept — ask again)` } : m))));
    } catch {}
    end.current?.scrollIntoView({ block: "end" });
  }, [msgs]);

  const send = useCallback(async (body: { text?: string; button?: string }, label: string, from?: string) => {
    if (busy) return;
    setBusy(true);
    if (from) setMsgs((m) => m.map((x) => (x.id === from ? { ...x, used: true } : x)));
    setMsgs((m) => [...m, { id: newId(), me: true, text: label, at: Date.now() }]);
    try {
      const r = await fetch("/api/bot/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await r.json().catch(() => ({}));
      const reply: BotReply = j.data ?? { text: j.error || "Could not reach the desk. Check the internet." };
      setMsgs((m) => [...m, { id: newId(), me: false, at: Date.now(), ...reply }]);
      // "open barrel receiving", "new purchase…": go there (the chat stays in history)
      if (reply.open) setTimeout(() => { window.location.href = reply.open!.path; }, 700);
    } catch {
      setMsgs((m) => [...m, { id: newId(), me: false, at: Date.now(), text: "No internet. Try again." }]);
    } finally {
      setBusy(false);
    }
  }, [busy]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const t = text.trim();
    if (!t) return;
    setText("");
    void send({ text: t }, t);
    input.current?.focus();
  };

  return (
    <section className="cb-box">
      <div className="cb-list" aria-live="polite">
        {msgs.length === 0 && (
          <div className="cb-hello">
            <b>Type like a message.</b>
            <span>Ask for figures, make an entry, or get a PDF. Entries are only saved when you tap ✅ Save.</span>
            <div className="cb-ex">{EXAMPLES.map((x) => <button key={x} onClick={() => { setText(x); input.current?.focus(); }}>{x}</button>)}</div>
          </div>
        )}
        {msgs.map((m) => (
          <div key={m.id} className={`cb-msg ${m.me ? "me" : "bot"}`}>
            <div className="cb-bub">
              <Text text={m.text} />
              {m.open && (
                <div className="cb-btns"><a className="hub-btn sm" href={m.open.path}>↗ {m.open.label}</a></div>
              )}
              {m.file && (
                <div className="cb-file">
                  <span>📄 {m.file.name}</span>
                  <button className="hub-btn sm" onClick={() => download(m.file!.name, blobOf(m.file!))}>⬇️ Download</button>
                  <button className="hub-btn sm" onClick={() => void nativeShare(m.file!.name, { blob: blobOf(m.file!), name: m.file!.name })}>📤 Share</button>
                </div>
              )}
              {m.buttons && m.buttons.length > 0 && (
                <div className="cb-btns">
                  {m.buttons.map((b) => {
                    const once = !b.data.startsWith("cmd:");
                    return (
                      <button key={b.data} disabled={busy || (once && m.used)} className={b.data.startsWith("ok:") ? "ok" : b.data.startsWith("no:") || b.data.startsWith("undo:") ? "no" : ""} onClick={() => void send({ button: b.data }, b.label, once ? m.id : undefined)}>
                        {b.label}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        ))}
        {busy && <div className="cb-msg bot"><div className="cb-bub cb-typing"><i /><i /><i /></div></div>}
        <div ref={end} />
      </div>
      <div className="cb-chips">
        {CHIPS.filter((c) => isOwner || !c.owner).map((c) => (
          <button key={c.text} disabled={busy} onClick={() => void send({ text: c.text }, c.text)}>{c.label}</button>
        ))}
        {msgs.length > 0 && <button className="cb-clear" onClick={() => setMsgs([])}>🧹 Clear</button>}
      </div>
      <form className="cb-in" onSubmit={submit}>
        <input ref={input} value={text} onChange={(e) => setText(e.target.value)} placeholder="today · udhaar ramesh · sale 500 upi suresh" enterKeyHint="send" autoComplete="off" aria-label="Message" maxLength={500} />
        <MicButton disabled={busy} onText={(t) => { setText(""); void send({ text: t }, `🎤 ${t}`); }} onPartial={setText} />
        <button className="hub-btn primary" disabled={busy || !text.trim()} aria-label="Send">➤</button>
      </form>
    </section>
  );
}

// ------------------------------------------------------------------ speak instead of typing
type Rec = { lang: string; interimResults: boolean; onresult: (e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void; onerror: (e: { error: string }) => void; onend: () => void; start: () => void; stop: () => void };
const LANG_KEY = "sbd_chat_voice_lang";

/** 🎤: the browser's speech recogniser (Chrome / Edge), or Android's own one inside the app. */
function MicButton({ disabled, onText, onPartial }: { disabled: boolean; onText: (t: string) => void; onPartial: (t: string) => void }) {
  const [on, setOn] = useState(false);
  const [lang, setLang] = useState("en-IN");
  const [err, setErr] = useState<string | null>(null);
  const rec = useRef<Rec | null>(null);
  useEffect(() => {
    try { setLang(localStorage.getItem(LANG_KEY) || "en-IN"); } catch {}
  }, []);
  const flip = () => {
    const n = lang === "en-IN" ? "kn-IN" : lang === "kn-IN" ? "hi-IN" : "en-IN";
    setLang(n);
    try { localStorage.setItem(LANG_KEY, n); } catch {}
  };
  const start = async () => {
    setErr(null);
    if (on) { rec.current?.stop(); return; }
    const w = window as unknown as Record<string, (new () => Rec) | undefined>;
    const R = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (R) {
      const r = new R();
      r.lang = lang;
      r.interimResults = true;
      let final = "";
      r.onresult = (e) => {
        let t = "";
        for (let i = 0; i < e.results.length; i++) t += e.results[i][0].transcript;
        if (e.results[e.results.length - 1].isFinal) final = t;
        onPartial(t);
      };
      r.onerror = (e) => setErr(e.error === "not-allowed" ? "Allow the microphone for this site." : "Did not hear that — try again.");
      r.onend = () => { setOn(false); rec.current = null; if (final.trim()) onText(final.trim()); };
      rec.current = r;
      setOn(true);
      r.start();
      return;
    }
    if (isNative()) {
      try {
        setOn(true);
        const r = await MahadevNative.listen({ lang });
        setOn(false);
        if (r.text?.trim()) onText(r.text.trim());
      } catch (x) {
        setOn(false);
        setErr(/not implemented/i.test(String(x)) ? "Update the app (⬇️ on the Android app page) to talk to the chat." : "Did not hear that — try again.");
      }
      return;
    }
    setErr("This browser cannot listen. Use Chrome, or the Android app.");
  };
  return (
    <>
      <button type="button" className={`cb-mic${on ? " on" : ""}`} disabled={disabled} onClick={start} aria-label={on ? "Stop listening" : "Speak"} title="Speak (tap the language to change it)">🎤</button>
      <button type="button" className="cb-lang" onClick={flip} aria-label="Speech language">{lang === "en-IN" ? "EN" : lang === "kn-IN" ? "ಕ" : "हि"}</button>
      {err && <span className="cb-micerr" role="alert">{err}</span>}
    </>
  );
}

// ------------------------------------------------------------------ Connect
interface MyLinks { links: { id: string; channel: string; label: string | null; createdAt: string; lastUsedAt: string | null }[]; telegram: string | null; discord: boolean; discordAppId: string | null }
interface Status {
  telegram: { on: boolean; name: string | null; fromEnv: boolean; tokenSet: boolean };
  discord: { on: boolean; appId: string | null; fromEnv: boolean; endpoint: string; invite: string | null };
  digestOn: boolean;
  lastDigestDay: string | null;
  links: { id: string; channel: string; label: string | null; username: string; createdAt: string; lastUsedAt: string | null }[];
  log: { id: string; at: string; channel: string; username: string | null; text: string; ok: boolean }[];
}
const when = (t: string | null) => (t ? new Date(t).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "numeric", minute: "2-digit" }) : "never");
const CH: Record<string, string> = { telegram: "✈️ Telegram", discord: "🎮 Discord", app: "💬 App" };

function Connect({ isOwner }: { isOwner: boolean }) {
  const [mine, setMine] = useState<MyLinks | null>(null);
  const [st, setSt] = useState<Status | null>(null);
  const [code, setCode] = useState<{ code: string; expiresAt: string } | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [tgToken, setTgToken] = useState("");
  const [dc, setDc] = useState({ appId: "", publicKey: "", token: "" });

  const load = useCallback(async () => {
    fetch("/api/bot/link").then((r) => r.json()).then((j) => setMine(j.data ?? null)).catch(() => {});
    if (isOwner) fetch("/api/bot/config").then((r) => r.json()).then((j) => setSt(j.data ?? null)).catch(() => {});
  }, [isOwner]);
  useEffect(() => { void load(); }, [load]);

  const run = async (f: () => Promise<string>) => {
    setBusy(true);
    setMsg(null);
    try { setMsg({ ok: true, t: await f() }); } catch (e) { setMsg({ ok: false, t: e instanceof Error ? e.message : "That did not work." }); } finally { setBusy(false); }
  };
  const post = async (url: string, body: unknown, method = "POST") => {
    const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || "That did not work.");
    return j.data;
  };
  const config = (body: Record<string, unknown>, ok: string) => run(async () => { setSt(await post("/api/bot/config", body)); void load(); return ok; });
  const makeCode = () => run(async () => { setCode(await post("/api/bot/link", {})); return "Code made. It works for 10 minutes."; });
  const unlink = (id: string) => run(async () => { await post(`/api/bot/link?id=${encodeURIComponent(id)}`, null, "DELETE"); await load(); return "Unlinked."; });
  const copy = (t: string) => { void navigator.clipboard?.writeText(t).catch(() => {}); setMsg({ ok: true, t: "Copied." }); };

  const tgName = mine?.telegram && mine.telegram !== "on" ? mine.telegram : null;
  return (
    <>
      {msg && <div className={`cb-note${msg.ok ? " ok" : ""}`} role="status">{msg.t}</div>}

      <section className="hub-card">
        <h3>🔗 Link your chat app</h3>
        <p className="hub-m">Link your own Telegram or Discord to <b>your login</b>. It can then do what your login can do here — nothing more.</p>
        {!mine?.telegram && !mine?.discord && <p className="hub-m">{isOwner ? "First connect the Telegram bot below (2 minutes)." : "The owner has not connected Telegram or Discord yet."}</p>}
        {(mine?.telegram || mine?.discord) && (
          <>
            <button className="hub-btn primary" disabled={busy} onClick={makeCode}>Make a link code</button>
            {code && (
              <div className="cb-code">
                <div className="cb-digits" aria-label="Link code">{code.code}</div>
                <div className="hub-m">Valid till {new Date(code.expiresAt).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}. Then:</div>
                <ol>
                  {mine?.telegram && <li>Telegram: open {tgName ? <a href={`https://t.me/${tgName}?start=link`} target="_blank" rel="noreferrer">@{tgName}</a> : "the shop bot"} and send <code>link {code.code}</code> <button className="hub-btn sm" onClick={() => copy(`link ${code.code}`)}>Copy</button></li>}
                  {mine?.discord && <li>Discord: type <code>/m command: link {code.code}</code></li>}
                </ol>
              </div>
            )}
          </>
        )}
        {mine && mine.links.length > 0 && (
          <ul className="cb-ul">
            {mine.links.map((l) => (
              <li key={l.id}><span>{CH[l.channel] ?? l.channel} <b>{l.label || ""}</b> <small>linked {when(l.createdAt)} · used {when(l.lastUsedAt)}</small></span><button className="hub-btn sm" disabled={busy} onClick={() => unlink(l.id)}>Unlink</button></li>
            ))}
          </ul>
        )}
      </section>

      {isOwner && st && (
        <>
          <section className="hub-card">
            <h3>✈️ Telegram bot {st.telegram.on && <span className="cb-on">on{st.telegram.name ? ` · @${st.telegram.name}` : ""}</span>}</h3>
            {!st.telegram.on ? (
              <>
                <ol className="cb-steps">
                  <li>In Telegram open <a href="https://t.me/BotFather" target="_blank" rel="noreferrer">@BotFather</a> and send <code>/newbot</code>.</li>
                  <li>Give it a name (e.g. <i>Mahadev Desk</i>) and a username ending in <i>bot</i> (e.g. <i>MahadevDeskBot</i>).</li>
                  <li>BotFather sends a token like <code>123456789:AAH…</code>. Paste it here:</li>
                </ol>
                <form className="cb-row" onSubmit={(e) => { e.preventDefault(); void config({ action: "telegram", token: tgToken }, "Telegram connected. Now make a link code above and send it to your bot."); setTgToken(""); }}>
                  <input type="password" autoComplete="off" placeholder={st.telegram.tokenSet ? "Token already in Vercel — just press Connect" : "Bot token from BotFather"} value={tgToken} onChange={(e) => setTgToken(e.target.value)} />
                  <button className="hub-btn primary" disabled={busy || (!tgToken.trim() && !st.telegram.tokenSet)}>Connect</button>
                </form>
                <p className="hub-m small">Free. Your token stays on the server and is never shown again.</p>
              </>
            ) : (
              <div className="cb-row">
                <button className="hub-btn" disabled={busy} onClick={() => config({ action: "telegram" }, "Telegram reconnected.")}>Reconnect</button>
                <button className="hub-btn" disabled={busy} onClick={() => config({ action: "telegram-off" }, "Telegram disconnected.")}>Disconnect</button>
              </div>
            )}
          </section>

          <section className="hub-card">
            <h3>🎮 Discord bot {st.discord.on && <span className="cb-on">on</span>}</h3>
            {!st.discord.on ? (
              <>
                <ol className="cb-steps">
                  <li>Open the <a href="https://discord.com/developers/applications" target="_blank" rel="noreferrer">Discord Developer Portal</a> → <b>New Application</b> (name: Mahadev Desk).</li>
                  <li>From <b>General Information</b> copy the <b>Application ID</b> and <b>Public Key</b>; from <b>Bot</b> press <b>Reset Token</b> and copy it.</li>
                  <li>Paste all three and press Connect.</li>
                  <li>Back on General Information, set <b>Interactions Endpoint URL</b> to:<br /><code className="cb-url">{st.discord.endpoint}</code> <button type="button" className="hub-btn sm" onClick={() => copy(st.discord.endpoint)}>Copy</button></li>
                </ol>
                <form className="cb-grid" onSubmit={(e) => { e.preventDefault(); void config({ action: "discord", ...dc }, "Discord connected. Set the Interactions Endpoint URL (step 4), then invite the bot."); setDc({ appId: "", publicKey: "", token: "" }); }}>
                  <input placeholder="Application ID" inputMode="numeric" value={dc.appId} onChange={(e) => setDc({ ...dc, appId: e.target.value })} />
                  <input placeholder="Public key" value={dc.publicKey} onChange={(e) => setDc({ ...dc, publicKey: e.target.value })} />
                  <input type="password" autoComplete="off" placeholder="Bot token" value={dc.token} onChange={(e) => setDc({ ...dc, token: e.target.value })} />
                  <button className="hub-btn primary" disabled={busy || ((!dc.appId || !dc.publicKey || !dc.token) && !st.discord.fromEnv)}>Connect</button>
                </form>
              </>
            ) : (
              <>
                <p className="hub-m">Interactions Endpoint URL (in the Developer Portal): <code className="cb-url">{st.discord.endpoint}</code> <button className="hub-btn sm" onClick={() => copy(st.discord.endpoint)}>Copy</button></p>
                <div className="cb-row">
                  {st.discord.invite && <a className="hub-btn" href={st.discord.invite} target="_blank" rel="noreferrer">➕ Add the bot to a server / your account</a>}
                  <button className="hub-btn" disabled={busy} onClick={() => config({ action: "discord" }, "Discord commands registered again.")}>Re-register /m</button>
                  <button className="hub-btn" disabled={busy} onClick={() => config({ action: "discord-off" }, "Discord disconnected.")}>Disconnect</button>
                </div>
                <p className="hub-m small">Use <code>/m command: today</code>. Answers are private to the person who asked.</p>
              </>
            )}
          </section>

          <section className="hub-card">
            <h3>🌙 9 pm summary</h3>
            <label className="cb-chk"><input type="checkbox" checked={st.digestOn} disabled={busy} onChange={(e) => config({ action: "digest", on: e.target.checked }, e.target.checked ? "The 9 pm summary is on." : "The 9 pm summary is off.")} /> Send today&apos;s figures and alerts to the owner&apos;s linked chats every night (around 9 pm)</label>
            <div className="cb-row">
              <button className="hub-btn" disabled={busy} onClick={() => config({ action: "digest-now" }, "Sent — check your Telegram / Discord.")}>Send it now (test)</button>
              {st.lastDigestDay && <span className="hub-m small">Last sent {st.lastDigestDay.split("-").reverse().join("-")}</span>}
            </div>
          </section>

          <section className="hub-card">
            <h3>👥 Everyone linked</h3>
            {st.links.length === 0 ? <p className="hub-m">Nobody yet.</p> : (
              <ul className="cb-ul">
                {st.links.map((l) => (
                  <li key={l.id}><span>{CH[l.channel] ?? l.channel} <b>{l.label || ""}</b> <small>→ {l.username} · used {when(l.lastUsedAt)}</small></span><button className="hub-btn sm" disabled={busy} onClick={() => config({ action: "revoke", id: l.id }, "Switched off.")}>Switch off</button></li>
                ))}
              </ul>
            )}
          </section>

          <section className="hub-card">
            <h3>🧾 Latest bot messages</h3>
            <ul className="cb-log">
              {st.log.map((l) => (
                <li key={l.id} className={l.ok ? "" : "bad"}><small>{when(l.at)} · {CH[l.channel] ?? l.channel} · {l.username || "not linked"}</small><span>{l.text}</span></li>
              ))}
              {st.log.length === 0 && <li className="hub-m">Nothing yet.</li>}
            </ul>
          </section>
        </>
      )}
    </>
  );
}
