"use client";

// Home — the "Sold today" desk from the design boards. One set of figures
// (lib/homeSummary.ts, same maths as Reports), three layouts:
//   earth  → E2 "Earth & Clay"   (serif hero, sales by hour, book summary, stock donut, hills)
//   pastel → D2 "Pastel Liquid"  (gradient hero, tinted cards, week bars, ask your desk)
//   others → A2 "Mahadev Glass"  (KPI glass cards, job-work pipeline, week chart, stock bars, recent entries)
import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { useCustomize } from "@/lib/customize";
import type { BizData } from "@/lib/bizReports";
import { homeSparks, homeSummary, rangeSummary, type HomeRange, type HomeSummary, type RangeSummary } from "@/lib/homeSummary";
import { businessDate } from "@/lib/register";
import { Icon } from "@/components/ui/Icons";
import ShareButton from "@/components/share/ShareButton";

type Go = (desk: "jobwork" | "manufacturing" | "closing" | "sales" | "inventory" | "reports" | "ledger" | "parties") => void;

const inr = (n: number) => "₹" + Math.round(n).toLocaleString("en-IN");
const short = (n: number) => (Math.abs(n) >= 100000 ? `₹${(n / 100000).toFixed(1)}L` : Math.abs(n) >= 10000 ? `₹${(n / 1000).toFixed(1)}k` : inr(n));
const plural = (n: number, one: string, many = one + "s") => `${n} ${n === 1 ? one : many}`;
const kg = (n: number) => `${Math.round(n).toLocaleString("en-IN")} kg`;
const shiftDay = (d: string, days: number) => new Date(new Date(`${d}T00:00:00Z`).getTime() + days * 86400000).toISOString().slice(0, 10);

function useCountUp(target: number, ms = 900) {
  const [v, setV] = useState(target);
  useEffect(() => {
    const reduce = typeof window !== "undefined" && (document.documentElement.classList.contains("reduce-motion") || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
    if (reduce || !target) {
      setV(target);
      return;
    }
    let raf = 0;
    const t0 = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / ms);
      setV(target * (1 - Math.pow(1 - p, 3)));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return v;
}

function greeting(nowMs: number) {
  const h = new Date(nowMs + 5.5 * 3600000).getUTCHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}
function knGreeting(nowMs: number) {
  const h = new Date(nowMs + 5.5 * 3600000).getUTCHours();
  return h < 12 ? "ಶುಭೋದಯ" : h < 17 ? "ಶುಭ ಮಧ್ಯಾಹ್ನ" : "ಶುಭ ಸಂಜೆ";
}
function longDate(day: string) {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
}
function weekdayName(day: string) {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString("en-IN", { weekday: "long", timeZone: "UTC" });
}

export default function HomeDesk({ onNavigate }: { onNavigate: Go }) {
  const { prefs } = useCustomize();
  const skin = prefs.look.skin;
  const { data: session } = useSession();
  const name = (session?.user?.name || "").split(" ")[0];
  const [data, setData] = useState<BizData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nowMs] = useState(() => Date.now());

  useEffect(() => {
    const to = businessDate(nowMs);
    const from = shiftDay(to, -40);
    let live = true;
    fetch(`/api/reports/hub?from=${from}&to=${to}`)
      .then(async (r) => {
        const j = await r.json().catch(() => ({}));
        if (!live) return;
        if (!r.ok) setError(j.error || "Could not load today's figures.");
        else setData(j.data as BizData);
      })
      .catch(() => live && setError("Could not load today's figures."));
    return () => {
      live = false;
    };
  }, [nowMs]);

  const s = useMemo(() => (data ? homeSummary(data, nowMs) : null), [data, nowMs]);
  const [range, setRange] = useState<HomeRange>(() => {
    try {
      const v = localStorage.getItem("hm-range");
      return v === "week" || v === "month" ? v : "today";
    } catch {
      return "today";
    }
  });
  const pickRange = (v: HomeRange) => {
    setRange(v);
    try {
      localStorage.setItem("hm-range", v);
    } catch {
      /* ignore */
    }
  };
  const r = useMemo(() => (data ? rangeSummary(data, range, nowMs) : null), [data, range, nowMs]);
  const sp = useMemo(() => (data ? homeSparks(data, nowMs) : null), [data, nowMs]);

  if (error) return <div className="hm-note">{error}</div>;
  if (!s || !r || !sp) return <div className={`hm hm-loading hm-${skin === "earth" || skin === "pastel" ? skin : "glass"}`} aria-busy="true"><div className="hm-skel" /><div className="hm-skel" /><div className="hm-skel" /></div>;

  const bar = (
    <>
      <RangeBar r={r} s={s} range={range} onRange={pickRange} go={onNavigate} />
      <HomeActions />
    </>
  );
  if (skin === "earth") return <Earth s={s} r={r} sp={sp} bar={bar} go={onNavigate} />;
  if (skin === "pastel") return <Pastel s={s} r={r} sp={sp} bar={bar} go={onNavigate} name={name} nowMs={nowMs} />;
  return <Glass s={s} r={r} sp={sp} bar={bar} go={onNavigate} name={name} nowMs={nowMs} />;
}

type Sparks = ReturnType<typeof homeSparks>;
const RANGE_WORD: Record<HomeRange, { sold: string; vs: string; kn: string }> = {
  today: { sold: "Sold today", vs: "", kn: "ಇಂದು" },
  week: { sold: "Sold this week", vs: "the week before", kn: "ಈ ವಾರ" },
  month: { sold: "Sold this month", vs: "the same days last month", kn: "ಈ ತಿಂಗಳು" },
};

/** Today / Week / Month pills and the "today at a glance" chips. */
function RangeBar({ r, s, range, onRange, go }: { r: RangeSummary; s: HomeSummary; range: HomeRange; onRange: (v: HomeRange) => void; go: Go }) {
  return (
    <div className="hm-rangebar hm-rise">
      <div className="hm-pills" role="tablist" aria-label="Period">
        {(["today", "week", "month"] as HomeRange[]).map((k) => (
          <button key={k} role="tab" aria-selected={range === k} className={range === k ? "on" : ""} onClick={() => onRange(k)}>
            {k === "today" ? "Today" : k === "week" ? "Week" : "Month"}
          </button>
        ))}
      </div>
      <div className="hm-glance" aria-label="At a glance">
        <span className="g-n"><b>{r.bills}</b> {r.bills === 1 ? "bill" : "bills"}</span>
        <button className="g-n" onClick={() => go("ledger")}><b>{s.udhaarCustomers}</b> udhaar pending</button>
        <button className="g-n" onClick={() => go("jobwork")}><b>{s.jobWork.waiting}</b> job-work waiting</button>
        <span className="g-chip cash">Cash {inr(r.cashIn)}</span>
        <span className="g-chip upi">UPI {inr(r.upiIn)}</span>
        {r.creditGiven > 0 && <span className="g-chip ud">Udhaar given {inr(r.creditGiven)}</span>}
        <ShareButton
          className="g-n"
          label="📤 Share"
          title={`Mahadev Traders · ${RANGE_WORD[r.range].sold}`}
          url={false}
          text={[`${RANGE_WORD[r.range].sold}: ${inr(r.sold)} (${r.bills} bills)`, `Cash in ${inr(r.cashIn)} · UPI ${inr(r.upiIn)}`, r.creditGiven > 0 ? `Udhaar given ${inr(r.creditGiven)}` : "", `Udhaar pending: ${s.udhaarCustomers} customers, ${inr(s.udhaarOutstanding)}`, `Job-work waiting: ${s.jobWork.waiting}`, `Spent today ${inr(s.spentToday)}`].filter(Boolean).join("\n")}
        />
      </div>
    </div>
  );
}

/** Big shortcut cards on the home page: barrel weighing, straight to the full-barrel weight. */
function HomeActions() {
  return (
    <nav className="hm-actions hm-rise" aria-label="Barrel receiving">
      <a className="hm-card hm-act main" href="/barrels?weigh=full">
        <span className="ic" aria-hidden>🛢️</span>
        <span className="tx"><b>Barrel receiving</b><small>Weigh a FULL barrel · ತುಂಬಿದ ಬ್ಯಾರಲ್ ತೂಕ</small></span>
        <span className="go" aria-hidden>→</span>
      </a>
      <a className="hm-card hm-act" href="/barrels?weigh=empty">
        <span className="ic" aria-hidden>⚖️</span>
        <span className="tx"><b>Weigh EMPTY barrel</b><small>after pouring · ಖಾಲಿ ತೂಕ</small></span>
      </a>
      <a className="hm-card hm-act" href="/barrels?simple=1">
        <span className="ic" aria-hidden>👷</span>
        <span className="tx"><b>Simple mode for staff</b><small>only weighing, big buttons · ಸರಳ</small></span>
      </a>
    </nav>
  );
}

function RangeChange({ r, s, wordy }: { r: RangeSummary; s: HomeSummary; wordy?: boolean }) {
  if (r.range === "today") return <Change s={s} wordy={wordy} />;
  if (r.changePct === null) return <>{wordy ? `No sales in ${RANGE_WORD[r.range].vs}` : "—"}</>;
  const up = r.changePct >= 0;
  return (
    <>
      {wordy ? (up ? "Up " : "Down ") : up ? "↑ " : "↓ "}
      <b className={up ? "hm-up" : "hm-down"}>{Math.abs(r.changePct).toFixed(1)}%</b>
      {` vs ${RANGE_WORD[r.range].vs}`}
    </>
  );
}

/** Small 7-day trend line for a card. */
function Spark({ values, tone = "accent", label }: { values: number[]; tone?: "accent" | "in" | "out" | "jw"; label: string }) {
  const W = 96, H = 30;
  const max = Math.max(...values), min = Math.min(...values);
  const pts = values.map((v, i) => [2 + (i * (W - 4)) / (values.length - 1), H - 3 - ((v - min) / (max - min || 1)) * (H - 8)]);
  const d = "M" + pts.map((p) => p.map((n) => n.toFixed(1)).join(" ")).join(" L");
  const last = pts[pts.length - 1];
  return (
    <svg className={`hm-spark t-${tone}`} viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-label={`${label}, last 7 days`}>
      <path d={`${d} L${W - 2} ${H} L2 ${H} Z`} className="a" />
      <path d={d} className="l" />
      <circle cx={last[0]} cy={last[1]} r="2.6" className="p" />
    </svg>
  );
}

/** Hero chart: by hour for today, by day for a week or month. */
function RangeBars({ r, s }: { r: RangeSummary; s: HomeSummary }) {
  if (r.range === "today") return <HourBars s={s} compact />;
  const max = Math.max(1, ...r.series.map((b) => b.value));
  const peak = r.series.reduce((a, b, i) => (b.value > r.series[a].value ? i : a), 0);
  const step = r.series.length > 12 ? Math.ceil(r.series.length / 6) : 1;
  return (
    <div className="hm-hours">
      <div className="hm-bars" role="img" aria-label="Sales by day">
        {r.series.map((b, i) => (
          <div key={i} className={`hm-bar${i === peak && b.value > 0 ? " peak" : ""}`} style={{ height: `${Math.max(6, (b.value / max) * 100)}%`, animationDelay: `${i * 30}ms` }} title={`${b.label}: ${inr(b.value)}`} />
        ))}
      </div>
      <div className="hm-axis">
        {r.series.map((b, i) => (i % step === 0 || i === r.series.length - 1 ? <span key={i}>{b.label}</span> : null))}
      </div>
    </div>
  );
}

// ----------------------------------------------------------------- shared bits
function Change({ s, wordy }: { s: HomeSummary; wordy?: boolean }) {
  if (s.changePct === null) return <>{wordy ? "No sales on " + weekdayName(shiftDay(s.today, -7)) + " last week" : "—"}</>;
  const up = s.changePct >= 0;
  return (
    <>
      {wordy ? (up ? "Up " : "Down ") : up ? "↑ " : "↓ "}
      <b className={up ? "hm-up" : "hm-down"}>{Math.abs(s.changePct).toFixed(1)}%</b>
      {wordy ? ` from last ${weekdayName(shiftDay(s.today, -7))}` : ` vs last ${weekdayName(shiftDay(s.today, -7)).slice(0, 3)}`}
    </>
  );
}

function HourBars({ s, compact }: { s: HomeSummary; compact?: boolean }) {
  const bars = compact ? s.byHour.filter((b) => b.hour >= 9 && b.hour <= 20) : s.byHour;
  const max = Math.max(1, ...bars.map((b) => b.value));
  return (
    <div className="hm-hours">
      <div className="hm-bars" role="img" aria-label="Sales by hour today">
        {bars.map((b, i) => (
          <div key={b.hour} className={`hm-bar${b.hour === s.peakHour ? " peak" : ""}`} style={{ height: `${Math.max(6, (b.value / max) * 100)}%`, animationDelay: `${i * 40}ms` }} title={`${b.label}: ${inr(b.value)}`} />
        ))}
      </div>
      <div className="hm-axis">
        <span>{bars[0].label}</span>
        <span>{bars[Math.floor(bars.length / 3)].label}</span>
        <span>{bars[Math.floor((bars.length * 2) / 3)].label}</span>
        <span>{bars[bars.length - 1].label}</span>
      </div>
    </div>
  );
}

function Donut({ s }: { s: HomeSummary }) {
  const total = s.stock.reduce((a, i) => a + Math.max(0, i.qty), 0);
  const R = 50;
  const C = 2 * Math.PI * R;
  let off = 0;
  return (
    <div className="hm-donut">
      <svg viewBox="0 0 130 130" width="130" height="130" role="img" aria-label="Stock share">
        <circle cx="65" cy="65" r={R} className="hm-donut-track" fill="none" strokeWidth="14" />
        {s.stock.map((i, k) => {
          const len = total ? (Math.max(0, i.qty) / total) * C : 0;
          const el = <circle key={i.name} cx="65" cy="65" r={R} fill="none" strokeWidth="14" className={`hm-seg s${k % 6}`} strokeDasharray={`${Math.max(0, len - 2)} ${C}`} strokeDashoffset={-off} transform="rotate(-90 65 65)" />;
          off += len;
          return el;
        })}
      </svg>
      <div className="hm-donut-mid">
        <b>{Math.round(total).toLocaleString("en-IN")}</b>
        <span>{s.stock[0]?.unit || "kg"} total</span>
      </div>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="hm-empty">{children}</div>;
}

// ----------------------------------------------------------------- Earth & Clay
function Earth({ s, r, sp, bar, go }: { s: HomeSummary; r: RangeSummary; sp: Sparks; bar: React.ReactNode; go: Go }) {
  const sold = useCountUp(r.sold);
  return (
    <div className="hm hm-earth">
      {bar}
      <section className="hm-top">
        <div className="hm-hero hm-rise">
          <div className="hm-eyebrow">{RANGE_WORD[r.range].sold}</div>
          <div className="hm-big">{inr(sold)}</div>
          <div className="hm-sub">
            <RangeChange r={r} s={s} wordy />
          </div>
        </div>
        <div className="hm-card hm-rise d2">
          <div className="hm-card-h">
            <h3>{r.range === "today" ? "Sales by hour" : "Sales by day"}</h3>
            <span>{r.range === "today" ? (s.peakHour !== null ? `Peak at ${s.byHour.find((b) => b.hour === s.peakHour)?.label}` : "No sales yet") : `${r.bills} bills`}</span>
          </div>
          <RangeBars r={r} s={s} />
        </div>
      </section>

      <section className="hm-stats">
        <button className="hm-card hm-stat hm-rise d2" onClick={() => go("closing")}>
          <span className="l">Counter cash in</span>
          <span className="v">{inr(s.cashInToday)}</span>
          <span className="m">UPI {inr(s.upiInToday)} · Out {inr(s.cashOutToday)}</span>
          <Spark values={sp.cashIn} tone="in" label="Cash in" />
        </button>
        <button className="hm-card hm-stat hm-rise d3" onClick={() => go("manufacturing")}>
          <span className="l">Oil yield · 7 days</span>
          <span className="v">{s.yield7d === null ? "—" : `${s.yield7d.toFixed(1)}%`}</span>
          <span className="hm-meter"><i style={{ width: `${Math.min(100, ((s.yield7d || 0) / 45) * 100)}%` }} /></span>
        </button>
        <button className="hm-card hm-stat hm-rise d3" onClick={() => go("jobwork")}>
          <span className="l">Job-work waiting</span>
          <span className="v">{kg(s.jobWork.waitingKg)}</span>
          <span className="m">{plural(s.jobWork.waiting, "customer")} waiting{s.jobWork.overdue ? ` · ${s.jobWork.overdue} overdue` : ""}</span>
          <Spark values={sp.jobWorkKg} tone="jw" label="Job-work waiting" />
        </button>
        <button className="hm-card hm-stat dark hm-rise d4" onClick={() => go("ledger")}>
          <span className="l">Udhaar to collect</span>
          <span className="v">{short(s.udhaarOutstanding)}</span>
          <span className="m">{plural(s.udhaarCustomers, "customer")}</span>
          <Spark values={sp.udhaar} tone="out" label="Udhaar to collect" />
        </button>
      </section>

      <section className="hm-bottom">
        <div className="hm-card hm-rise d4">
          <div className="hm-card-h"><h3>Book summary</h3><span>This month</span></div>
          <table className="hm-tbl">
            <thead><tr><th>Item</th><th>This month</th><th>Today</th></tr></thead>
            <tbody>
              <tr><td>Sales</td><td>{inr(s.monthSales)}</td><td>{inr(s.soldToday)}</td></tr>
              <tr><td>Purchases</td><td>{inr(s.monthPurchases)}</td><td>—</td></tr>
              <tr><td>Expenses</td><td>{inr(s.monthExpenses)}</td><td>{inr(s.spentToday)}</td></tr>
              <tr><td>Udhaar out</td><td>{inr(s.udhaarOutstanding)}</td><td className={s.udhaarOutstanding > 0 ? "hm-warn" : ""}>{s.udhaarOutstanding > 0 ? "Follow up" : "Clear"}</td></tr>
            </tbody>
          </table>
        </div>
        <div className="hm-card hm-stockcard hm-rise d5">
          <div>
            <div className="hm-card-h"><h3>Oil stock</h3></div>
            {s.stock.length ? (
              <ul className="hm-legend">
                {s.stock.map((i, k) => (
                  <li key={i.name}><i className={`s${k % 6}`} />{i.name} <b>{Math.round(i.share)}%</b>{i.low && <em> low</em>}</li>
                ))}
              </ul>
            ) : (
              <Empty>Add items with opening stock to see oil stock here.</Empty>
            )}
          </div>
          {s.stock.length > 0 && <Donut s={s} />}
        </div>
      </section>
      <svg className="hm-hills" viewBox="0 0 1440 160" preserveAspectRatio="none" aria-hidden>
        <path d="M0 160 C 240 60 420 40 720 70 C 1000 100 1200 30 1440 80 L 1440 160 Z" />
      </svg>
    </div>
  );
}

// ----------------------------------------------------------------- Pastel Liquid
function Pastel({ s, r, sp, bar, go, name, nowMs }: { s: HomeSummary; r: RangeSummary; sp: Sparks; bar: React.ReactNode; go: Go; name: string; nowMs: number }) {
  const sold = useCountUp(r.sold);
  const max = Math.max(1, ...s.week.map((w) => w.total));
  return (
    <div className="hm hm-pastel">
      {bar}
      <section className="hm-top">
        <div className="hm-hero hm-rise">
          <div className="hm-hello">{knGreeting(nowMs)}{name ? `, ${name}` : ""} · {longDate(s.today).replace(/,? \d{4}$/, "")}</div>
          <div className="hm-big">{inr(sold)}</div>
          <div className="hm-sub">
            {RANGE_WORD[r.range].sold.toLowerCase()} — <RangeChange r={r} s={s} />
          </div>
          <div className="hm-chips">
            <span>{r.bills} bills</span>
            <span>Cash in {inr(r.cashIn)}</span>
            <span>UPI {inr(r.upiIn)}</span>
          </div>
          <svg className="hm-mountains" viewBox="0 0 900 140" preserveAspectRatio="none" aria-hidden>
            <path className="m1" d="M0 140 L110 40 L200 90 L330 0 L470 80 L560 30 L700 95 L820 50 L900 70 L900 140 Z" />
            <path className="m2" d="M0 140 L150 85 L290 115 L450 70 L600 110 L760 80 L900 100 L900 140 Z" />
          </svg>
        </div>
        <div className="hm-tiles">
          <button className="hm-tint mint hm-rise d2" onClick={() => go("manufacturing")}>
            <span className="l">Oil yield</span>
            <span className="v">{s.yield7d === null ? "—" : `${s.yield7d.toFixed(1)}%`}</span>
            <span className="m">{plural(s.barrelsSettling, "barrel")} settling</span>
          </button>
          <button className="hm-tint peach hm-rise d3" onClick={() => go("ledger")}>
            <span className="l">Udhaar</span>
            <span className="v">{short(s.udhaarOutstanding)}</span>
            <span className="m">{plural(s.udhaarCustomers, "customer")}</span>
            <Spark values={sp.udhaar} tone="out" label="Udhaar" />
          </button>
          <button className="hm-tint sky hm-rise d3" onClick={() => go("jobwork")}>
            <span className="l">Job-work</span>
            <span className="v">{kg(s.jobWork.waitingKg)}</span>
            <span className="m">{s.jobWork.waiting} waiting</span>
            <Spark values={sp.jobWorkKg} tone="jw" label="Job-work" />
          </button>
          <button className="hm-tint rose hm-rise d4" onClick={() => go("closing")}>
            <span className="l">Spent today</span>
            <span className="v">{inr(s.spentToday)}</span>
            <span className="m">cash out {inr(s.cashOutToday)}</span>
            <Spark values={sp.spent} tone="out" label="Spent" />
          </button>
        </div>
      </section>

      <section className="hm-row3">
        <div className="hm-card sand hm-rise d3">
          <div className="hm-card-h"><h3>Sales this week</h3></div>
          <div className="hm-week">
            {s.week.map((w, i) => (
              <div key={w.date} className="hm-wcol">
                <div className={`hm-wbar${i === s.week.length - 1 ? " today" : ""}`} style={{ height: `${Math.max(8, (w.total / max) * 100)}%`, animationDelay: `${i * 60}ms` }} title={`${w.label}: ${inr(w.total)}`} />
                <span className={i === s.week.length - 1 ? "on" : ""}>{w.label.slice(0, 1)}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="hm-card hm-rise d4">
          <div className="hm-card-h"><h3>Job-work waiting</h3><button className="hm-link" onClick={() => go("jobwork")}>Open desk</button></div>
          {s.jobWork.list.length ? (
            <ul className="hm-people">
              {s.jobWork.list.slice(0, 3).map((j) => (
                <li key={j.id} className={j.ageDays === 0 ? "new" : j.ageDays >= 3 ? "late" : "wait"}>
                  <span className="av">{j.customer.slice(0, 1).toUpperCase()}</span>
                  <span className="who"><b>{j.customer}</b><small>{kg(j.seedKg)} · {j.ageDays === 0 ? "today" : `${j.ageDays} day${j.ageDays > 1 ? "s" : ""}`}</small></span>
                  <span className="tag">{j.ageDays === 0 ? "New" : j.ageDays >= 3 ? "Late" : "Waiting"}</span>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>No job-work waiting.</Empty>
          )}
        </div>
        <div className="hm-card ask hm-rise d5">
          <div className="hm-card-h"><h3>Ask your desk</h3></div>
          <p>ಏನಾದರೂ ಕೇಳಿ — &ldquo;Who owes us more than a month?&rdquo;</p>
          <button className="hm-askbox" onClick={() => go("reports")}>
            <span>Type or speak…</span>
            <span className="go"><Icon name="send" size={18} /></span>
          </button>
          <div className="hm-chips dark">
            <button onClick={() => go("closing")}>Check today</button>
            <button onClick={() => go("ledger")}>Who owes?</button>
            <button onClick={() => go("jobwork")}>Unsettled job-work</button>
          </div>
        </div>
      </section>
    </div>
  );
}

// ----------------------------------------------------------------- Mahadev Glass (Neon Glow / other glass looks)
function Glass({ s, r, sp, bar, go, name, nowMs }: { s: HomeSummary; r: RangeSummary; sp: Sparks; bar: React.ReactNode; go: Go; name: string; nowMs: number }) {
  const sold = useCountUp(r.sold);
  const W = 560, H = 170;
  const max = Math.max(1, ...s.week.map((w) => Math.max(w.counter, w.bills)));
  const pt = (i: number, v: number) => [20 + (i * (W - 40)) / 6, H - 14 - (v / max) * (H - 34)] as const;
  const line = (key: "counter" | "bills") => s.week.map((w, i) => pt(i, w[key]).map((n) => n.toFixed(1)).join(",")).join(" ");
  const area = `20,${H - 14} ${line("counter")} ${W - 20},${H - 14}`;
  const last = pt(6, s.week[6].counter);
  const stockMax = Math.max(1, ...s.stock.map((i) => i.qty));
  return (
    <div className="hm hm-glass">
      <div className="hm-greet hm-rise">
        <small>{longDate(s.today)}</small>
        <h2>{greeting(nowMs)}{name ? `, ${name}` : ""}</h2>
      </div>
      {bar}

      <section className="hm-kpis">
        <button className="hm-card hm-kpi k-gold hm-rise" onClick={() => go("sales")}>
          <span className="l">{RANGE_WORD[r.range].sold.replace("Sold", "Sales")}</span>
          <span className="v">{inr(sold)}</span>
          <span className="m"><RangeChange r={r} s={s} /></span>
          <Spark values={sp.sales} tone="accent" label="Sales" />
        </button>
        <button className="hm-card hm-kpi k-amber hm-rise d2" onClick={() => go("closing")}>
          <span className="l">Cash in today</span>
          <span className="v">{inr(s.cashInToday)}</span>
          <span className={`m${s.lastCount?.mismatch ? " warn" : ""}`}>
            {s.lastCount ? (s.lastCount.diff === 0 ? "Last count matched" : `Count ${s.lastCount.diff > 0 ? "over" : "short"} ${inr(Math.abs(s.lastCount.diff))}`) : `UPI ${inr(s.upiInToday)}`}
          </span>
          <Spark values={sp.cashIn} tone="in" label="Cash in" />
        </button>
        <button className="hm-card hm-kpi k-rose hm-rise d3" onClick={() => go("ledger")}>
          <span className="l">Udhaar to collect</span>
          <span className="v">{inr(s.udhaarOutstanding)}</span>
          <span className="m soft">{plural(s.udhaarCustomers, "customer")}</span>
          <Spark values={sp.udhaar} tone="out" label="Udhaar to collect" />
        </button>
        <button className="hm-card hm-kpi k-teal hm-rise d4" onClick={() => go("manufacturing")}>
          <span className="l">Oil yield (7 days)</span>
          <span className="v">{s.yield7d === null ? "—" : <>{s.yield7d.toFixed(1)}<small>%</small></>}</span>
          <span className="m ok">{plural(s.barrelsSettling, "barrel")} settling</span>
        </button>
      </section>

      <section className="hm-card hm-pipe hm-rise d3">
        <div className="hm-card-h">
          <h3>Job-work pipeline <small>ಕೆಲಸದ ಗಾಣ</small></h3>
          <span className="hm-badge">{s.jobWork.waiting} waiting · {kg(s.jobWork.waitingKg)} seed</span>
        </div>
        <div className="hm-stages">
          <button className="st red" onClick={() => go("jobwork")}><em>New today</em><b>{plural(s.jobWork.newToday, "intake")}</b><small>{s.jobWork.list[0] ? `${s.jobWork.list[0].customer} · ${kg(s.jobWork.list[0].seedKg)}` : "none yet"}</small></button>
          <i />
          <button className="st blue" onClick={() => go("jobwork")}><em>Waiting</em><b>{plural(s.jobWork.waiting, "customer")}</b><small>{kg(s.jobWork.waitingKg)} seed</small></button>
          <i />
          <button className="st amber" onClick={() => go("jobwork")}><em>Overdue</em><b>{plural(s.jobWork.overdue, "customer")}</b><small>{s.jobWork.overdue ? "follow up today" : "nothing late"}</small></button>
          <i />
          <button className="st green" onClick={() => go("jobwork")}><em>Settled today</em><b>{plural(s.jobWork.settledToday, "customer")}</b><small>{inr(s.jobWork.settledTodayInr)} collected</small></button>
        </div>
      </section>

      <section className="hm-two">
        <div className="hm-card hm-rise d4">
          <div className="hm-card-h">
            <h3>Sales this week</h3>
            <span className="hm-key"><i className="c1" />Counter <i className="c2" />Bills</span>
          </div>
          <svg className="hm-line" viewBox={`0 0 ${W} ${H + 18}`} role="img" aria-label="Sales this week">
            <defs>
              <linearGradient id="hmArea" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0" className="a0" />
                <stop offset="1" className="a1" />
              </linearGradient>
            </defs>
            {[0.25, 0.5, 0.75, 1].map((f) => (
              <line key={f} x1="20" x2={W - 20} y1={H - 14 - f * (H - 34)} y2={H - 14 - f * (H - 34)} className="grid" />
            ))}
            <polygon points={area} fill="url(#hmArea)" />
            <polyline points={line("bills")} className="l2" fill="none" />
            <polyline points={line("counter")} className="l1" fill="none" pathLength={1} />
            <circle cx={last[0]} cy={last[1]} r="5" className="dot" />
            {s.week.map((w, i) => (
              <text key={w.date} x={pt(i, 0)[0]} y={H + 12} textAnchor="middle" className="ax">{w.label}</text>
            ))}
          </svg>
        </div>
        <div className="hm-card hm-rise d5">
          <div className="hm-card-h"><h3>Oil in stock</h3><button className="hm-link" onClick={() => go("inventory")}>Stock →</button></div>
          {s.stock.length ? (
            <ul className="hm-stockbars">
              {s.stock.map((i, k) => (
                <li key={i.name} className={i.low ? "low" : ""}>
                  <div><b>{i.name}</b><span>{Math.round(i.qty).toLocaleString("en-IN")} {i.unit}</span></div>
                  <span className="track"><i className={`s${k % 6}`} style={{ width: `${Math.max(4, (i.qty / stockMax) * 100)}%` }} /></span>
                  {i.low && <small>Low — reorder</small>}
                </li>
              ))}
            </ul>
          ) : (
            <Empty>Add items with opening stock to see oil in stock.</Empty>
          )}
        </div>
      </section>

      <section className="hm-card hm-rise d5">
        <div className="hm-card-h"><h3>Recent entries</h3><button className="hm-link" onClick={() => go("ledger")}>Open day book →</button></div>
        {s.recent.length ? (
          <table className="hm-tbl">
            <thead><tr><th>Time</th><th>Type</th><th>Item</th><th>Party</th><th>Paid by</th><th className="r">Amount</th></tr></thead>
            <tbody>
              {s.recent.map((r, i) => (
                <tr key={i}>
                  <td>{/T/.test(r.at) ? new Date(r.at).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" }) : "—"}</td>
                  <td><span className={`hm-pill ${r.side}`}>{r.type.replace(/_/g, " ").toLowerCase()}</span></td>
                  <td>{r.detail || "—"}</td>
                  <td>{r.party || "—"}</td>
                  <td>{r.mode.toLowerCase()}</td>
                  <td className={`r ${r.side === "out" ? "hm-down" : ""}`}>{r.side === "out" ? "−" : ""}{inr(r.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <Empty>No entries yet today.</Empty>
        )}
      </section>
    </div>
  );
}
