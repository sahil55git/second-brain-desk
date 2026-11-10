"use client";

import { useState } from "react";
import { DENOMINATIONS, denominationTotal, systemCash, type LangMode } from "@/lib/register";
import { word } from "@/lib/registerI18n";
import { G } from "@/components/register/Glyph";
import { Tally, DayBundle, rs, api, Txt, Chips, SheetFrame } from "./shared";



// ---------------------------------------------------------------------------
// Cash count (Tally 1 / Tally 2) — saved as a DailyClosing row server-side.
// ---------------------------------------------------------------------------
export default function CountSheet({
  day,
  lang,
  date,
  isOwner,
  onClose,
  onSaved,
  reload,
  toast,
}: {
  day: DayBundle;
  lang: LangMode;
  date: string;
  isOwner: boolean;
  onClose: () => void;
  onSaved: (msg: string) => void;
  reload: () => Promise<void>;
  toast: (m: string) => void;
}) {
  const hour = Number(new Date().toLocaleString("en-US", { hour: "numeric", hour12: false, timeZone: "Asia/Kolkata" }));
  const [session, setSession] = useState<"AFTERNOON" | "NIGHT">(
    day.tallies.AFTERNOON || hour >= 16 ? "NIGHT" : "AFTERNOON"
  );
  const [denoms, setDenoms] = useState<Record<string, string>>({});
  const [coins, setCoins] = useState("");
  const [busy, setBusy] = useState(false);

  const counted = denominationTotal(
    Object.fromEntries(Object.entries(denoms).map(([k, v]) => [k, parseInt(v, 10) || 0])),
    parseFloat(coins) || 0
  );
  const sys = systemCash(day.opening.value, day.entries, day.jwEvents, Date.now());
  const diff = counted - sys;

  async function editOpening() {
    const v = window.prompt(word("opening", lang) + " ₹", String(Math.round(day.opening.value)));
    if (v === null || v === "" || Number.isNaN(Number(v))) return;
    try {
      await api("/api/register/config", {
        method: "PUT",
        body: JSON.stringify({ openings: { ...(isOwner ? day.config.openings : {}), [date]: Number(v) } }),
      });
      await reload();
    } catch (e) {
      toast(e instanceof Error ? e.message : word("error", lang));
    }
  }

  async function save() {
    setBusy(true);
    try {
      const r = await api<{ data: Tally }>("/api/register/tally", {
        method: "POST",
        body: JSON.stringify({
          date,
          session,
          coins: parseFloat(coins) || 0,
          denoms: Object.fromEntries(Object.entries(denoms).map(([k, v]) => [k, parseInt(v, 10) || 0])),
        }),
      });
      const d = r.data.cashDiffInr;
      onSaved(
        Math.abs(d) < 1
          ? `✓ ${word("matched", lang)}`
          : `${d > 0 ? "⚠️ " + word("short", lang) : word("extra", lang)} ${rs(Math.abs(d))}${
              r.data.cashMismatch ? " — " + word("overLimit", lang) : ""
            }`
      );
    } catch (e) {
      toast(e instanceof Error ? e.message : word("error", lang));
      setBusy(false);
    }
  }

  return (
    <SheetFrame icon="💵" k="count" lang={lang} onClose={onClose}>
      <div className="qr-f">
        <label>
          <Txt k="which" lang={lang} />
        </label>
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
      <div className="qr-res">
        <span>
          <Txt k="opening" lang={lang} />
        </span>
        <span>{rs(day.opening.value)}</span>
      </div>
      <a className="qr-btn2 qr-openwin" href={`/cash?date=${date}&session=${session}`} target="_blank" rel="noreferrer">
        <G e="🗄️" /> {lang === "kn" ? "ಪೂರ್ಣ ಕ್ಯಾಶ್ ವಿಂಡೋ ತೆರೆಯಿರಿ" : "Open full cash window"}
        <small>{lang === "kn" ? "ನೋಟು ಎಣಿಕೆ · ನಿನ್ನೆಯ ತಡ ಎಂಟ್ರಿ" : "Note-by-note count · yesterday's late entry"}</small>
      </a>
      <button className="qr-btn2" style={{ width: "100%", marginTop: 6 }} onClick={editOpening}>
        <G e="✏️" /> {word("editOpening", lang)}
      </button>
      <table className="qr-dt" style={{ marginTop: 8 }}>
        <tbody>
          {DENOMINATIONS.map((d) => (
            <tr key={d}>
              <td>₹{d}</td>
              <td>
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  aria-label={`₹${d}`}
                  value={denoms[String(d)] || ""}
                  onChange={(e) => setDenoms({ ...denoms, [String(d)]: e.target.value })}
                />
              </td>
              <td>{rs((parseInt(denoms[String(d)] || "0", 10) || 0) * d)}</td>
            </tr>
          ))}
          <tr>
            <td>{word("coins", lang)}</td>
            <td colSpan={2}>
              <input type="number" inputMode="numeric" min={0} value={coins} onChange={(e) => setCoins(e.target.value)} />
            </td>
          </tr>
        </tbody>
      </table>
      <div className="qr-res">
        <span>
          <Txt k="counted" lang={lang} />
        </span>
        <span>{rs(counted)}</span>
      </div>
      <div className="qr-res">
        <span>
          <Txt k="inCounter" lang={lang} />
        </span>
        <span>{rs(sys)}</span>
      </div>
      {counted > 0 && (
        <div className={`qr-res ${Math.abs(diff) < 1 || diff > 0 ? "ok" : "bad"}`}>
          <span>
            {Math.abs(diff) < 1
              ? `✓ ${word("matched", lang)}`
              : diff < 0
              ? `⚠️ ${word("short", lang)}`
              : word("extra", lang)}
          </span>
          <span>{Math.abs(diff) >= 1 ? rs(Math.abs(diff)) : ""}</span>
        </div>
      )}
      <button className="qr-save tool" onClick={save} disabled={busy || counted <= 0}>
        ✓ {word(busy ? "saving" : "save", lang)}
      </button>
    </SheetFrame>
  );
}
