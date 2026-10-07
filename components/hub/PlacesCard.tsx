"use client";

// Settings → add the Bidar-area villages / localities as customer accounts, so
// job-work, payments and the ledger can be tracked by place name.
import { useEffect, useState } from "react";
import { PLACE_GROUPS, PLACES, type PlaceGroup } from "@/lib/bidarPlaces";

const GROUPS: PlaceGroup[] = ["village", "city", "town"];
interface Counts { fresh: Record<PlaceGroup, number>; all: Record<PlaceGroup, number> }

export default function PlacesCard({ flash }: { flash: (m: string) => void }) {
  const [counts, setCounts] = useState<Counts | null>(null);
  const [pick, setPick] = useState<Record<PlaceGroup, boolean>>({ village: true, city: true, town: true });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    try {
      const r = await fetch("/api/parties/places");
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
      setCounts(j.data);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not load");
    }
  }
  useEffect(() => { load(); }, []);

  const chosen = GROUPS.filter((g) => pick[g]);
  const toAdd = counts ? chosen.reduce((a, g) => a + counts.fresh[g], 0) : 0;

  async function add() {
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch("/api/parties/places", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ groups: chosen }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
      flash(`✓ ${j.data.added} place${j.data.added === 1 ? "" : "s"} added as customers${j.data.skipped ? ` · ${j.data.skipped} already there` : ""}`);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not add");
    }
    setBusy(false);
  }

  return (
    <section className="hub-card" style={{ marginTop: 12 }}>
      <div className="hub-card-head">
        <h3>📍 Bidar-area villages & localities (PIN 585401)</h3>
      </div>
      <p className="hub-m" style={{ marginTop: 0 }}>
        Add place names as customer accounts — so a farmer from Kamthana or Chitta is just <b>“Kamthana”</b> in job-work, payments and the ledger. Names already in your Parties list are skipped.
      </p>
      {err && <div className="hub-banner">{err}</div>}
      <div style={{ display: "grid", gap: 6 }}>
        {GROUPS.map((g) => (
          <label key={g} style={{ display: "flex", gap: 8, alignItems: "flex-start", cursor: "pointer" }}>
            <input type="checkbox" checked={pick[g]} onChange={(e) => setPick({ ...pick, [g]: e.target.checked })} style={{ marginTop: 4 }} />
            <span>
              <b>{PLACE_GROUPS[g].title}</b> — {counts ? `${counts.fresh[g]} new of ${counts.all[g]}` : `${PLACES.filter((p) => p.group === g).length}`}
              <span className="hub-m" style={{ display: "block" }}>
                {PLACE_GROUPS[g].note} · e.g. {PLACES.filter((p) => p.group === g).slice(0, 5).map((p) => p.name).join(", ")}…
              </span>
            </span>
          </label>
        ))}
      </div>
      <div style={{ marginTop: 10, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <button className="hub-btn" style={{ background: "var(--h-acc)", color: "#fff" }} disabled={busy || !counts || toAdd === 0} onClick={add}>
          {busy ? "Adding…" : `＋ Add ${toAdd} place${toAdd === 1 ? "" : "s"} as customers`}
        </button>
        {counts && toAdd === 0 && <span className="hub-m">Nothing new to add — all selected places already exist.</span>}
      </div>
      <p className="hub-m" style={{ marginBottom: 0 }}>Spellings follow census / India Post records. Rename any place in the Parties desk if your local spelling differs.</p>
    </section>
  );
}
