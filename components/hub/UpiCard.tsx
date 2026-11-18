"use client";

// Settings → 💳 UPI & QR: the shop's UPI IDs and the name customers see, a test QR, and a printable "Scan & pay"
// card for the counter. Anything a customer's UPI app can read works (PhonePe, Google Pay, Paytm, BHIM, a bank app…):
// they all pay through the same standard link, so one QR serves every customer. Saved in the shared "shop" setting
// (keeps every other field there); counter bills, printed receipts, GST invoices and udhaar messages pick it up by themselves.
import { useEffect, useMemo, useState } from "react";
import QrCode from "@/components/barrels/QrCode";
import ReceiptSheet, { useShop } from "@/components/print/ReceiptSheet";
import ShareButton from "@/components/share/ShareButton";
import { refreshShopPay } from "@/lib/useShopPay";
import { MAX_ACCOUNTS, appHint, cleanVpa, mergeShopPay, parseShopPay, payLink, payeeFromLink, vpaProblem } from "@/lib/shopPay";

interface Row {
  id: string;
  label: string;
  vpa: string;
}
const newId = () => `u${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;

export default function UpiCard({ flash }: { flash: (m: string) => void }) {
  const shop = useShop();
  const [loaded, setLoaded] = useState(false);
  const [payee, setPayee] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [saved, setSaved] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [testAmt, setTestAmt] = useState("1");
  const [testId, setTestId] = useState("");
  const [roll, setRoll] = useState(false);

  const snapshot = (p: string, r: Row[]) => JSON.stringify([p.trim(), r.map((x) => [x.label.trim(), cleanVpa(x.vpa)])]);

  useEffect(() => {
    fetch("/api/settings/app?key=shop", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        const p = parseShopPay(j?.data);
        const rs = p.accounts.map((a) => ({ id: a.id, label: a.label, vpa: a.vpa }));
        setPayee(p.payee);
        setRows(rs);
        setSaved(snapshot(p.payee, rs));
        setTestId(rs[0]?.id ?? "");
      })
      .catch(() => setErr("Could not load the saved UPI IDs. Check the internet and reopen this page."))
      .finally(() => setLoaded(true));
  }, []);

  const problems = rows.map((r) => (r.vpa.trim() ? vpaProblem(r.vpa) : "Type the UPI ID or remove this row."));
  const dupes = rows.map((r, i) => !!cleanVpa(r.vpa) && rows.findIndex((x) => cleanVpa(x.vpa) === cleanVpa(r.vpa)) !== i);
  const hasErr = problems.some(Boolean) || dupes.some(Boolean);
  const dirty = loaded && snapshot(payee, rows) !== saved;

  const patch = (i: number, p: Partial<Row>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...p } : r)));
  // typing is left alone; pasting or leaving the box tidies it, and a pasted UPI link also gives the payee name
  const tidy = (i: number) => {
    const raw = rows[i]?.vpa ?? "";
    const v = cleanVpa(raw);
    if (v !== raw) patch(i, { vpa: v });
    const pn = payeeFromLink(raw);
    if (pn && !payee.trim()) setPayee(pn);
  };

  const usable = rows.filter((r, i) => !problems[i] && !dupes[i] && cleanVpa(r.vpa));
  const test = usable.find((r) => r.id === testId) ?? usable[0] ?? null;
  const testAmount = Math.max(0, Number(testAmt) || 0);
  const payeeShown = payee.trim() || shop.name;
  const testLink = test ? payLink({ vpa: cleanVpa(test.vpa), payee: payeeShown, amount: testAmount, note: "Test" }) : "";
  const staticLink = test ? payLink({ vpa: cleanVpa(test.vpa), payee: payeeShown }) : "";

  const save = async () => {
    if (hasErr || busy) return;
    setBusy(true);
    setErr("");
    try {
      // keep every other field in the shop setting (name, location …)
      const cur = await fetch("/api/settings/app?key=shop", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null));
      const data = mergeShopPay(cur?.data, { payee, accounts: rows.map((r) => ({ id: r.id, label: r.label, vpa: cleanVpa(r.vpa) })) });
      const res = await fetch("/api/settings/app", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: "shop", data }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || `Could not save (HTTP ${res.status}).`);
      const p = parseShopPay(data);
      const rs = p.accounts.map((a) => ({ id: a.id, label: a.label, vpa: a.vpa }));
      setRows(rs);
      setPayee(p.payee);
      setSaved(snapshot(p.payee, rs));
      refreshShopPay(p);
      flash("UPI saved ✓");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  };

  const doc = useMemo(
    () => ({ title: "SCAN TO PAY", rows: [], qr: staticLink || undefined, notes: [payeeShown, test ? cleanVpa(test.vpa) : "", "Any UPI app · type the amount"].filter(Boolean) }),
    [staticLink, payeeShown, test]
  );

  if (!loaded) return <div className="hub-empty">Loading…</div>;
  return (
    <>
      <section className="hub-card">
        <h3>💳 UPI payments</h3>
        <div className="hub-m small" style={{ marginBottom: 8 }}>
          Add the shop&apos;s UPI ID once. Customers can then pay by scanning the QR with <b>any</b> UPI app: PhonePe, Google Pay, Paytm, BHIM, Amazon Pay or a bank app. You can paste the link or text that your UPI app gives for its QR instead of typing.
        </div>

        <div className="set-row">
          <span className="lab">
            Name customers see
            <small>Shown on their pay screen. Use the name on the bank account, or leave empty to use the business name ({shop.name}).</small>
          </span>
          <input value={payee} maxLength={60} onChange={(e) => setPayee(e.target.value)} placeholder={shop.name} style={{ width: 260, maxWidth: "100%" }} />
        </div>

        {rows.map((r, i) => (
          <div key={r.id} className="set-row" style={{ alignItems: "flex-start", flexWrap: "wrap", gap: 8 }}>
            <span className="lab" style={{ minWidth: 120 }}>
              {i === 0 ? "Main UPI ID" : `UPI ID ${i + 1}`}
              {i === 0 && <small>Bills use this one unless the counter picks another.</small>}
            </span>
            <span style={{ display: "flex", flexDirection: "column", gap: 4, flex: "1 1 260px" }}>
              <span style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                <input value={r.label} maxLength={30} onChange={(e) => patch(i, { label: e.target.value })} placeholder="Name (SBI, Main…)" style={{ width: 130 }} aria-label="Name for this UPI ID" />
                <input
                  value={r.vpa}
                  onChange={(e) => patch(i, { vpa: e.target.value })}
                  onPaste={() => setTimeout(() => tidy(i), 0)}
                  onBlur={() => tidy(i)}
                  placeholder="shopname@ybl"
                  inputMode="email"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  style={{ flex: "1 1 180px", minWidth: 160 }}
                  aria-label="UPI ID"
                  aria-invalid={!!(problems[i] || dupes[i])}
                />
              </span>
              {(problems[i] || dupes[i]) && <small style={{ color: "#c0392b" }}>{problems[i] || "This UPI ID is already in the list."}</small>}
              {!problems[i] && !dupes[i] && appHint(r.vpa) && <small className="hub-m">Looks like a {appHint(r.vpa)} ID.</small>}
            </span>
            <span style={{ display: "flex", gap: 6 }}>
              {i > 0 && <button className="hub-btn" onClick={() => setRows((rs) => [rs[i], ...rs.filter((_, j) => j !== i)])} title="Use this one as the main UPI ID">★ Main</button>}
              <button className="hub-btn" onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))} aria-label="Remove this UPI ID">✕</button>
            </span>
          </div>
        ))}
        {!rows.length && <div className="hub-empty">No UPI ID yet.</div>}

        <div className="set-row">
          <button className="hub-btn" disabled={rows.length >= MAX_ACCOUNTS} onClick={() => setRows((rs) => [...rs, { id: newId(), label: rs.length ? `UPI ${rs.length + 1}` : "Main", vpa: "" }])}>
            ＋ Add a UPI ID
          </button>
          <button className="hub-btn primary" disabled={!dirty || hasErr || busy} onClick={() => void save()}>
            {busy ? "Saving…" : dirty ? "Save" : "Saved ✓"}
          </button>
        </div>
        {err && <div className="hub-banner">{err}</div>}
      </section>

      {test && (
        <section className="hub-card">
          <h3>🔍 Test it</h3>
          <div className="hub-m small" style={{ marginBottom: 8 }}>
            Scan this with another phone&apos;s UPI app. The pay screen should show your name and this amount. You can stop there without paying, or pay ₹1 to test the whole thing.
          </div>
          <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ background: "#fff", padding: 10, borderRadius: 12, lineHeight: 0 }}>
              <QrCode value={testLink} moduleSize={4} />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <label className="hub-m">
                Amount ₹ <input type="number" min={0} step="1" value={testAmt} onChange={(e) => setTestAmt(e.target.value)} style={{ width: 100 }} />
              </label>
              {usable.length > 1 && (
                <label className="hub-m">
                  UPI ID{" "}
                  <select value={test.id} onChange={(e) => setTestId(e.target.value)}>
                    {usable.map((r) => (
                      <option key={r.id} value={r.id}>{r.label} · {cleanVpa(r.vpa)}</option>
                    ))}
                  </select>
                </label>
              )}
              <a className="hub-btn" href={testLink}>📲 Open in a UPI app on this device</a>
              <small className="hub-m">{payeeShown} · {cleanVpa(test.vpa)}</small>
            </div>
          </div>
        </section>
      )}

      {test && (
        <section className="hub-card">
          <h3>🧾 &ldquo;Scan &amp; pay&rdquo; card for the counter</h3>
          <div className="hub-m small" style={{ marginBottom: 8 }}>
            A QR with no amount: the customer types it. Print it, stick it on the counter, or send the picture on WhatsApp.
          </div>
          <div className="upi-card">
            <b>{payeeShown}</b>
            <span className="sub">Scan &amp; pay · ಸ್ಕ್ಯಾನ್ ಮಾಡಿ ಪಾವತಿಸಿ</span>
            <QrCode value={staticLink} moduleSize={6} />
            <span className="id">{cleanVpa(test.vpa)}</span>
            <span className="apps">PhonePe · Google Pay · Paytm · BHIM · any UPI app</span>
          </div>
          <div className="set-row" style={{ flexWrap: "wrap", gap: 8 }}>
            <button className="hub-btn" onClick={() => window.print()}>🖨️ Print card</button>
            <button className="hub-btn" onClick={() => setRoll(true)}>🧾 Print on the bill printer</button>
            <ShareButton area=".upi-card" className="hub-btn" title="Scan and pay" url={false} label="📤 Share picture" />
          </div>
        </section>
      )}

      <section className="hub-card">
        <h3>Where the QR shows up</h3>
        <ul className="hub-m small" style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 4 }}>
          <li><b>Weigh &amp; Bill counter:</b> on UPI bills, with the exact amount filled in. Tap it to show it big to the customer. With more than one UPI ID, staff choose which.</li>
          <li><b>Printed bills:</b> on UPI and udhaar bills (counter, Quick Register udhaar sales, sales invoices).</li>
          <li><b>GST invoices:</b> a pay QR with the invoice total when the invoice is not paid in cash.</li>
          <li><b>Udhaar reminders</b> (Insights): the UPI ID and a pay link with the balance.</li>
        </ul>
      </section>

      {roll && <ReceiptSheet doc={doc} onClose={() => setRoll(false)} />}

      <style>{`
        .upi-card { display: flex; flex-direction: column; align-items: center; gap: 6px; width: 300px; max-width: 100%; margin: 0 auto 10px; padding: 18px 16px; background: #fff; color: #17202a; border: 2px solid #17202a; border-radius: 16px; text-align: center; }
        .upi-card b { font-size: 20px; }
        .upi-card .sub { font-size: 14px; font-weight: 600; }
        .upi-card .id { font-size: 15px; font-weight: 700; }
        .upi-card .apps { font-size: 11px; color: #555; }
        .upi-card svg { width: 220px; height: auto; }
        @media print {
          body * { visibility: hidden !important; }
          .upi-card, .upi-card * { visibility: visible !important; }
          .upi-card { position: absolute; left: 50%; top: 12mm; transform: translateX(-50%); width: 100mm; border-width: 2px; }
        }
      `}</style>
    </>
  );
}
