"use client";

import { useState } from "react";
import { freshCrushStats, itemsFor, normalizeFreshCrush, suggestedExtraKg, MASS_BALANCE_TOLERANCE_PCT, rateKey, type LangMode } from "@/lib/register";
import { word, words, type WordKey } from "@/lib/registerI18n";
import { ScaleBtn } from "@/components/register/SmartParts";
import { G } from "@/components/register/Glyph";
import { DayBundle, api, kg, Txt, Chips, PickMenu, PayState, initPay, payBody, PayPicker, SheetFrame, PartyField } from "./shared";



// ---------------------------------------------------------------------------
// Calculator (never saves anything)
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Fresh crush sale — our own seed crushed in front of the customer.
// Records the money (like a sale) AND the production numbers the accountant
// needs at day closing (seed used, oil made, oil to tank/barrel, oil cake).
// ---------------------------------------------------------------------------
export default function FreshCrushSheet({
  day,
  lang,
  date,
  onClose,
  onSaved,
  toast,
}: {
  day: DayBundle;
  lang: LangMode;
  date: string;
  onClose: () => void;
  onSaved: () => void;
  toast: (m: string) => void;
}) {
  const seeds = itemsFor("FRESH_CRUSH", day.config);
  const savedRate = (it: string | null, u: string) => {
    const r = it ? day.config.rates[rateKey("FRESH_CRUSH", `${it}:${u}`)] : undefined;
    return r ? String(r) : "";
  };
  const [seed, setSeed] = useState<string>(seeds[0]?.key || "other");
  const [otherName, setOtherName] = useState("");
  const [seedKg, setSeedKg] = useState("");
  const [oilKg, setOilKg] = useState("");
  const [soldQty, setSoldQty] = useState("");
  const [unit, setUnit] = useState<"kg" | "ltr">("kg");
  const [rate, setRate] = useState(() => savedRate(seeds[0]?.key || null, "kg"));
  const [amount, setAmount] = useState("");
  const [amtTouched, setAmtTouched] = useState(false);
  const [extra, setExtra] = useState("");
  const [extraTouched, setExtraTouched] = useState(false);
  const [extraTo, setExtraTo] = useState("");
  const [cake, setCake] = useState("");
  const [pay, setPay] = useState<PayState>(() => initPay());
  const [party, setParty] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  const n = (v: string) => (v === "" ? NaN : parseFloat(v));
  const seedN = n(seedKg);
  const oilN = n(oilKg);
  const soldN = n(soldQty);
  const autoAmount = soldN > 0 && n(rate) > 0 ? String(Math.round(soldN * n(rate) * 100) / 100) : "";
  const amountValue = amtTouched ? amount : autoAmount;
  const autoExtra = unit === "kg" ? suggestedExtraKg(oilN, soldN >= 0 ? soldN : null) : null;
  const extraValue = extraTouched ? extra : autoExtra !== null ? String(autoExtra) : "";
  const details = {
    seedKg: seedN,
    oilKg: oilN,
    soldKg: unit === "kg" && soldN >= 0 ? soldN : null,
    extraKg: extraValue === "" ? 0 : parseFloat(extraValue),
    extraTo,
    cakeKg: cake === "" ? 0 : parseFloat(cake),
  };
  const valid = normalizeFreshCrush(details);
  const stats = valid ? freshCrushStats(valid) : null;
  const cakeHint = seedN > 0 && oilN > 0 && oilN < seedN ? Math.round((seedN - oilN) * 10) / 10 : null;

  async function save() {
    if (seed === "other" && !otherName.trim()) return toast(word("itemName", lang));
    if (!valid) return toast(word("fcBadNumbers", lang));
    const amt = parseFloat(amountValue);
    if (!(amt > 0)) return toast(word("needAmount", lang));
    const pb = payBody(amt, pay, party);
    if ("err" in pb) return toast(word(pb.err, lang));
    setBusy(true);
    try {
      await api("/api/register", {
        method: "POST",
        body: JSON.stringify({
          date,
          kind: "FRESH_CRUSH",
          item: seed,
          itemLabel: seed === "other" ? otherName.trim() : null,
          qty: soldN > 0 ? soldN : null,
          unit,
          rateInr: n(rate) > 0 ? n(rate) : null, // remembered per seed AND unit by the API
          amountInr: amt,
          ...pb.body,
          partyName: party.trim() || null,
          notes: notes.trim() || null,
          details: valid,
        }),
      });
      onSaved();
    } catch (e) {
      toast(e instanceof Error ? e.message : word("error", lang));
      setBusy(false);
    }
  }

  const num = (v: string, set: (x: string) => void, label: WordKey, extraProps: Record<string, unknown> = {}) => (
    <div className="qr-f">
      <label>
        <Txt k={label} lang={lang} />
      </label>
      <input
        className="qr-num"
        type="number"
        inputMode="decimal"
        min={0}
        value={v}
        onChange={(e) => set(e.target.value)}
        {...extraProps}
      />
    </div>
  );

  return (
    <SheetFrame icon="🫗" k="FRESH_CRUSH" lang={lang} onClose={onClose}>
      <div className="qr-res" style={{ marginTop: 0, fontSize: 14, fontWeight: 600 }}>
        <span>ℹ️ {word("fcNotJobwork", lang)}</span>
      </div>

      <div className="qr-f" style={{ marginTop: 10 }}>
        <label>
          <Txt k="fcSeed" lang={lang} />
        </label>
        <PickMenu
          lang={lang}
          value={seed}
          options={seeds}
          onPick={(v) => {
            setSeed(v);
            setRate(savedRate(v, unit));
            setAmtTouched(false);
          }}
        />
      </div>
      {seed === "other" && (
        <div className="qr-f">
          <label>
            <Txt k="itemName" lang={lang} />
          </label>
          <input className="qr-txt" value={otherName} onChange={(e) => setOtherName(e.target.value)} />
        </div>
      )}

      <span className="qr-lbl">① <Txt k="fcStep1" lang={lang} /></span>
      <div className="qr-grid2">
        {num(seedKg, setSeedKg, "fcSeedKg")}
        {num(oilKg, setOilKg, "fcOilKg")}
      </div>
      <ScaleBtn lang={lang} onUse={(w) => (seedKg ? setOilKg(String(w)) : setSeedKg(String(w)))} />

      <span className="qr-lbl">② <Txt k="fcStep2" lang={lang} /></span>
      <div className="qr-f">
        <Chips
          compact
          lang={lang}
          value={unit}
          onPick={(u) => {
            setUnit(u);
            setRate(savedRate(seed, u));
            setAmtTouched(false);
          }}
          options={[
            { key: "kg", icon: "⚖️", en: "kg", kn: "ಕೆಜಿ" },
            { key: "ltr", icon: "🧴", en: "Litre", kn: "ಲೀಟರ್" },
          ]}
        />
      </div>
      <div className="qr-grid2">
        {num(soldQty, setSoldQty, "fcSold")}
        <div className="qr-f">
          <label>
            {words("rate", lang).main} {unit === "kg" ? "kg" : "Litre"}
            {words("rate", lang).sub && (
              <span className="qr-sub">
                {words("rate", lang).sub} {unit === "kg" ? "ಕೆಜಿ" : "ಲೀಟರ್"}
              </span>
            )}
          </label>
          <input className="qr-num" type="number" inputMode="decimal" min={0} value={rate} onChange={(e) => setRate(e.target.value)} />
        </div>
      </div>
      <div className="qr-f">
        <label>
          <Txt k="amount" lang={lang} />
        </label>
        <input
          className="qr-num"
          type="number"
          inputMode="decimal"
          min={0}
          value={amountValue}
          onChange={(e) => {
            setAmount(e.target.value);
            setAmtTouched(e.target.value !== "");
          }}
        />
      </div>
      <PayPicker lang={lang} total={parseFloat(amountValue) || 0} state={pay} onChange={setPay} />
      <PartyField value={party} onChange={setParty} top={day.topParties} all={day.allParties} lang={lang} />

      <span className="qr-lbl">③ <Txt k="fcStep3" lang={lang} /></span>
      <div className="qr-grid2">
        {num(extraValue, (v) => {
          setExtra(v);
          setExtraTouched(true);
        }, "fcExtra")}
        <div className="qr-f">
          <label>
            <Txt k="fcExtraTo" lang={lang} />
          </label>
          <input className="qr-txt" list="qr-tanks" value={extraTo} onChange={(e) => setExtraTo(e.target.value)} placeholder="Karadi tank / Barrel A1" />
          <datalist id="qr-tanks">
            <option value="Karadi tank" />
            <option value="Groundnut tank" />
            <option value="Sunflower tank" />
            <option value="Barrel" />
          </datalist>
        </div>
      </div>
      {unit === "ltr" && <div className="qr-hint">{word("fcLtrHint", lang)}</div>}
      <div className="qr-f">
        <label>
          <Txt k="fcCake" lang={lang} />
        </label>
        <input className="qr-num" type="number" inputMode="decimal" min={0} value={cake} onChange={(e) => setCake(e.target.value)} />
        {cakeHint !== null && (
          <div className="qr-hint">
            {word("fcCakeHint", lang)} ≈ {cakeHint} kg
          </div>
        )}
      </div>
      <div className="qr-f">
        <label>
          <Txt k="note" lang={lang} />
        </label>
        <input className="qr-txt" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>

      {stats && (
        <div className={`qr-res ${stats.lossFlag || (stats.unaccountedOilKg ?? 0) > 0.05 ? "bad" : "ok"}`}>
          <span>
            {word("fcYield", lang)} {stats.yieldPct.toFixed(1)}%
            {valid!.cakeKg > 0 && (
              <span className="qr-sub">
                {word("fcLossLbl", lang)} {kg(stats.lossKg)} ({stats.lossPct.toFixed(1)}%)
                {stats.lossFlag ? ` — ${word("fcLoss", lang)} (>${MASS_BALANCE_TOLERANCE_PCT}%)` : ""}
              </span>
            )}
            {(stats.unaccountedOilKg ?? 0) > 0.05 && (
              <span className="qr-sub">
                {word("fcUnaccounted", lang)}: {kg(stats.unaccountedOilKg!)}
              </span>
            )}
          </span>
        </div>
      )}
      {!valid && seedKg !== "" && oilKg !== "" && <div className="qr-res bad"><G e="⚠️" /> {word("fcBadNumbers", lang)}</div>}

      <button className="qr-save" onClick={save} disabled={busy}>
        ✓ {word(busy ? "saving" : "save", lang)}
      </button>
    </SheetFrame>
  );
}
