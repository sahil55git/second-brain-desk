"use client";

import { useEffect, useState } from "react";
import { businessDate, type LangMode } from "@/lib/register";
import { pairLabel, word, words } from "@/lib/registerI18n";
import { STOCK_PRODUCTS, computeProductTally } from "@/lib/calculations";
import { STOCK_KN, csvToTable, isFlagged, parseTallyRows } from "@/lib/stockTally";
import { G } from "@/components/register/Glyph";
import { todayIST, api, Chips, SheetFrame } from "./shared";



// ---------------------------------------------------------------------------
// Quick stock tally — the Daily Closing desk's 10-product oil-stock count,
// with the desk's own Sale / Gap maths and its 0.5 kg flag. Saved on the
// same DailyClosing row as that session's cash count.
// ---------------------------------------------------------------------------
export default function StockSheet({
  lang,
  date,
  onClose,
  onSaved,
  toast,
}: {
  lang: LangMode;
  date: string;
  onClose: () => void;
  onSaved: (msg: string) => void;
  toast: (m: string) => void;
}) {
  const hour = Number(new Date().toLocaleString("en-US", { hour: "numeric", hour12: false, timeZone: "Asia/Kolkata" }));
  const [session, setSession] = useState<"AFTERNOON" | "NIGHT">(hour >= 16 ? "NIGHT" : "AFTERNOON");
  // Which day this count is for: today, or yesterday (late entry of yesterday's closing).
  const todayStr = todayIST();
  const yesterdayStr = businessDate(Date.now() - 86400000);
  const [day, setDay] = useState<string>(date === yesterdayStr ? yesterdayStr : todayStr);
  const [yesterday, setYesterday] = useState<Record<string, number | null>>({});
  const [vals, setVals] = useState<Record<string, { today: string; reportSale: string }>>({});
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<{
      data: {
        yesterday: Record<string, Record<string, number | null>>;
        sessions: Record<string, { stock: Record<string, { today?: number | null; reportSale?: number | null }> } | null>;
      };
    }>(`/api/register/stock?date=${day}`)
      .then((r) => {
        setYesterday(r.data.yesterday[session] || {});
        const existing = r.data.sessions[session]?.stock;
        setVals({});
        if (existing)
          setVals(
            Object.fromEntries(
              Object.entries(existing).map(([k, v]) => [k, { today: v.today == null ? "" : String(v.today), reportSale: v.reportSale == null ? "" : String(v.reportSale) }])
            )
          );
        setLoaded(true);
      })
      .catch((e) => toast(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [day, session]);

  const n = (v: string | undefined) => (v === undefined || v === "" || Number.isNaN(Number(v)) ? null : Number(v));
  const rows = STOCK_PRODUCTS.map((p) => {
    const v = vals[p.key] || { today: "", reportSale: "" };
    const c = computeProductTally(p, n(v.today), n(v.reportSale), yesterday[p.key] ?? null, "auto");
    return { p, v, c, flagged: isFlagged(c) };
  });
  const counted = rows.filter((r) => r.c.today !== null).length;
  const flagged = rows.filter((r) => r.flagged).length;
  const set = (k: string, field: "today" | "reportSale", value: string) =>
    setVals((cur) => ({ ...cur, [k]: { today: cur[k]?.today ?? "", reportSale: cur[k]?.reportSale ?? "", [field]: value } }));

  async function importFile(f: File) {
    try {
      let table: unknown[][];
      if (/\.csv$|\.txt$/i.test(f.name)) table = csvToTable(await f.text());
      else {
        const { readSheet } = await import("read-excel-file/universal");
        table = (await readSheet(f)) as unknown[][];
      }
      const r = parseTallyRows(table);
      if (!r.matched) return toast(word("stNone", lang));
      setVals((cur) => {
        const next = { ...cur };
        for (const [k, v] of Object.entries(r.input)) next[k] = { today: v.today == null ? "" : String(v.today), reportSale: v.reportSale == null ? "" : String(v.reportSale) };
        return next;
      });
      toast(`✓ ${r.matched}${r.skipped.length ? ` · skipped: ${r.skipped.join(", ")}` : ""}`);
    } catch (e) {
      toast(e instanceof Error ? e.message : word("error", lang));
    }
  }
  function template() {
    const csv = ["Product,Today (counted),Report sale", ...STOCK_PRODUCTS.map((p) => `${p.label},,`)].join("\n");
    const url = URL.createObjectURL(new Blob(["\ufeff" + csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "stock-tally-sheet.csv";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function save() {
    if (!counted) return toast(word("stNone", lang));
    setBusy(true);
    try {
      const stock = Object.fromEntries(rows.filter((r) => r.c.today !== null).map((r) => [r.p.key, { today: n(r.v.today), reportSale: n(r.v.reportSale) }]));
      const res = await api<{ data: { flagged: number } }>("/api/register/stock", { method: "POST", body: JSON.stringify({ date: day, session, stock }) });
      onSaved(`${word("stSaved", lang)} ✓${res.data.flagged ? ` — ⚠️ ${res.data.flagged} ${word("stGaps", lang)}` : ""}`);
    } catch (e) {
      toast(e instanceof Error ? e.message : word("error", lang));
      setBusy(false);
    }
  }

  const label = (p: { key: string; label: string }) => {
    const l = pairLabel(p.label, STOCK_KN[p.key] || p.label, lang);
    return (
      <>
        {l.main}
        {l.sub && <span className="qr-sub">{l.sub}</span>}
      </>
    );
  };
  const fmt = (v: number | null | undefined) => (v === null || v === undefined ? "—" : String(Math.round(v * 100) / 100));

  return (
    <SheetFrame icon="📦" k="stockTally" lang={lang} onClose={onClose}>
      <div className="qr-f">
        <Chips
          lang={lang}
          value={session}
          onPick={setSession}
          options={[
            { key: "AFTERNOON", icon: "🌤️", en: "Tally 1 (midday)", kn: "ಎಣಿಕೆ 1 (ಮಧ್ಯಾಹ್ನ)" },
            { key: "NIGHT", icon: "🌙", en: "Tally 2 (closing)", kn: "ಎಣಿಕೆ 2 (ಮುಚ್ಚುವ)" },
          ]}
        />
      </div>
      <div className="qr-f">
        <Chips
          lang={lang}
          value={day === yesterdayStr ? "Y" : "T"}
          onPick={(k) => {
            setLoaded(false);
            setDay(k === "Y" ? yesterdayStr : todayStr);
          }}
          options={[
            { key: "T", icon: "📅", en: "Today", kn: "ಇಂದು" },
            { key: "Y", icon: "🕘", en: "Yesterday (late entry)", kn: "ನಿನ್ನೆ (ತಡ ಎಂಟ್ರಿ)" },
          ]}
        />
      </div>
      {day !== todayStr && (
        <div className="qr-hint" style={{ marginBottom: 8 }}>
          <G e="🕘" /> {lang === "kn" ? `ನಿನ್ನೆಯ (${day}) ಎಣಿಕೆ — ಇಂದಿನ ಆರಂಭದ ಸ್ಟಾಕ್‌ಗೆ ಸೇರುತ್ತದೆ.` : `Late entry for ${day} — carries into today's opening stock.`}
        </div>
      )}
      <div className="qr-hint" style={{ marginBottom: 8 }}>{word("stHint", lang)}</div>
      <a className="qr-btn2 qr-openwin" href={`/stock?date=${day}&session=${session}`} target="_blank" rel="noreferrer">
        <G e="🗄️" /> {lang === "kn" ? "ಪೂರ್ಣ ಸ್ಟಾಕ್ ವಿಂಡೋ ತೆರೆಯಿರಿ" : "Open full stock window"}
        <small>{lang === "kn" ? "ಎಲ್ಲಾ ಉತ್ಪನ್ನಗಳ ಪೂರ್ಣ ಮುಚ್ಚುವ ಸ್ಟಾಕ್ ಎಣಿಕೆ" : "Complete closing stock · all products · tomorrow's opening"}</small>
      </a>
      <div className="qr-btnrow" style={{ marginTop: 0, marginBottom: 8 }}>
        <label className="qr-btn2" style={{ textAlign: "center", cursor: "pointer" }}>
          <G e="📤" /> {word("stImport", lang)}
          <input type="file" accept=".csv,.txt,.xlsx" style={{ display: "none" }} onChange={(e) => e.target.files?.[0] && importFile(e.target.files[0])} />
        </label>
        <button className="qr-btn2" onClick={template}>
          <G e="📄" /> {word("stTemplate", lang)}
        </button>
      </div>
      <div className="qr-tablewrap qr-stock">
        <table className="qr-table">
          <thead>
            <tr>
              <th>{words("stProduct", lang).main}</th>
              <th className="num">{words("stYesterday", lang).main}</th>
              <th>{words("stCounted", lang).main}</th>
              <th>{words("stReport", lang).main}</th>
              <th className="num">{words("stGap", lang).main}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ p, v, c, flagged: f }) => (
              <tr key={p.key} className={f ? "flag" : ""}>
                <td>
                  <b>{label(p)}</b>
                </td>
                <td className="num">{fmt(c.yesterday)}</td>
                <td>
                  <input
                    className="qr-cell"
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step="0.1"
                    value={v.today}
                    onChange={(e) => set(p.key, "today", e.target.value)}
                    aria-label={`${p.label} counted`}
                  />
                </td>
                <td>
                  {p.hasReportSale ? (
                    <input
                      className="qr-cell"
                      type="number"
                      inputMode="decimal"
                      min={0}
                      step="0.1"
                      value={v.reportSale}
                      onChange={(e) => set(p.key, "reportSale", e.target.value)}
                      aria-label={`${p.label} report sale`}
                    />
                  ) : (
                    <span className="qr-m">—</span>
                  )}
                </td>
                <td className="num">
                  {c.today === null ? (
                    "—"
                  ) : (
                    <b className={f ? "qr-r" : "qr-g"}>
                      {fmt(c.gap ?? c.diff)}
                      <span className="qr-sub">
                        {words("stSale", lang).main} {fmt(c.sale ?? null)}
                      </span>
                    </b>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className={`qr-res ${flagged ? "bad" : counted ? "ok" : ""}`}>
        <span>
          {counted}/{STOCK_PRODUCTS.length} {words("stCounted", lang).main.toLowerCase()}
        </span>
        <span>{flagged ? `⚠️ ${flagged} ${word("stGaps", lang)}` : counted ? "✓" : ""}</span>
      </div>
      <button className="qr-save tool" onClick={save} disabled={busy || !loaded}>
        ✓ {word(busy ? "saving" : "save", lang)}
      </button>
    </SheetFrame>
  );
}
