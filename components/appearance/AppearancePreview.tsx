"use client";

// 🎨 Live preview for Appearance: the real register counter card, buttons and workspace tabs, report
// cards and tabs, and quick-link tiles — drawn with the same classes the app uses, so every choice
// (theme, font, number font, cards, tabs, icons, layouts, graphics, tablet mode) shows here at once.
// The frame switch shows it at phone, tablet or full width.
import { useState } from "react";
import { G } from "@/components/register/Glyph";
import { useCustomize } from "@/lib/customize";
import "@/app/register/register.css";
import "@/app/register/qr-design.css";
import "@/app/go/go.css";
import "@/components/insights/insights.css";
import "./appearance.css";

type Frame = "phone" | "tablet" | "full";
const FRAMES: { k: Frame; label: string }[] = [
  { k: "phone", label: "📱 Phone" },
  { k: "tablet", label: "📟 Tablet" },
  { k: "full", label: "🖥️ Full" },
];
const TILES_IN = [
  { e: "💰", p: "Sale", s: "ಮಾರಾಟ" },
  { e: "🧾", p: "Sales bill", s: "ಬಿಲ್" },
  { e: "🫗", p: "Fresh crush sale", s: "ಹೊಸ ಗಾಣದ ಎಣ್ಣೆ" },
];
const TILES_OUT = [
  { e: "🛒", p: "Purchase", s: "ಖರೀದಿ" },
  { e: "🧾", p: "Expense", s: "ಖರ್ಚು" },
  { e: "👤", p: "Payment / Salary", s: "ಪಾವತಿ / ಸಂಬಳ" },
];
const WORK = ["Calculator", "Estimate", "Notepad", "Stock tally"];
const REPORT_TABS = ["Yield", "Stock", "Orders", "Profit"];
const LINKS = [
  { icon: "🛢️", t: "Barrel receiving", k: "ಬ್ಯಾರಲ್ ಸ್ವೀಕಾರ", d: "Label, weigh full & empty, check the oil", c: "#2f6f8f" },
  { icon: "🧾", t: "Purchase orders", k: "ಖರೀದಿ ಆರ್ಡರ್", d: "Order from suppliers, send on WhatsApp", c: "#8a5a2b" },
  { icon: "⚙️", t: "Machines", k: "ಯಂತ್ರಗಳು", d: "Hours, power units and service", c: "#4b5563" },
  { icon: "📈", t: "Insights", k: "ಒಳನೋಟ", d: "Yield, stock run-out, profit per kg", c: "#6d4ae0" },
];

export default function AppearancePreview() {
  const { prefs } = useCustomize();
  const skinned = prefs.look.skin !== "none";
  const [frame, setFrame] = useState<Frame>("tablet");
  const [work, setWork] = useState(0);
  const [rtab, setRtab] = useState(2);

  const tile = (t: { e: string; p: string; s: string }, g: string) => (
    <button key={t.p} type="button" className={`qr-tile g-${g}`}>
      <span className="ic"><G e={t.e} /></span>
      <span className="p">{t.p}</span>
      <span className="s">{t.s}</span>
    </button>
  );

  return (
    <section className="hub-card ap-pv" aria-label="Preview">
      <div className="ap-pv-head">
        <div>
          <b>Live preview</b>
          <span className="hub-m small"> · changes show here and on every screen of this device</span>
        </div>
        <div className="set-chips" role="radiogroup" aria-label="Preview size">
          {FRAMES.map((f) => (
            <button key={f.k} type="button" role="radio" aria-checked={frame === f.k} className={`set-chip${frame === f.k ? " on" : ""}`} onClick={() => setFrame(f.k)}>{f.label}</button>
          ))}
        </div>
      </div>

      <div className={`ap-frame ${frame}`}>
        <div className="ap-screen">
          {/* the register: counter card, buttons, workspace tabs */}
          <div className="qr ap-qr" data-size="m">
            <div className="qr-hero">
              <div className="qr-hero-l">Should be in counter <span className="qr-sub">ಕೌಂಟರಿನಲ್ಲಿ ಇರಬೇಕಾದ್ದು</span></div>
              <div className="qr-hero-v">₹15,020</div>
              <div className="qr-hero-chips">
                <span className="in"><small>↓ IN · ಬರುವುದು</small><b>₹21,480</b></span>
                <span className="out"><small>↑ OUT · ಹೋದದ್ದು</small><b>₹6,460</b></span>
                <span className="upi"><small>UPI</small><b>₹8,900</b></span>
              </div>
            </div>
            {skinned ? (
              <div className="qa">
                <div className="qa-sec">
                  <div className="qa-h t-in"><span className="dot" /><span className="t">Money in <span className="qr-sub">ಬರುವ ಹಣ</span></span><span className="m">₹21,480</span></div>
                  <div className="qa-grid">{TILES_IN.map((t) => tile(t, "in"))}</div>
                </div>
                <div className="qa-sec">
                  <div className="qa-h t-out"><span className="dot" /><span className="t">Money out <span className="qr-sub">ಹೋಗುವ ಹಣ</span></span><span className="m">₹6,460</span></div>
                  <div className="qa-grid">{TILES_OUT.map((t) => tile(t, "out"))}</div>
                </div>
              </div>
            ) : (
              <div className="ap-classic">
                <div className="qr-col in">{TILES_IN.map((t) => tile(t, "in"))}</div>
                <div className="qr-col out">{TILES_OUT.map((t) => tile(t, "out"))}</div>
              </div>
            )}
            <div className="qr-work" style={{ marginTop: 14 }}>
              <div className="qr-work-head">Workspace <span className="qr-sub">ಕೆಲಸದ ಜಾಗ</span></div>
              <div className="qr-chips qr-work-tools" role="tablist" aria-label="Workspace (preview)">
                {WORK.map((w, i) => (
                  <button key={w} type="button" role="tab" aria-selected={work === i} className={`qr-chip${work === i ? " sel" : ""}`} onClick={() => setWork(i)}>{w}</button>
                ))}
              </div>
              <div className="qr-cd" style={{ padding: "10px 14px", textAlign: "right" }}>1,250 × 62 = 77,500</div>
            </div>
          </div>

          {/* report pages: tabs and cards */}
          <div className="ap-hub">
            <div className="hub-tabs" role="tablist" aria-label="Report tabs (preview)">
              {REPORT_TABS.map((t, i) => (
                <button key={t} type="button" role="tab" aria-selected={rtab === i} className={rtab === i ? "on" : ""} onClick={() => setRtab(i)}>{t}</button>
              ))}
            </div>
            <div className="ins-cards">
              <div className="hub-kpi g"><div className="l">Sales today</div><div className="v">₹9,360</div><div className="s">2 counter · 1 invoice</div></div>
              <div className="hub-card">
                <h3>PO-12 · Ravi Traders</h3>
                <div className="hub-m small">01-11-2026 → due 05-11-2026</div>
                <div className="ins-bar"><span className="n">Groundnut seed</span><span className="b"><i style={{ width: "62%" }} /></span><span className="v">620/1000 kg</span></div>
                <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                  <button type="button" className="hub-btn sm primary">🟢 WhatsApp</button>
                  <button type="button" className="hub-btn sm">📄 View</button>
                </div>
              </div>
              <div className="hub-card">
                <h3>Oil yield</h3>
                <table style={{ width: "100%" }}>
                  <thead><tr><th style={{ textAlign: "left" }}>Lot</th><th style={{ textAlign: "right" }}>Oil %</th></tr></thead>
                  <tbody>
                    <tr><td>Groundnut · Ravi</td><td style={{ textAlign: "right" }}>41.2%</td></tr>
                    <tr><td>Safflower · Kumar</td><td style={{ textAlign: "right" }}>31.8%</td></tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* quick links */}
          <div className="go-grid ap-links">
            {LINKS.map((l) => (
              <div key={l.t} className="go-cell">
                <a className="go-tile" href="#" onClick={(e) => e.preventDefault()} style={{ "--go-c": l.c } as React.CSSProperties}>
                  <span className="ic" aria-hidden>{l.icon}</span>
                  <span className="t">{l.t}</span>
                  <span className="k">{l.k}</span>
                  {prefs.look.links === "cards" && <span className="d">{l.d}</span>}
                </a>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
