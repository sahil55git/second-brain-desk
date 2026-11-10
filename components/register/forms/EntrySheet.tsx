"use client";

import UdhaarHint from "@/components/register/UdhaarHint";
import { useEffect, useMemo, useState } from "react";
import { KIND_SIDE, UNITS, itemsFor, rateKey, type LangMode, type CatalogItem, type Mode, type RegisterKind } from "@/lib/register";
import { pairLabel, word, words, type WordKey } from "@/lib/registerI18n";
import { PaymentProof } from "@/components/register/ProofParts";
import { proofNeeded } from "@/lib/proofs";
import { saveCopyOnDevice, uploadProof, type Captured } from "@/lib/proofClient";
import { ChecksBox, CodeBtn, ScaleBtn, loadItems, useRecentEntries } from "@/components/register/SmartParts";
import { hasAlert, registerChecks } from "@/lib/registerChecks";
import { matchCatalogItem, normUnit } from "@/lib/registerSmart";
import { findItemByCode } from "@/lib/smartEntry";
import { G, useSkinned } from "@/components/register/Glyph";
import { EntryInit, DayBundle, KIND_ICON, rs, todayIST, api, Txt, Chips, PickMenu, PayState, initPay, payBody, PayPicker, SheetFrame, PartyField } from "./shared";



// ---------------------------------------------------------------------------
// Entry sheet (sale / udhaar / purchase / expense / payment / pigmee / draw)
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// POS entry pieces (designed looks): item cards instead of a drop-down, a
// quantity stepper, and a big amount box with its own keypad.
// ---------------------------------------------------------------------------
function ItemCards({ items, value, onPick, lang }: { items: CatalogItem[]; value: string | null; onPick: (k: string) => void; lang: LangMode }) {
  return (
    <div className="pos-items" role="radiogroup">
      {items.map((o) => {
        const l = pairLabel(o.en, o.kn, lang);
        return (
          <button key={o.key} type="button" role="radio" aria-checked={value === o.key} className={`pos-item${value === o.key ? " sel" : ""}`} onClick={() => onPick(o.key)}>
            <span className="pi-ic" aria-hidden>
              <G e={o.icon} />
            </span>
            <span className="pi-t">
              <b>{l.main}</b>
              {l.sub && <small>{l.sub}</small>}
            </span>
          </button>
        );
      })}
    </div>
  );
}


function QtyStepper({ value, onChange, lang }: { value: string; onChange: (v: string) => void; lang: LangMode }) {
  const n = parseFloat(value) || 0;
  const step = (d: number) => onChange(String(Math.max(0, Math.round((n + d) * 100) / 100)));
  return (
    <div className="pos-step">
      <button type="button" aria-label={lang === "kn" ? "ಕಡಿಮೆ" : "Less"} onClick={() => step(-1)} disabled={n <= 0}>
        −
      </button>
      <input className="qr-num" type="number" inputMode="decimal" min={0} step="0.1" value={value} placeholder="0" onChange={(e) => onChange(e.target.value)} aria-label={word("qty", lang)} />
      <button type="button" aria-label={lang === "kn" ? "ಹೆಚ್ಚು" : "More"} onClick={() => step(1)}>
        +
      </button>
    </div>
  );
}


const PAD_KEYS = ["1", "2", "3", "⌫", "4", "5", "6", "C", "7", "8", "9", "00", ".", "0"] as const;

function AmountPad({
  value,
  typed,
  hint,
  onType,
  onUseHint,
  lang,
  autoFocus,
}: {
  value: string;
  typed: boolean;
  hint: string | null; // "5 kg × ₹160" when the amount can be worked out
  onType: (v: string) => void;
  onUseHint: () => void;
  lang: LangMode;
  autoFocus?: boolean;
}) {
  const press = (k: (typeof PAD_KEYS)[number]) => {
    const cur = typed ? value : "";
    if (k === "⌫") return onType(cur.slice(0, -1));
    if (k === "C") return onType("");
    if (k === "." && cur.includes(".")) return;
    if (cur.replace(".", "").length >= 9) return;
    const next = (cur + k).replace(/^0+(?=\d)/, "");
    onType(next === "." ? "0." : next);
  };
  const shown = value ? Number(value).toLocaleString("en-IN", { maximumFractionDigits: 2 }) : "0";
  // Keypad can be hidden (remembered on this device); the amount box still takes typing.
  const [padOff, setPadOff] = useState(false);
  useEffect(() => {
    try {
      setPadOff(localStorage.getItem("qr-pad") === "off");
    } catch {}
  }, []);
  const togglePad = () => {
    const next = !padOff;
    setPadOff(next);
    try {
      localStorage.setItem("qr-pad", next ? "off" : "on");
    } catch {}
  };
  return (
    <div className={`pos-amt${padOff ? " pad-off" : ""}`}>
      <div className="pa-box">
        <div className="pa-l">
          <span className="pa-k">
            <Txt k="amount" lang={lang} />
          </span>
          <label className="pa-v">
            <span aria-hidden>₹{shown}</span>
            <input
              className="pa-in"
              type="number"
              inputMode="decimal"
              min={0}
              value={value}
              autoFocus={autoFocus}
              aria-label={word("amount", lang)}
              onChange={(e) => onType(e.target.value)}
            />
          </label>
        </div>
        {hint && (
          <button type="button" className={`pa-hint${typed ? "" : " on"}`} onClick={onUseHint}>
            {hint}
            <b>{typed ? (lang === "kn" ? "ಬಳಸಿ" : "tap to use") : lang === "kn" ? "ತುಂಬಿದೆ" : "filled for you"}</b>
          </button>
        )}
      </div>
      {!padOff && (
        <div className="pa-keys">
          {PAD_KEYS.map((k) => (
            <button key={k} type="button" className={k === "⌫" || k === "C" ? "fn" : ""} onClick={() => press(k)} aria-label={k === "⌫" ? "Delete" : k === "C" ? "Clear" : k}>
              {k}
            </button>
          ))}
        </div>
      )}
      <button type="button" className="pa-toggle" onClick={togglePad} aria-expanded={!padOff}>
        <span className="ic" aria-hidden>{padOff ? "▾" : "▴"}</span>
        <Txt k={padOff ? "showPad" : "hidePad"} lang={lang} />
      </button>
    </div>
  );
}


// One item already added to a multi-item bill (the form holds the next one).
type DraftLine = { item: string | null; otherName: string; qty: number | null; unit: string; rate: number | null; amount: number };


export default function EntrySheet({
  kind,
  init,
  day,
  lang,
  date,
  onClose,
  onSaved,
  toast,
}: {
  kind: RegisterKind;
  init?: EntryInit; // pre-filled by a voice command — still needs Save
  day: DayBundle;
  lang: LangMode;
  date: string;
  onClose: () => void;
  onSaved: (msg?: string) => void;
  toast: (m: string) => void;
}) {
  const side = KIND_SIDE[kind];
  const pos = useSkinned(); // designed looks get the POS layout
  const items = itemsFor(kind, day.config);
  const hasQty = kind === "SALE" || kind === "PURCHASE";
  const modes: { key: Mode; icon: string; en: string; kn: string }[] =
    kind === "SALE" || kind === "PURCHASE"
      ? [
          { key: "CASH", icon: "💵", en: "Cash", kn: "ನಗದು" },
          { key: "UPI", icon: "📱", en: "UPI", kn: "UPI" },
          { key: "CREDIT", icon: "📒", en: "Udhaar", kn: "ಉದ್ರಿ" },
        ]
      : [
          { key: "CASH", icon: "💵", en: "Cash", kn: "ನಗದು" },
          { key: "UPI", icon: "📱", en: "UPI", kn: "UPI" },
        ];

  const [totalMode, setTotalMode] = useState<"itemwise" | "total">("itemwise");
  const [item, setItem] = useState<string | null>(init?.item && items.some((i) => i.key === init.item) ? init.item : items[0]?.key || null);
  const [otherName, setOtherName] = useState(init?.otherName || "");
  const [qty, setQty] = useState(init?.qty ? String(init.qty) : "");
  const [unit, setUnit] = useState(init?.unit || "kg");
  const savedRate = (it: string | null) => {
    const r = it ? day.config.rates[rateKey(kind, it)] : undefined;
    return r ? String(r) : "";
  };
  const [rate, setRate] = useState(() =>
    init?.rate ? String(init.rate) : savedRate(init?.item && items.some((i) => i.key === init.item) ? init.item : items[0]?.key || null)
  );
  // If the day's data refreshes while the sheet is open (e.g. the previous
  // save is still reloading), fill a still-empty rate from the saved one.
  useEffect(() => {
    if (!item) return;
    const r = day.config.rates[rateKey(kind, item)];
    if (r) setRate((cur) => (cur === "" ? String(r) : cur));
  }, [day.config.rates, item, kind]);
  const voiceAmount = init?.amount && !(init.qty && init.rate) ? String(init.amount) : null;
  const [amount, setAmount] = useState(voiceAmount ?? (kind === "PIGMEE" ? String(day.config.pigmeeDefault || "") : ""));
  const [amtTouched, setAmtTouched] = useState(kind === "PIGMEE" || !!voiceAmount);
  const [mode, setMode] = useState<Mode>(init?.mode || "CASH");
  // Sales: cash / UPI / owner PhonePe / udhaar, or split across them.
  const [pay, setPay] = useState<PayState>(() => initPay(init?.mode));
  const [showNote, setShowNote] = useState(false);
  const [party, setParty] = useState(init?.party || "");
  const [notes, setNotes] = useState(init?.note || "");
  const [drawKind, setDrawKind] = useState<"partial" | "full">("partial");
  const [busy, setBusy] = useState<false | "entry" | "proof">(false);
  // Proof of payment (signature / photos) for money going out.
  const proofKind = kind === "PAYMENT" || kind === "PURCHASE" || kind === "EXPENSE";
  const [proofs, setProofs] = useState<Captured[]>([]);
  // The photo the AI read this entry from: filed with the entry, but it does NOT
  // count as the owner's "proof of payment" (that stays a signature / recipient photo).
  const [billPhoto, setBillPhoto] = useState<Captured | null>(init?.photo || null);
  // Multi-item bill: items already added; the form above is the next item.
  const [bill, setBill] = useState<DraftLine[]>([]);

  // Auto amount = qty × rate, computed on every render (no lag) until the
  // amount is typed by hand.
  const autoAmount = (() => {
    const q = parseFloat(qty);
    const r = parseFloat(rate);
    return q > 0 && r > 0 ? String(Math.round(q * r * 100) / 100) : "";
  })();
  const amountValue = amtTouched ? amount : autoAmount;

  const showItemwise = !(kind === "SALE" && totalMode === "total");
  const unitObj = UNITS.find((u) => u.key === unit) || UNITS[0];
  const canBill = showItemwise && hasQty && items.length > 0;
  const billOn = canBill && bill.length > 0;
  const curAmt = parseFloat(amountValue) || 0;
  const itemName = (k: string | null, other: string) => {
    if (k === "other") return other.trim();
    const c = items.find((i) => i.key === k);
    return c ? (lang === "kn" ? c.kn : c.en) : "";
  };
  const curLine = (): DraftLine => ({
    item,
    otherName: otherName.trim(),
    qty: parseFloat(qty) || null,
    unit,
    rate: parseFloat(rate) || null,
    amount: Math.round(curAmt * 100) / 100,
  });
  // Bill total = items already added + the item being entered now.
  const billTotal = billOn ? Math.round((bill.reduce((a, l) => a + l.amount, 0) + curAmt) * 100) / 100 : curAmt;
  function addToBill() {
    if (!(curAmt > 0)) return toast(word("needAmount", lang));
    if (item === "other" && !otherName.trim()) return toast(word("itemName", lang));
    setBill((b) => [...b, curLine()]);
    setQty("");
    setAmount("");
    setAmtTouched(false);
    setOtherName("");
    toast(word("billAdded", lang));
  }
  // Tap an added item to bring it back into the form (the form's item goes to the bill).
  function editLine(i: number) {
    const ln = bill[i];
    setBill((b) => {
      const rest = b.filter((_, j) => j !== i);
      return curAmt > 0 && !(item === "other" && !otherName.trim()) ? [...rest, curLine()] : rest;
    });
    setItem(ln.item);
    setOtherName(ln.otherName);
    setQty(ln.qty ? String(ln.qty) : "");
    setUnit(ln.unit || "kg");
    setRate(ln.rate ? String(ln.rate) : "");
    const auto = ln.qty && ln.rate ? Math.round(ln.qty * ln.rate * 100) / 100 : 0;
    setAmount(String(ln.amount));
    setAmtTouched(Math.abs(auto - ln.amount) > 0.001);
  }

  // Owner's rule (Settings): cash leaving the counter needs a proof.
  const proofRequired =
    proofKind && mode === "CASH" && proofNeeded(day.config.proofRequired || [], kind, billTotal, day.config.proofMinInr || 0);

  // ---- live checks (they only point things out — Save is never blocked) ----
  const recent = useRecentEntries(date);
  const history = useMemo(() => [...day.entries, ...recent.filter((e) => e.date !== date)], [day.entries, recent, date]);
  const draftMode: Mode | "OWNER_PHONEPE" = kind === "SALE" ? (pay.splitOn ? ((parseFloat(pay.parts.CREDIT || "") || 0) > 0 ? "CREDIT" : "CASH") : pay.chan) : mode;
  const checks = registerChecks(
    {
      kind,
      item: showItemwise ? item : null,
      qty: showItemwise && hasQty ? parseFloat(qty) || null : null,
      unit: showItemwise && hasQty ? unit : null,
      rate: showItemwise && hasQty ? parseFloat(rate) || null : null,
      amount: parseFloat(amountValue) || 0,
      amountTyped: amtTouched,
      mode: draftMode,
      party,
      date,
    },
    { entries: history, savedRate: item ? day.config.rates[rateKey(kind, item)] ?? null : null, cashNow: day.systemCashNow, today: todayIST(), nowMs: Date.now() }
  );

  // A scanned barcode / QR: the Items master → this form's own item button.
  async function onCode(code: string) {
    const hit = findItemByCode(code, await loadItems());
    if (!hit) return toast(word("codeNotFound", lang));
    const cat = matchCatalogItem(hit.name, items);
    const key = cat ? cat.key : "other";
    const u = normUnit(hit.unit);
    if (cat) setRate(savedRate(cat.key));
    else {
      setOtherName(hit.name);
      toast(word("codeNoMatch", lang));
    }
    // Counter packs (pieces / boxes / bags): every scan of the same pack adds one.
    if (u === "pcs" || u === "box" || u === "bags") setQty((q) => String(key === item && parseFloat(q) > 0 ? parseFloat(q) + 1 : 1));
    if (u) setUnit(u);
    setItem(key);
    setAmtTouched(false);
  }

  async function save() {
    // A bill: the items added + the one in the form (if it has an amount).
    const lines = billOn ? (curAmt > 0 ? [...bill, curLine()] : bill) : [];
    if (billOn && curAmt > 0 && item === "other" && !otherName.trim()) return toast(word("itemName", lang));
    const amt = billOn ? Math.round(lines.reduce((a, l) => a + l.amount, 0) * 100) / 100 : parseFloat(amountValue);
    if (!(amt > 0)) return toast(word("needAmount", lang));
    if (!billOn && item === "other" && showItemwise && !otherName.trim()) return toast(word("itemName", lang));
    const one = lines.length === 1 ? lines[0] : null; // only the added item, form left empty
    if (proofRequired && !proofs.length) return toast(word("proofNeeded", lang));
    let payFields: Record<string, unknown> = { paymentMode: mode };
    if (kind === "SALE") {
      const pb = payBody(amt, pay, party);
      if ("err" in pb) return toast(word(pb.err, lang));
      payFields = pb.body;
    }
    setBusy("entry");
    let entryId: string | null = null;
    try {
      const res = await api<{ data: { id: string } }>("/api/register", {
        method: "POST",
        body: JSON.stringify({
          date,
          kind,
          amountInr: amt,
          ...payFields,
          totalSale: kind === "SALE" && totalMode === "total",
          ...(one
            ? { item: one.item, itemLabel: one.item === "other" ? one.otherName : null, qty: one.qty, unit: one.qty ? one.unit : null, rateInr: one.rate }
            : {
                item: showItemwise ? item : null,
                itemLabel: showItemwise && item === "other" ? otherName.trim() : null,
                qty: showItemwise && hasQty ? parseFloat(qty) || null : null,
                unit: showItemwise && hasQty ? unit : null,
                rateInr: showItemwise && hasQty ? parseFloat(rate) || null : null,
              }),
          lines:
            lines.length > 1
              ? lines.map((l) => ({ item: l.item, itemLabel: l.item === "other" ? l.otherName : null, qty: l.qty, unit: l.unit, rate: l.rate, amount: l.amount }))
              : undefined,
          partyName: party.trim() || null,
          notes: notes.trim() || null,
          drawKind: kind === "OWNER_DRAW" ? drawKind : null,
        }),
      });
      entryId = res.data?.id || null;
    } catch (e) {
      toast(e instanceof Error ? e.message : word("error", lang));
      setBusy(false);
      return;
    }
    // The entry is saved. Now attach the proofs; a failed upload never loses
    // the picture — it is downloaded to the device instead.
    let msg = word("saved", lang);
    const toUpload = billPhoto ? [...proofs, billPhoto] : proofs;
    if (entryId && (toUpload.length || init?.linkProofId)) {
      setBusy("proof");
      let failed = 0;
      let kept = false;
      for (const p of toUpload) {
        try {
          const r = await uploadProof(p, { date, registerEntryId: entryId, partyName: party.trim() || null, amountInr: amt });
          if (!r.drive.ok) kept = true;
        } catch {
          failed++;
          await saveCopyOnDevice(p.kind, date, p.dataUrl, `${date}_${p.kind}_${Date.now()}.${p.dataUrl.startsWith("data:image/png") ? "png" : "jpg"}`);
        }
      }
      if (init?.linkProofId) {
        try {
          await api(`/api/attachments/${init.linkProofId}`, { method: "PATCH", body: JSON.stringify({ registerEntryId: entryId }) });
        } catch {
          failed++;
        }
      }
      msg = failed ? word("proofFailed", lang) : toUpload.length ? `${word("proofSaved", lang)}${kept ? " " + word("proofKept", lang) : ""}` : msg;
    }
    onSaved(msg);
  }

  return (
    <SheetFrame icon={KIND_ICON[kind]} k={kind as WordKey} lang={lang} onClose={onClose}>
      {kind === "SALE" && (
        <div className="qr-f">
          <Chips
            compact
            lang={lang}
            value={totalMode}
            onPick={setTotalMode}
            options={[
              { key: "itemwise", icon: "📋", en: "Item-wise", kn: "ಐಟಂ ಪ್ರಕಾರ" },
              { key: "total", icon: "🧾", en: "Total sale (scale slip)", kn: "ಒಟ್ಟು ಮಾರಾಟ (ಸ್ಕೇಲ್ ಸ್ಲಿಪ್)" },
            ]}
          />
        </div>
      )}

      {showItemwise && items.length > 0 && (
        <div className="qr-f">
          <label>
            <Txt k="what" lang={lang} />
          </label>
          {pos ? (
            <ItemCards
              lang={lang}
              value={item}
              items={items}
              onPick={(v) => {
                setItem(v);
                setRate(savedRate(v));
                setAmtTouched(false);
              }}
            />
          ) : (
            <PickMenu
              lang={lang}
              value={item}
              options={items}
              onPick={(v) => {
                // Remembered rate for the picked item, filled immediately.
                setItem(v);
                setRate(savedRate(v));
                setAmtTouched(false);
              }}
            />
          )}
          {item === "other" && (
            <input className="qr-txt" style={{ marginTop: 6 }} placeholder={word("itemName", lang)} value={otherName} onChange={(e) => setOtherName(e.target.value)} autoFocus={!init?.otherName} />
          )}
        </div>
      )}
      {showItemwise && hasQty && items.length > 0 && <CodeBtn lang={lang} onCode={onCode} />}

      {kind === "OWNER_DRAW" && (
        <div className="qr-f">
          <Chips
            compact
            lang={lang}
            value={drawKind}
            onPick={setDrawKind}
            options={[
              { key: "partial", icon: "✂️", en: "Part", kn: "ಸ್ವಲ್ಪ" },
              { key: "full", icon: "🌙", en: "Full closing", kn: "ಪೂರ್ತಿ" },
            ]}
          />
        </div>
      )}

      {showItemwise && hasQty && (
        <ScaleBtn
          lang={lang}
          onUse={(w) => {
            setQty(String(w));
            setUnit("kg");
            setAmtTouched(false);
          }}
        />
      )}
      {showItemwise && hasQty && pos && (
        <div className="qr-f pos-qty">
          <div className="pq-row">
            <div className="pq-q">
              <label className="qr-lbl">
                <Txt k="qty" lang={lang} />
              </label>
              <QtyStepper lang={lang} value={qty} onChange={(v) => { setQty(v); setAmtTouched(false); }} />
            </div>
            <div className="pq-r">
              <label className="qr-lbl">
                {words("rate", lang).main} {lang === "kn" ? unitObj.kn : unitObj.en}
              </label>
              <input className="qr-num" type="number" inputMode="decimal" min={0} value={rate} onChange={(e) => { setRate(e.target.value); setAmtTouched(false); }} />
            </div>
          </div>
          <Chips compact lang={lang} value={unit} onPick={(u) => { setUnit(u); setAmtTouched(false); }} options={UNITS} />
        </div>
      )}
      {showItemwise && hasQty && !pos && (
        <div className="qr-grid3 qr-f">
          <div>
            <label className="qr-lbl">
              <Txt k="qty" lang={lang} />
            </label>
            <input className="qr-num" type="number" inputMode="decimal" min={0} step="0.1" value={qty} onChange={(e) => setQty(e.target.value)} />
          </div>
          <div>
            <label className="qr-lbl">{lang === "kn" ? unitObj.kn : unitObj.en}</label>
            <PickMenu lang={lang} value={unit} onPick={setUnit} options={UNITS} searchAt={99} />
          </div>
          <div>
            <label className="qr-lbl">
              {words("rate", lang).main} {lang === "kn" ? unitObj.kn : unitObj.en}
            </label>
            <input className="qr-num" type="number" inputMode="decimal" min={0} value={rate} onChange={(e) => setRate(e.target.value)} />
          </div>
        </div>
      )}

      {pos ? (
        <div className="qr-f">
          <AmountPad
            lang={lang}
            value={amountValue}
            typed={amtTouched}
            autoFocus={!hasQty && items.length === 0}
            hint={showItemwise && hasQty && autoAmount ? `${qty} ${lang === "kn" ? unitObj.kn : unitObj.en} × ₹${rate}` : null}
            onUseHint={() => {
              setAmount("");
              setAmtTouched(false);
            }}
            onType={(v) => {
              setAmount(v);
              setAmtTouched(v !== "");
            }}
          />
        </div>
      ) : (
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
            autoFocus={!hasQty && items.length === 0}
            onChange={(e) => {
              setAmount(e.target.value);
              setAmtTouched(e.target.value !== "");
            }}
          />
        </div>
      )}

      {canBill && (
        <div className="qr-f qr-bill">
          {bill.length > 0 && (
            <div className="qb-list">
              <div className="qb-head">
                <span>
                  <Txt k="billItems" lang={lang} />
                </span>
                <span>{bill.length + (curAmt > 0 ? 1 : 0)} {word("items", lang)}</span>
              </div>
              {bill.map((l, i) => (
                <div className="qb-row" key={i}>
                  <button type="button" className="qb-main" onClick={() => editLine(i)}>
                    <span className="qb-n">{i + 1}</span>
                    <span className="qb-name">
                      {itemName(l.item, l.otherName)}
                      {l.qty ? <small> · {l.qty} {lang === "kn" ? (UNITS.find((u) => u.key === l.unit) || UNITS[0]).kn : (UNITS.find((u) => u.key === l.unit) || UNITS[0]).en}{l.rate ? ` × ₹${l.rate}` : ""}</small> : null}
                    </span>
                    <b>{rs(l.amount)}</b>
                  </button>
                  <button type="button" className="qb-x" aria-label={word("removeQ", lang)} onClick={() => setBill((b) => b.filter((_, j) => j !== i))}>
                    ✕
                  </button>
                </div>
              ))}
              {curAmt > 0 && (
                <div className="qb-row cur">
                  <span className="qb-main">
                    <span className="qb-n">{bill.length + 1}</span>
                    <span className="qb-name">{itemName(item, otherName) || "—"}<small> · {word("billNextItem", lang)}</small></span>
                    <b>{rs(curAmt)}</b>
                  </span>
                </div>
              )}
              <div className="qb-total">
                <span>
                  <Txt k="billTotal" lang={lang} />
                </span>
                <b>{rs(billTotal)}</b>
              </div>
            </div>
          )}
          <button type="button" className="qr-addbill" onClick={addToBill}>
            <span className="pl">+</span> <Txt k="addToBill" lang={lang} />
          </button>
        </div>
      )}

      {side !== "oth" && kind === "SALE" && (
        <div className={pos ? "pos-pay" : undefined}>
          <PayPicker lang={lang} total={billTotal} state={pay} onChange={setPay} />
        </div>
      )}
      {side !== "oth" && kind !== "SALE" && (
        <div className={`qr-f${pos ? " pos-pay" : ""}`}>
          <label>
            <Txt k="how" lang={lang} />
          </label>
          <Chips compact lang={lang} value={mode} onPick={setMode} options={modes} />
        </div>
      )}

      {side !== "oth" && (
        <>
          <PartyField value={party} onChange={setParty} top={day.topParties} all={day.allParties} lang={lang} places />
          {kind === "SALE" && <UdhaarHint party={party} />}
        </>
      )}

      {showNote || notes ? (
        <div className="qr-f">
          <label>
            <Txt k="note" lang={lang} />
          </label>
          <input className="qr-txt" value={notes} onChange={(e) => setNotes(e.target.value)} autoFocus={showNote} />
        </div>
      ) : (
        <div className="qr-f">
          <button type="button" className="qr-linkbtn" onClick={() => setShowNote(true)}>
            <Txt k="addNote" lang={lang} />
          </button>
        </div>
      )}

      {proofKind && (
        <PaymentProof
          lang={lang}
          title={word(kind as WordKey, "en")}
          amount={billTotal}
          party={party}
          required={!!proofRequired}
          value={proofs}
          onChange={setProofs}
          toast={toast}
        />
      )}
      {init?.linkProofId && <div className="qr-hint"><G e="📎" /> {word("scanLinked", lang)}</div>}
      {billPhoto && (
        <div className="qr-f qr-scanview">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={billPhoto.dataUrl} alt="" style={{ maxHeight: 120 }} />
          <div className="qr-hint"><G e="📎" /> {word("smartPhotoKept", lang)}</div>
          <button type="button" className="qr-mini" onClick={() => setBillPhoto(null)}>
            ✕ {word("removeQ", lang).replace("?", "")}
          </button>
        </div>
      )}

      <ChecksBox checks={checks} lang={lang} />
      {pos ? (
        <div className="pos-savebar">
          <div className="ps-sum">
            <small>
              {billOn ? `${bill.length + (curAmt > 0 ? 1 : 0)} ${word("items", lang)} · ${word("billTotal", lang)}` : [showItemwise && item ? (item === "other" ? otherName : pairLabel(items.find((i) => i.key === item)?.en || "", items.find((i) => i.key === item)?.kn || "", "en").main) : "", showItemwise && hasQty && qty ? `${qty} ${lang === "kn" ? unitObj.kn : unitObj.en}` : ""].filter(Boolean).join(" · ") || word(kind as WordKey, lang)}
            </small>
            <b>{rs(billTotal)}</b>
          </div>
          <button className={`qr-save ${side === "in" ? "" : side === "out" ? "out" : "oth"}`} onClick={save} disabled={!!busy}>
            ✓ {busy === "proof" ? word("proofSaving", lang) : word(busy ? "saving" : hasAlert(checks) ? "saveAnyway" : "save", lang)}
          </button>
        </div>
      ) : (
        <button className={`qr-save ${side === "in" ? "" : side === "out" ? "out" : "oth"}`} onClick={save} disabled={!!busy}>
          ✓ {busy === "proof" ? word("proofSaving", lang) : word(busy ? "saving" : hasAlert(checks) ? "saveAnyway" : "save", lang)}
        </button>
      )}
    </SheetFrame>
  );
}
