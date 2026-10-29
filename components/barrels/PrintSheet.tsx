"use client";

// Printable weighment slip (per barrel) and lot weighment report.
// Every slip carries a Code 128 barcode (scanner guns) and a QR code (any phone camera).
import { SLIP_SIZES, pageCss, slipLayout, slipSize, type PaperSize } from "@/lib/printSizes";
import { PrintLinks, SizePicker, useSavedPrint } from "@/components/barrels/PrintKit";
import PrintCenter from "@/components/barrels/PrintCenter";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { barrelLink, registerRows, type RegisterRow, type ShapedReceipt } from "@/lib/barrels";
import Barcode from "@/components/barrels/Barcode";
import QrCode from "@/components/barrels/QrCode";
import { dmy, kg, kg1, pad, rs, whenFull, type Lot } from "@/components/barrels/shared";

const COMPANY = "MAHADEV TRADERS";

export default function PrintSheet() {
  const sp = useSearchParams();
  const slip = sp.get("slip");
  const slips = sp.get("slips");
  const only = sp.get("phase") === "GROSS" ? "GROSS" : sp.get("phase") === "EMPTY" ? "EMPTY" : null;
  const report = sp.get("report");
  const [size, setSizeState] = useState<PaperSize>(slipSize(sp.get("size")));
  const [saved, save] = useSavedPrint();
  const setSize = (x: PaperSize) => {
    setSizeState(x);
    save({ slip: x.id });
  };
  useEffect(() => {
    if (!sp.get("size") && saved.slip) setSizeState(slipSize(saved.slip));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saved.slip]);
  const lay = slipLayout(size);
  const vars = { "--sw": lay.inner, "--ss": lay.ss, "--sh": lay.innerH ?? 0 } as React.CSSProperties;
  const [rows, setRows] = useState<RegisterRow[] | null>(null);
  const [lot, setLot] = useState<Lot | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const printedAt = whenFull(new Date().toISOString());

  useEffect(() => {
    const go = async () => {
      try {
        if (slip) {
          const r = await fetch(`/api/barrels/register?code=${encodeURIComponent(slip)}`, { cache: "no-store" });
          const j = await r.json();
          if (!r.ok) throw new Error(j.error || "Could not load the barrel.");
          if (!j.data?.length) throw new Error("No barrel with this label.");
          setRows(j.data);
        } else if (slips || report) {
          const r = await fetch(`/api/barrels/${encodeURIComponent((slips || report) as string)}`, { cache: "no-store" });
          const j = await r.json();
          if (!r.ok) throw new Error(j.error || "Could not load the lot.");
          setLot(j.data);
          setRows(registerRows([j.data as ShapedReceipt], Date.now()));
        } else setErr("Nothing to print.");
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Could not load.");
      }
    };
    go();
  }, [slip, slips, report]);

  // Paper size for the print dialog.
  const isReport = !!report;
  useEffect(() => {
    const style = document.createElement("style");
    style.textContent = isReport ? "@page { size: A4; margin: 12mm }" : pageCss(size, "slip");
    document.head.appendChild(style);
    return () => style.remove();
  }, [size, isReport]);

  if (err) return <div className="bd-wrap"><div className="bd-err">{err}</div></div>;
  if (!rows) return <div className="bd-wrap"><div className="bd-m">Loading…</div></div>;

  return (
    <div className="bd-printpage">
      <div className="bd-noprint bd-labelbar">
        <b>{isReport ? "📄 Lot weighment report" : only === "GROSS" ? "🧾 Full-weight receipt" : only === "EMPTY" ? "🧾 Empty-weight receipt" : "🧾 Weighment slip"}</b>
        {!isReport && <SizePicker options={SLIP_SIZES} value={size} onPick={setSize} roll />}
        {isReport ? (
          <div className="bd-row">
            <button className="bd-btn primary" onClick={() => window.print()}>🖨️ Print</button>
          </div>
        ) : (
          <PrintCenter kind="slip" size={size} selector=".bd-slip" marginMm={lay.margin} count={1} label="Print slip" name="weighment-slip" saved={saved} onSave={save} />
        )}
        {!isReport && <PrintLinks kind="slip" />}
        <div className="bd-m small">
          {isReport ? "Print on A4. Keep with the supplier's challan." : "Print after the full weighing and again after the empty weighing — the second slip shows gross − tare = net."}
        </div>
      </div>

      {isReport && lot ? (
        <Report lot={lot} rows={rows} origin={origin} printedAt={printedAt} />
      ) : (
        <div className={`bd-slips ${size.cls}${size.cls === "gen" ? `${lay.short ? " short" : ""}${lay.fixed ? " fixed" : ""}` : ""}`} style={vars}>
          {rows.map((r) => (
            <Slip key={r.code} r={r} origin={origin} printedAt={printedAt} only={only} />
          ))}
        </div>
      )}
    </div>
  );
}

function Slip({ r, origin, printedAt, only }: { r: RegisterRow; origin: string; printedAt: string; only?: "GROSS" | "EMPTY" | null }) {
  const both = r.grossKg != null && r.emptyKg != null && !only;
  return (
    <div className="bd-slip">
      <div className="bd-sh">
        <b>{COMPANY}</b>
        <span>{only === "GROSS" ? "Full barrel weight receipt" : only === "EMPTY" ? "Empty barrel weight receipt" : "Barrel weighment slip"}</span>
      </div>
      <div className="bd-scodes">
        <Barcode value={r.code} moduleWidth={2} height={70} />
        <QrCode className="bd-sqr" value={barrelLink(origin, r.code)} moduleSize={3} />
      </div>
      <div className="bd-sbig">{r.code}</div>
      <table className="bd-sinfo">
        <tbody>
          <tr><td>Barrel</td><td>{pad(r.seq)} of {pad(r.barrelsInLot)}</td></tr>
          <tr><td>Lot / date</td><td>{r.lotNo} · {dmy(r.lotDate)}</td></tr>
          <tr><td>Supplier</td><td>{r.supplierName}</td></tr>
          <tr><td>Oil</td><td>{r.product}</td></tr>
          {r.vehicleNo && <tr><td>Vehicle</td><td>{r.vehicleNo}</td></tr>}
          {r.challanNo && <tr><td>Challan</td><td>{r.challanNo}</td></tr>}
          {r.tankTarget && <tr><td>Tank</td><td>{r.tankTarget}</td></tr>}
        </tbody>
      </table>
      <table className="bd-sw">
        <tbody>
          {only !== "EMPTY" && <tr>
            <td>
              <b>Gross</b>
              <small>oil + barrel</small>
            </td>
            <td className="n">{kg1(r.grossKg)} kg</td>
          </tr>}
          {only !== "EMPTY" && <tr className="sub">
            <td colSpan={2}>{r.grossAt ? `${whenFull(r.grossAt)} · ${r.grossSource === "MANUAL" ? "typed by hand" : r.grossScale || "scale"}${r.grossBy ? ` · ${r.grossBy}` : ""}` : "not yet weighed"}</td>
          </tr>}
          {only !== "GROSS" && <tr>
            <td>
              <b>Tare</b>
              <small>empty barrel</small>
            </td>
            <td className="n">{kg1(r.emptyKg)} kg</td>
          </tr>}
          {only !== "GROSS" && <tr className="sub">
            <td colSpan={2}>{r.emptyAt ? `${whenFull(r.emptyAt)} · ${r.emptySource === "MANUAL" ? "typed by hand" : r.emptyScale || "scale"}${r.emptyBy ? ` · ${r.emptyBy}` : ""}` : r.grossAt ? `pending — full for ${r.waitingDays ?? 0} day(s); scan again when emptied` : "pending"}</td>
          </tr>}
          {!only && <tr className="net">
            <td><b>NET OIL</b></td>
            <td className="n">{both ? `${kg1(r.netKg)} kg` : "—"}</td>
          </tr>}
        </tbody>
      </table>
      {both && <div className="bd-seq">{kg1(r.grossKg)} − {kg1(r.emptyKg)} = {kg1(r.netKg)} kg</div>}
      <div className="bd-sign">
        <span>Weighed by</span>
        <span>Checked by</span>
      </div>
      <div className="bd-sfoot">Printed {printedAt}</div>
    </div>
  );
}

function Report({ lot, rows, origin, printedAt }: { lot: Lot; rows: RegisterRow[]; origin: string; printedAt: string }) {
  const s = lot.summary;
  const showDeclared = rows.some((r) => r.declaredNetKg != null);
  const done = rows.filter((r) => r.state === "DONE");
  const sum = (f: (r: RegisterRow) => number | null) => Math.round(done.reduce((a, r) => a + (f(r) ?? 0), 0) * 100) / 100;
  return (
    <div className="bd-report">
      <div className="bd-rhead">
        <div>
          <div className="bd-rco">{COMPANY}</div>
          <h2>Barrel weighment report</h2>
          <table className="bd-sinfo">
            <tbody>
              <tr><td>Lot</td><td><b>{lot.lotNo}</b> · {dmy(lot.date)}</td></tr>
              <tr><td>Supplier</td><td>{lot.supplierName}</td></tr>
              <tr><td>Oil</td><td>{lot.product}</td></tr>
              {lot.vehicleNo && <tr><td>Vehicle</td><td>{lot.vehicleNo}</td></tr>}
              {lot.challanNo && <tr><td>Challan no.</td><td>{lot.challanNo}</td></tr>}
              {lot.tankTarget && <tr><td>Poured into</td><td>{lot.tankTarget}</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="bd-rqr">
          <QrCode value={`${origin}/barrels?lot=${encodeURIComponent(lot.lotNo)}`} moduleSize={3} />
          <Barcode value={lot.lotNo} moduleWidth={1.6} height={36} />
          <div className="tiny">{lot.lotNo}</div>
        </div>
      </div>

      <table className="bd-rtable">
        <thead>
          <tr>
            <th>#</th>
            <th>Barrel code</th>
            <th>Gross kg<small> oil + barrel</small></th>
            <th>Weighed (full)</th>
            <th>Tare kg<small> empty barrel</small></th>
            <th>Weighed (empty)</th>
            <th>Net oil kg</th>
            {showDeclared && <th>Challan kg</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.code}>
              <td>{pad(r.seq)}</td>
              <td>{r.code}</td>
              <td className="n">{kg1(r.grossKg)}{r.grossSource === "MANUAL" ? " ✋" : ""}</td>
              <td>{r.grossAt ? whenFull(r.grossAt) : ""}</td>
              <td className="n">{kg1(r.emptyKg)}{r.emptySource === "MANUAL" ? " ✋" : ""}</td>
              <td>{r.emptyAt ? whenFull(r.emptyAt) : r.state === "FULL" ? `waiting ${r.waitingDays ?? 0} day(s)` : ""}</td>
              <td className="n"><b>{r.state === "DONE" ? kg1(r.netKg) : "—"}</b></td>
              {showDeclared && <td className="n">{kg(r.declaredNetKg)}</td>}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={2}>Total ({done.length} of {rows.length} barrels emptied)</td>
            <td className="n">{kg1(sum((r) => r.grossKg))}</td>
            <td />
            <td className="n">{kg1(sum((r) => r.emptyKg))}</td>
            <td />
            <td className="n"><b>{kg1(sum((r) => r.netKg))}</b></td>
            {showDeclared && <td className="n">{kg1(rows.reduce((a, r) => a + (r.declaredNetKg ?? 0), 0))}</td>}
          </tr>
        </tfoot>
      </table>
      <div className="tiny">Gross, tare and net total only barrels that have both weights. ✋ = weight typed by hand (not from the scale).</div>

      {s.declaredNetKg != null && (
        <div className="bd-rsum">
          <div>Challan total: <b>{kg1(s.declaredNetKg)} kg</b></div>
          <div>Received (net): <b>{kg1(s.measuredNetKg)} kg</b>{s.done < s.barrels ? " — so far" : ""}</div>
          {s.diffKg != null && (
            <div>
              {s.diffKg < 0 ? "Short" : s.diffKg > 0 ? "Extra" : "Difference"}: <b>{s.diffKg > 0 ? "+" : ""}{kg1(s.diffKg)} kg</b>
              {s.shortValueInr != null ? ` (≈ ${rs(s.shortValueInr)})` : ""}
            </div>
          )}
        </div>
      )}
      {s.flags.length > 0 && (
        <ul className="bd-rflags">
          {s.flags.map((f, i) => (
            <li key={i}>{f.level === "alert" ? "ALERT" : "Note"}: {f.msg}</li>
          ))}
        </ul>
      )}
      <div className="bd-sign wide">
        <span>Weighed by</span>
        <span>Checked by</span>
        <span>Owner</span>
      </div>
      <div className="bd-sfoot">Printed {printedAt}</div>
    </div>
  );
}
