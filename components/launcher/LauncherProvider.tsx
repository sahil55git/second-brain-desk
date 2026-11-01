"use client";

// Quick launcher: the round button (opens the complete window), the hidden side
// panel (edge tab), and stackable pop windows. What shows in each, plus the
// mouse / touch shortcuts, is chosen by the owner and saved on this device.
// Shown only when signed in, never inside another pop window (?embed=1).
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { Icon, type IconName } from "@/components/ui/Icons";
import {
  addItem, FUNCTION_CHOICES, ICON_CHOICES, LAUNCHER_KEY, moveItem, normalizePrefs, removeItem, resolveOpening, updateItem,
  type Gesture, type GestureKey, type LItem, type LKind, type LauncherPrefs,
} from "@/lib/launcher";
import { cleanPops, MAX_POPS, POPS_KEY, type PopState } from "@/lib/popWindows";
import PopWindow from "@/components/launcher/PopWindow";

export type PopSpec = { title: string; url: string; external?: boolean; kind?: LKind };
type Pop = PopState & { id: number };
type BigTab = "Function" | "App" | "Link" | "Custom" | "Gest";

type Ctx = {
  prefs: LauncherPrefs;
  embedded: boolean;
  openPop: (p: PopSpec) => void;
  openItem: (i: LItem) => void;
  openBig: (tab?: BigTab) => void;
};
const LauncherCtx = createContext<Ctx | null>(null);
const NOOP: Ctx = { prefs: normalizePrefs(null), embedded: true, openPop: () => {}, openItem: () => {}, openBig: () => {} };
export const useLauncher = () => useContext(LauncherCtx) ?? NOOP;

const icon = (n: string): IconName => ((ICON_CHOICES as readonly string[]).includes(n) ? n : "star") as IconName;

export default function LauncherProvider({ children }: { children: ReactNode }) {
  const path = usePathname() || "/";
  const { status } = useSession();
  const [prefs, setPrefsState] = useState<LauncherPrefs>(() => normalizePrefs(null));
  const [loaded, setLoaded] = useState(false);
  const [embedded, setEmbedded] = useState(true); // assume embedded until we know, so nothing flashes
  const [panel, setPanel] = useState(false);
  const [big, setBig] = useState<BigTab | null>(null);
  const [pops, setPops] = useState<Pop[]>([]);
  const nid = useRef(1);

  useEffect(() => {
    const emb = window.self !== window.top || new URLSearchParams(window.location.search).get("embed") === "1";
    setEmbedded(emb);
    document.documentElement.classList.toggle("is-embed", emb);
    let raw: unknown = null;
    try {
      raw = JSON.parse(localStorage.getItem(LAUNCHER_KEY) || "null");
    } catch {}
    const p = normalizePrefs(raw);
    // First time on a phone: keep the round button on the left, away from "New sale".
    if (!raw && window.matchMedia("(max-width: 760px)").matches) p.fabSide = "left";
    setPrefsState(p);
    setLoaded(true);
    // windows left open stay open on every page until closed
    if (!emb) {
      try {
        const kept = cleanPops(JSON.parse(localStorage.getItem(POPS_KEY) || "null"));
        if (kept.length) setPops(kept.map((x) => ({ ...x, id: nid.current++ })));
      } catch {}
    }
  }, []);
  const popsLoaded = useRef(false);
  useEffect(() => {
    if (!loaded) return;
    if (!popsLoaded.current) {
      popsLoaded.current = true;
      return;
    }
    try {
      localStorage.setItem(POPS_KEY, JSON.stringify(pops.map(({ title, url, kind, external, size, opacity, min, x, y }) => ({ title, url, kind, external, size, opacity, min, x, y }))));
    } catch {}
  }, [pops, loaded]);

  const setPrefs = useCallback((next: LauncherPrefs | ((p: LauncherPrefs) => LauncherPrefs)) => {
    setPrefsState((cur) => {
      const v = typeof next === "function" ? next(cur) : next;
      try {
        localStorage.setItem(LAUNCHER_KEY, JSON.stringify(v));
      } catch {}
      return v;
    });
  }, []);

  const openPop = useCallback((p: PopSpec) => {
    if (p.external) {
      window.open(p.url, "_blank", "noopener,noreferrer");
      return;
    }
    setPanel(false);
    setBig(null);
    setPops((cur) => {
      const old = cur.find((x) => x.url === p.url);
      const fresh: Pop = { size: "m", opacity: 1, x: 0, y: 0, ...old, ...p, min: false, id: nid.current++ };
      return [...cur.filter((x) => x.url !== p.url), fresh].slice(-MAX_POPS);
    });
  }, []);

  const openItem = useCallback(
    (it: LItem) => {
      const o = resolveOpening(it, prefs.openMode);
      if (o.mode === "external") {
        window.open(o.url, "_blank", it.kind === "Link" ? "noopener,noreferrer" : undefined);
        setPanel(false);
        setBig(null);
      } else openPop({ title: it.label, url: o.url, kind: it.kind });
    },
    [prefs.openMode, openPop],
  );

  const openBig = useCallback((tab: BigTab = "Function") => {
    setPanel(false);
    setBig(tab);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (big) setBig(null);
      else if (panel) setPanel(false);
      else {
        setPops((c) => c.slice(0, -1));
        window.dispatchEvent(new Event("ql-pop-closed"));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [big, panel]);

  const ctx = useMemo<Ctx>(() => ({ prefs, embedded, openPop, openItem, openBig }), [prefs, embedded, openPop, openItem, openBig]);
  const show = loaded && !embedded && status === "authenticated" && !path.startsWith("/login") && !path.startsWith("/setup");

  return (
    <LauncherCtx.Provider value={ctx}>
      {children}
      {show && (
        <>
          <FabAndPanel prefs={prefs} panel={panel} setPanel={setPanel} openBig={openBig} openItem={openItem} />
          {big && <BigWindow tab={big} setTab={setBig} prefs={prefs} setPrefs={setPrefs} openItem={openItem} close={() => setBig(null)} />}
        </>
      )}
      {!embedded && pops.filter((p) => !p.min).map((p, k, open) => (
        <PopWindow
          key={p.id}
          pop={p}
          index={k}
          count={open.length}
          change={(patch) => setPops((c) => c.map((x) => (x.id === p.id ? { ...x, ...patch } : x)))}
          front={() => setPops((c) => [...c.filter((x) => x.id !== p.id), p])}
          cycle={(dir) => setPops((c) => {
            const vis = c.filter((x) => !x.min);
            if (vis.length < 2) return c;
            // swipe: the next window comes to the front
            const next = dir > 0 ? vis[0] : vis[vis.length - 2];
            return [...c.filter((x) => x.id !== next.id), next];
          })}
          close={() => { setPops((c) => c.filter((x) => x.id !== p.id)); window.dispatchEvent(new Event("ql-pop-closed")); }}
        />
      ))}
      {!embedded && pops.some((p) => p.min) && (
        <div className="ql-bubbles" aria-label="Quick windows kept open">
          {pops.filter((p) => p.min).map((p) => (
            <button key={p.id} className="ql-bubble" onClick={() => setPops((c) => [...c.filter((x) => x.id !== p.id), { ...p, min: false }])} title={`Open ${p.title}`}>
              <span className={`ql-dot k-${p.kind || "App"}`} /> {p.title}
            </button>
          ))}
        </div>
      )}
    </LauncherCtx.Provider>
  );
}

function FabAndPanel({ prefs, panel, setPanel, openBig, openItem }: { prefs: LauncherPrefs; panel: boolean; setPanel: (b: boolean) => void; openBig: (t?: BigTab) => void; openItem: (i: LItem) => void }) {
  const groups: { title: string; kind: LKind }[] = [
    { title: "Functions", kind: "Function" },
    { title: "Apps", kind: "App" },
    { title: "Quick links", kind: "Link" },
  ];
  const side = prefs.panelSide;
  return (
    <>
      <button className={`ql-fab ql-${prefs.fabSide}`} onClick={() => openBig("Function")} aria-label="Open quick window" title="Quick window">
        <Icon name="grid" size={26} strokeWidth={2.2} />
      </button>
      <button className={`ql-edge ql-${side}`} onClick={() => setPanel(!panel)} aria-label="Quick panel" title="Quick panel">
        <span aria-hidden>{side === "right" ? "‹" : "›"}</span>
      </button>
      {panel && (
        <>
          <div className="ql-scrim" onClick={() => setPanel(false)} />
          <aside className={`ql-panel ql-${side}`} aria-label="Quick panel">
            <div className="ql-ph">
              <b>Quick panel</b>
              <button onClick={() => openBig("Custom")} aria-label="Customize" title="Customize"><Icon name="gear" size={18} /></button>
              <button onClick={() => setPanel(false)} aria-label="Close">✕</button>
            </div>
            {groups.map((g) => {
              const items = prefs.items.filter((i) => i.panel && i.kind === g.kind);
              if (!items.length) return null;
              return (
                <div key={g.kind} className="ql-grp">
                  <div className="ql-gt">{g.title}</div>
                  {items.map((i) => (
                    <button key={i.id} className="ql-row" onClick={() => openItem(i)}>
                      <span className={`ql-ic k-${i.kind}`}><Icon name={icon(i.icon)} size={18} /></span>
                      <span className="ql-lb">{i.label}</span>
                      <span className="ql-hint">{i.kind === "Link" ? "↗" : i.kind === "App" ? "›" : "＋"}</span>
                    </button>
                  ))}
                </div>
              );
            })}
          </aside>
        </>
      )}
    </>
  );
}

const TABS: { k: BigTab; label: string }[] = [
  { k: "Function", label: "Functions" },
  { k: "App", label: "Apps" },
  { k: "Link", label: "Web links" },
  { k: "Custom", label: "Customize" },
  { k: "Gest", label: "Mouse & touch" },
];

const GEST_LABELS: { k: GestureKey; label: string; desc: string }[] = [
  { k: "hover", label: "Mouse hover", desc: "Move the mouse over it" },
  { k: "right", label: "Right-click", desc: "Mouse right button" },
  { k: "long", label: "Long touch", desc: "Hold a finger for half a second" },
  { k: "triple", label: "Triple tap / triple click", desc: "Three quick taps" },
];
const ACTS: { v: Gesture; label: string }[] = [
  { v: "peek", label: "Small window" },
  { v: "menu", label: "Menu" },
  { v: "edit", label: "Add / edit" },
  { v: "pop", label: "Pop window" },
  { v: "full", label: "Full page" },
  { v: "none", label: "Nothing" },
];

function BigWindow({ tab, setTab, prefs, setPrefs, openItem, close }: { tab: BigTab; setTab: (t: BigTab) => void; prefs: LauncherPrefs; setPrefs: (f: (p: LauncherPrefs) => LauncherPrefs) => void; openItem: (i: LItem) => void; close: () => void }) {
  const [form, setForm] = useState<{ kind: LKind; label: string; target: string; icon: string }>({ kind: "Link", label: "", target: "", icon: "link" });
  const [err, setErr] = useState("");
  const kindItems = tab === "Function" || tab === "App" || tab === "Link" ? prefs.items.filter((i) => i.kind === tab) : [];
  const submit = () => {
    const r = addItem(prefs, form, `u${Date.now().toString(36)}`);
    if (r.error) return setErr(r.error);
    setErr("");
    setPrefs(() => r.prefs);
    setForm({ ...form, label: "", target: "" });
  };
  return (
    <div className="ql-scrim big" onClick={close}>
      <div className="ql-big" role="dialog" aria-label="Quick window" onClick={(e) => e.stopPropagation()}>
        <nav className="ql-bn">
          <div className="ql-bt">Quick window</div>
          {TABS.map((t) => (
            <button key={t.k} className={tab === t.k ? "on" : ""} onClick={() => setTab(t.k)}>
              {t.label}
              {(t.k === "Function" || t.k === "App" || t.k === "Link") && <i>{prefs.items.filter((i) => i.kind === t.k).length}</i>}
            </button>
          ))}
          <span style={{ flex: 1 }} />
          <button className="ql-x" onClick={close}>Close ✕</button>
        </nav>
        <div className="ql-bb">
          {tab === "Function" || tab === "App" || tab === "Link" ? (
            <>
              <h2>{TABS.find((t) => t.k === tab)?.label}</h2>
              {kindItems.length === 0 && <p className="ql-mute">Nothing here yet. Add one in the Customize tab.</p>}
              <div className="ql-tiles">
                {kindItems.map((i) => (
                  <button key={i.id} className="ql-tile" onClick={() => openItem(i)}>
                    <span className={`ql-ic big k-${i.kind}`}><Icon name={icon(i.icon)} size={24} /></span>
                    <b>{i.label}</b>
                    <small>{i.kind === "Function" ? "Quick Register" : i.target.replace(/^https?:\/\//, "")}</small>
                  </button>
                ))}
              </div>
            </>
          ) : null}

          {tab === "Custom" && (
            <>
              <h2>Customize</h2>
              <p className="ql-mute">Choose what shows on the round button’s window and in the side panel, and add your own functions, app pages and web links.</p>
              <div className="ql-set">
                <Seg label="Round button side" value={prefs.fabSide} opts={[["left", "Left"], ["right", "Right"]]} on={(v) => setPrefs((p) => ({ ...p, fabSide: v as "left" | "right" }))} />
                <Seg label="Side panel edge" value={prefs.panelSide} opts={[["left", "Left"], ["right", "Right"]]} on={(v) => setPrefs((p) => ({ ...p, panelSide: v as "left" | "right" }))} />
                <Seg label="Open as" value={prefs.openMode} opts={[["pop", "Pop window"], ["tab", "New tab"]]} on={(v) => setPrefs((p) => ({ ...p, openMode: v as "pop" | "tab" }))} />
              </div>
              <div className="ql-list">
                <div className="ql-lh"><span>Item</span><span>Panel</span><span /></div>
                {prefs.items.map((i, n) => (
                  <div key={i.id} className="ql-li">
                    <span className={`ql-ic k-${i.kind}`}><Icon name={icon(i.icon)} size={17} /></span>
                    <span className="ql-lt"><b>{i.label}</b><small>{i.kind} · {i.target.replace(/^https?:\/\//, "")}</small></span>
                    <button className={`ql-sw${i.panel ? " on" : ""}`} onClick={() => setPrefs((p) => updateItem(p, i.id, { panel: !i.panel }))}>{i.panel ? "On" : "Off"}</button>
                    <span className="ql-mv">
                      <button onClick={() => setPrefs((p) => moveItem(p, i.id, -1))} disabled={n === 0} aria-label="Move up">↑</button>
                      <button onClick={() => setPrefs((p) => moveItem(p, i.id, 1))} disabled={n === prefs.items.length - 1} aria-label="Move down">↓</button>
                      <button className="rm" onClick={() => setPrefs((p) => removeItem(p, i.id))} aria-label={`Remove ${i.label}`}>✕</button>
                    </span>
                  </div>
                ))}
              </div>
              <div className="ql-add">
                <b>+ Add your own</b>
                <div className="ql-seg">
                  {(["Function", "App", "Link"] as LKind[]).map((k) => (
                    <button key={k} className={form.kind === k ? "on" : ""} onClick={() => setForm({ ...form, kind: k, target: "", icon: k === "Link" ? "link" : form.icon })}>{k === "App" ? "App page" : k === "Link" ? "Web link" : "Function"}</button>
                  ))}
                </div>
                <div className="ql-fields">
                  <input value={form.label} maxLength={30} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="Name, e.g. GST portal" />
                  {form.kind === "Function" ? (
                    <select value={form.target} onChange={(e) => setForm({ ...form, target: e.target.value })}>
                      <option value="">Pick a function…</option>
                      {FUNCTION_CHOICES.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
                    </select>
                  ) : (
                    <input value={form.target} onChange={(e) => setForm({ ...form, target: e.target.value })} placeholder={form.kind === "App" ? "Page, e.g. /stock" : "Address, e.g. gst.gov.in"} inputMode="url" autoCapitalize="none" />
                  )}
                </div>
                <div className="ql-icons">
                  {ICON_CHOICES.map((n) => (
                    <button key={n} className={form.icon === n ? "on" : ""} onClick={() => setForm({ ...form, icon: n })} aria-label={n}><Icon name={n as IconName} size={17} /></button>
                  ))}
                  <span style={{ flex: 1 }} />
                  <button className="ql-go" onClick={submit}>Add</button>
                </div>
                {err && <div className="ql-err">{err}</div>}
              </div>
            </>
          )}

          {tab === "Gest" && (
            <>
              <h2>Mouse &amp; touch shortcuts</h2>
              <p className="ql-mute">Choose what each gesture does on tabs and buttons that support it (the bottom tabs and the Home shortcut tiles).</p>
              <div className="ql-gl">
                {GEST_LABELS.map((g) => (
                  <div key={g.k} className="ql-gr">
                    <b>{g.label}</b> <small>· {g.desc}</small>
                    <div className="ql-seg">
                      {ACTS.filter((a) => g.k !== "hover" || a.v === "peek" || a.v === "none").map((a) => (
                        <button key={a.v} className={prefs.gest[g.k] === a.v ? "on" : ""} onClick={() => setPrefs((p) => ({ ...p, gest: { ...p.gest, [g.k]: a.v } }))}>{a.label}</button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Seg({ label, value, opts, on }: { label: string; value: string; opts: [string, string][]; on: (v: string) => void }) {
  return (
    <div>
      <div className="ql-gt">{label}</div>
      <div className="ql-seg">
        {opts.map(([v, l]) => <button key={v} className={value === v ? "on" : ""} onClick={() => on(v)}>{l}</button>)}
      </div>
    </div>
  );
}
