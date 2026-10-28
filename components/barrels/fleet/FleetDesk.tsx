"use client";

// Barrel fleet desk (/barrels/fleet): the shop's OWN reusable barrels.
//
// Each barrel has one permanent code (BRL-07) and one registered tare. It is weighed empty once
// (that is the tare), then every time it is filled the net oil is  scale weight − tare.  Every
// trip (to a customer, a supplier, a vehicle, back to the shop) goes into one ledger, so at any
// moment the shop can say where each barrel is, what is in it, and who has it.
//
// Oil bought in a supplier's barrels is handled separately on /barrels (Barrel receiving).

import { useCallback, useEffect, useState } from "react";
import { findFleetCode } from "@/lib/barrelFleet";
import { api, L } from "@/components/barrels/shared";
import BarcodeScanner, { cameraScanSupported } from "@/components/barrels/BarcodeScanner";
import FleetBoard from "@/components/barrels/fleet/FleetBoard";
import FleetWeigh from "@/components/barrels/fleet/FleetWeigh";
import FleetLedger from "@/components/barrels/fleet/FleetLedger";
import FleetSetup from "@/components/barrels/fleet/FleetSetup";
import type { FleetList } from "@/components/barrels/fleet/types";

type Tab = "board" | "weigh" | "ledger" | "setup";

export default function FleetDesk() {
  const [list, setList] = useState<FleetList | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("board");
  const [preset] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const j = await api<FleetList>("/api/barrel-fleet");
      setList(j);
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not load.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(() => document.visibilityState === "visible" && load(), 20000);
    return () => clearInterval(t);
  }, [load]);

  // Old labels hold /barrels/fleet?barrel=BRL-07: send them to that barrel's own page.
  useEffect(() => {
    const b = findFleetCode(new URLSearchParams(window.location.search).get("barrel") || "");
    if (b) window.location.replace(`/barrels/fleet/${b.code}`);
  }, []);

  // A barrel tile, a scanned label, or a typed code opens that barrel's page.
  const openBarrel = (code: string) => {
    window.location.href = `/barrels/fleet/${encodeURIComponent(code)}`;
  };
  const [scan, setScan] = useState("");
  const [scanning, setScanning] = useState(false);
  const [scanErr, setScanErr] = useState<string | null>(null);
  const goScan = (raw: string) => {
    const f = findFleetCode(raw);
    if (!f) return setScanErr("That is not one of our barrel labels.");
    openBarrel(f.code);
  };

  return (
    <div className="bd-wrap">
      <header className="bd-top bd-noprint">
        <div>
          <a href="/barrels" className="bd-m small">
            ← Barrel receiving (supplier lots)
          </a>
          <h1>
            🛢️ <L en="Our barrels" kn="ನಮ್ಮ ಬ್ಯಾರಲ್‌ಗಳು" />
          </h1>
        </div>
      </header>

      <div className="bd-scanrow bd-noprint" style={{ marginBottom: 10 }}>
        <input
          className="bd-code"
          value={scan}
          autoFocus
          onChange={(e) => {
            setScanErr(null);
            setScan(e.target.value);
          }}
          onKeyDown={(e) => e.key === "Enter" && goScan(scan)}
          placeholder="Scan a barrel label with the gun, or type BRL-07 and press Enter…"
          autoCapitalize="characters"
          autoComplete="off"
          aria-label="Scan a barrel label"
        />
        <button className="bd-btn big" onClick={() => setScanning(true)} disabled={!cameraScanSupported()}>
          📷 <L en="Scan" kn="ಸ್ಕ್ಯಾನ್" />
        </button>
      </div>
      {scanErr && <div className="bd-err">{scanErr}</div>}
      {scanning && <BarcodeScanner title="Scan a barrel label" onCode={(c) => { setScanning(false); goScan(c); }} onClose={() => setScanning(false)} />}

      <div className="bd-steps bd-tabs bd-noprint" role="tablist">
        <button role="tab" aria-selected={tab === "board"} className={tab === "board" ? "on" : ""} onClick={() => { setTab("board"); load(); }}>
          📊 <L en="Board" kn="ಬೋರ್ಡ್" />
          <small>where is each barrel</small>
        </button>
        <button role="tab" aria-selected={tab === "weigh"} className={tab === "weigh" ? "on" : ""} onClick={() => setTab("weigh")}>
          ⚖️ <L en="Weigh / move" kn="ತೂಕ / ಸಾಗಣೆ" />
          <small>full, empty, send out</small>
        </button>
        <button role="tab" aria-selected={tab === "ledger"} className={tab === "ledger" ? "on" : ""} onClick={() => setTab("ledger")}>
          📒 <L en="Ledger" kn="ಲೆಡ್ಜರ್" />
          <small>every weighing and trip</small>
        </button>
        <button role="tab" aria-selected={tab === "setup"} className={tab === "setup" ? "on" : ""} onClick={() => setTab("setup")}>
          ⚙️ <L en="Barrels" kn="ಬ್ಯಾರಲ್" />
          <small>register, labels, condition</small>
        </button>
      </div>

      {err && <div className="bd-err">{err}</div>}

      {tab === "board" && <FleetBoard list={list} loading={loading} open={openBarrel} goSetup={() => setTab("setup")} />}
      {tab === "weigh" && <FleetWeigh barrels={list?.data ?? []} parties={list?.parties ?? []} isOwner={!!list?.isOwner} presetCode={preset} onSaved={load} />}
      {tab === "ledger" && <FleetLedger barrels={list?.data ?? []} presetCode={preset} />}
      {tab === "setup" && list && <FleetSetup isOwner={list.isOwner} defaults={list.defaults} onChanged={load} />}
    </div>
  );
}
