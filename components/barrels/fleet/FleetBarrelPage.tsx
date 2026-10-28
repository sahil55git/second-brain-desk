"use client";

// One barrel's page: the screen the QR on its label opens (/barrels/fleet/BRL-07).
// Top: what is in it and where it is, in big letters. Middle: the buttons (weigh, send out, bring back)
// already pointed at this barrel. Bottom: its history and the label print link.
import { useCallback, useEffect, useState } from "react";
import { LOCATION_LABEL, findFleetCode, type Location } from "@/lib/barrelFleet";
import { api, kg, kg1, L, whenFull } from "@/components/barrels/shared";
import FleetWeigh from "@/components/barrels/fleet/FleetWeigh";
import { describe } from "@/components/barrels/fleet/FleetLedger";
import { STATUS_CHIP, type FBarrel, type FEvent } from "@/components/barrels/fleet/types";

export default function FleetBarrelPage({ code }: { code: string }) {
  const parsed = findFleetCode(code);
  const [barrel, setBarrel] = useState<FBarrel | null>(null);
  const [events, setEvents] = useState<FEvent[]>([]);
  const [parties, setParties] = useState<string[]>([]);
  const [isOwner, setIsOwner] = useState(false);
  const [err, setErr] = useState<string | null>(parsed ? null : "That is not one of our barrel labels.");
  const [showAll, setShowAll] = useState(false);

  const load = useCallback(async () => {
    if (!parsed) return;
    try {
      const [one, list] = await Promise.all([
        api<{ data: FBarrel; events: FEvent[]; isOwner: boolean }>(`/api/barrel-fleet/${encodeURIComponent(parsed.code)}`),
        api<{ parties: string[] }>("/api/barrel-fleet").catch(() => ({ parties: [] as string[] })),
      ]);
      setBarrel(one.data);
      setEvents(one.events);
      setIsOwner(one.isOwner);
      setParties(list.parties ?? []);
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not load.");
    }
  }, [parsed?.code]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    load();
    const t = setInterval(() => document.visibilityState === "visible" && load(), 20000);
    return () => clearInterval(t);
  }, [load]);

  const away = barrel && barrel.location !== "SHOP";
  const chip = barrel ? STATUS_CHIP[barrel.status] : null;
  const shown = showAll ? events : events.slice(0, 8);

  return (
    <div className="bd-wrap">
      <header className="bd-top bd-noprint">
        <div>
          <a href="/barrels/fleet" className="bd-m small">← <L en="All our barrels" kn="ಎಲ್ಲಾ ಬ್ಯಾರಲ್‌ಗಳು" /></a>
          <h1>🛢️ {parsed?.code ?? code}</h1>
        </div>
      </header>

      {err && <div className="bd-err">{err}</div>}
      {!barrel && !err && <div className="bd-m">Loading…</div>}

      {barrel && (
        <>
          <div className="bd-card">
            <div className="bd-row bd-gap">
              {chip && <span className={`bd-chip ${chip.cls}`}>{chip.en}</span>}
              {barrel.condition !== "OK" && <span className="bd-chip r">{barrel.condition.toLowerCase()}</span>}
              {barrel.mark && <span className="bd-m">{barrel.mark}</span>}
            </div>

            <div style={{ fontSize: 28, fontWeight: 800, margin: "8px 0 2px" }}>
              {barrel.status === "FULL" ? (
                <>
                  {kg(barrel.netKg)} kg <span style={{ fontWeight: 500 }}>{barrel.product ?? "oil"}</span>
                </>
              ) : barrel.status === "EMPTY" ? (
                <L en="Empty" kn="ಖಾಲಿ" />
              ) : (
                <L en="Not weighed yet" kn="ಇನ್ನೂ ತೂಕ ಮಾಡಿಲ್ಲ" />
              )}
            </div>
            {barrel.status === "FULL" && (
              <div className="bd-m">
                Full weight {kg1(barrel.grossKg)} kg − tare {kg1(barrel.tareKg)} kg · weighed {whenFull(barrel.grossAt)}
              </div>
            )}
            {barrel.status === "NEW" && <div className="bd-m">Weigh it empty once. That weight becomes its tare.</div>}

            <div style={{ fontSize: 20, fontWeight: 700, margin: "12px 0 2px" }}>
              {away ? (
                <>
                  📍 {LOCATION_LABEL[barrel.location as Location]?.en ?? barrel.location}
                  {barrel.holder ? ` · ${barrel.holder}` : ""}
                </>
              ) : (
                <>
                  📍 <L en="In the shop" kn="ಅಂಗಡಿಯಲ್ಲಿ" />
                </>
              )}
            </div>
            {away && barrel.awayDays != null && <div className="bd-m">Away {barrel.awayDays} day(s) · since {whenFull(barrel.sinceAt)}</div>}

            <div className="bd-m small" style={{ marginTop: 8 }}>
              Tare {barrel.tareKg != null ? `${kg1(barrel.tareKg)} kg` : "not set"} · capacity {kg(barrel.capacityKg)} kg
              {barrel.notes ? ` · ${barrel.notes}` : ""}
            </div>

            {barrel.flags.length > 0 && (
              <ul className="bd-flags" style={{ marginBottom: 0 }}>
                {barrel.flags.map((f) => (
                  <li key={f.code} className={f.level}>{f.msg}</li>
                ))}
              </ul>
            )}
          </div>

          <h3 style={{ margin: "14px 0 6px" }} className="bd-noprint">
            <L en="What do you want to do?" kn="ಏನು ಮಾಡಬೇಕು?" />
          </h3>
          <FleetWeigh barrels={[barrel]} parties={parties} isOwner={isOwner} presetCode={barrel.code} onSaved={load} />

          <div className="bd-card">
            <h3 style={{ marginTop: 0 }}>📒 <L en="History" kn="ಇತಿಹಾಸ" /></h3>
            {!events.length && <div className="bd-m">Nothing recorded yet.</div>}
            {shown.map((e) => (
              <div key={e.id} style={{ padding: "6px 0", borderTop: "1px solid var(--bd-line, #ddd3)" }}>
                <div className="bd-m small">{whenFull(e.at)} · {e.by}{e.source === "MANUAL" ? " · typed" : ""}</div>
                <div>{describe(e)}</div>
                {e.note && <div className="bd-m small">“{e.note}”</div>}
                {(e.action === "GROSS" || e.action === "EMPTY" || e.action === "MOVE") && (
                  <a className="bd-linkbtn" href={`/barrels/fleet/print?slip=${encodeURIComponent(e.id)}`} target="_blank" rel="noreferrer">print slip</a>
                )}
              </div>
            ))}
            {events.length > 8 && (
              <button className="bd-linkbtn" onClick={() => setShowAll(!showAll)}>{showAll ? "show fewer" : `show all ${events.length}`}</button>
            )}
            <div className="bd-row" style={{ marginTop: 8 }}>
              <a className="bd-btn" href={`/barrels/fleet/labels?codes=${encodeURIComponent(barrel.code)}`} target="_blank" rel="noreferrer">🏷️ Print this barrel&apos;s label</a>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
