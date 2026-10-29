"use client";

// Label & receipt designer: the list of saved layouts, and the editor for the one being worked on.
// Everyone can look; only the owner can save. A saved layout is shared by every device; the one marked
// ★ default is what the print pages use unless a device picks another.
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  canRedo, canUndo, cleanName, histNew, histPush, histRedo, histUndo, sampleData, starterFor, type History, type TemplateDoc, type TemplateKind, type TemplateRow,
} from "@/lib/labelTemplate";
import { api } from "@/components/barrels/shared";
import type { FleetList } from "@/components/barrels/fleet/types";
import LabelEditor from "@/components/barrels/designer/LabelEditor";
import SlipEditor from "@/components/barrels/designer/SlipEditor";
import { STANDARD, useLayoutChoice, useTemplates } from "@/components/barrels/designer/useTemplates";
import { labelData } from "@/components/barrels/designer/data";
import DesignGallery from "@/components/barrels/designer/DesignGallery";

interface Cur {
  id: string | null;
  name: string;
  savedName: string;
  savedJson: string;
}

export default function DesignerApp() {
  const sp = useSearchParams();
  const [kind, setKind] = useState<TemplateKind>(sp.get("kind") === "slip" ? "slip" : "label");
  const { rows, error, reload } = useTemplates(kind);
  const { choiceId, choose } = useLayoutChoice(kind, rows);
  const [fleet, setFleet] = useState<FleetList | null>(null);
  const [cur, setCur] = useState<Cur | null>(null);
  const [hist, setHist] = useState<History<TemplateDoc> | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  /** the designs window: for a new layout, or to replace what is open */
  const [gallery, setGallery] = useState<"new" | "replace" | null>(null);
  const [barrelCode, setBarrelCode] = useState("");

  useEffect(() => {
    api<FleetList>("/api/barrel-fleet").then(setFleet).catch(() => {});
  }, []);
  const isOwner = fleet?.isOwner === true;
  const barrels = useMemo(() => (fleet?.data ?? []).filter((b) => b.condition !== "RETIRED"), [fleet]);
  const origin = typeof window !== "undefined" ? window.location.origin : "";

  const doc = hist?.present ?? null;
  const dirty = !!(cur && doc && (JSON.stringify(doc) !== cur.savedJson || cur.name !== cur.savedName));

  const data = useMemo(() => {
    if (kind === "label") {
      const b = barrels.find((x) => x.code === barrelCode);
      return b ? labelData(b, origin) : sampleData("label");
    }
    return sampleData("slip");
  }, [kind, barrels, barrelCode, origin]);

  const open = useCallback((r: TemplateRow) => {
    setCur({ id: r.id, name: r.name, savedName: r.name, savedJson: JSON.stringify(r.doc) });
    setHist(histNew(r.doc));
    setMsg(null);
    setConfirmDel(false);
  }, []);

  // first visit: open the default layout, else the first one
  useEffect(() => {
    if (!rows || cur) return;
    const first = rows.find((r) => r.isDefault) ?? rows[0];
    if (first) open(first);
  }, [rows, cur, open]);

  // warn before leaving with unsaved changes
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  const leaveOk = () => !dirty || window.confirm("You have changes that are not saved. Leave them behind?");

  const switchKind = (k: TemplateKind) => {
    if (k === kind || !leaveOk()) return;
    setKind(k);
    setCur(null);
    setHist(null);
    setMsg(null);
    setGallery(null);
  };

  const pick = (r: TemplateRow) => {
    if (cur?.id === r.id || !leaveOk()) return;
    open(r);
  };

  const createFrom = (d: TemplateDoc, name: string) => {
    if (!leaveOk()) return;
    setCur({ id: null, name: name.slice(0, 60), savedName: "", savedJson: "" });
    setHist(histNew(d));
    setGallery(null);
    setMsg({ ok: true, t: "New layout, not saved yet: change anything, then press Save." });
  };
  const replaceWith = (d: TemplateDoc) => {
    if (!doc) return;
    change({ ...d, ...(doc.fields?.length ? { fields: doc.fields } : {}) } as TemplateDoc);
    setGallery(null);
    setMsg({ ok: true, t: "Design applied. ↶ Undo brings the old one back." });
  };

  const change = (next: TemplateDoc, key?: string | null) => setHist((h) => (h ? histPush(h, next, key ?? null) : h));

  const save = async () => {
    if (!cur || !doc || !isOwner) return;
    const name = cleanName(cur.name);
    if (!name) return setMsg({ ok: false, t: "Give the layout a name first." });
    setBusy(true);
    setMsg(null);
    try {
      let id = cur.id;
      if (id) {
        await api(`/api/label-templates/${encodeURIComponent(id)}`, { method: "PATCH", json: { name, doc } });
      } else {
        const j = await api<{ data: { id: string } }>("/api/label-templates", { method: "POST", json: { name, kind, doc, makeDefault: !rows?.length } });
        id = j.data.id;
      }
      setCur({ id, name, savedName: name, savedJson: JSON.stringify(doc) });
      await reload();
      setMsg({ ok: true, t: "Saved. Every device now sees this layout." });
    } catch (e) {
      setMsg({ ok: false, t: e instanceof Error ? e.message : "Could not save." });
    } finally {
      setBusy(false);
    }
  };

  const saveCopy = () => {
    if (!cur || !doc) return;
    setCur({ id: null, name: `${cleanName(cur.name)} copy`.slice(0, 60), savedName: "", savedJson: "" });
    setMsg({ ok: true, t: "This is a copy that is not saved yet. Change the name and press Save." });
  };

  const makeDefault = async () => {
    if (!cur?.id) return;
    setBusy(true);
    try {
      await api(`/api/label-templates/${encodeURIComponent(cur.id)}`, { method: "PATCH", json: { isDefault: true } });
      await reload();
      setMsg({ ok: true, t: "This is now the shop's default layout." });
    } catch (e) {
      setMsg({ ok: false, t: e instanceof Error ? e.message : "Could not change the default." });
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!cur?.id) return;
    setBusy(true);
    try {
      await api(`/api/label-templates/${encodeURIComponent(cur.id)}`, { method: "DELETE" });
      setCur(null);
      setHist(null);
      setConfirmDel(false);
      await reload();
      setMsg({ ok: true, t: "Deleted." });
    } catch (e) {
      setMsg({ ok: false, t: e instanceof Error ? e.message : "Could not delete." });
    } finally {
      setBusy(false);
    }
  };

  const resetStandard = () => {
    if (!doc) return;
    if (doc.kind === "label") change(starterFor("label", doc.widthMm, doc.heightMm));
    else change(starterFor("slip", doc.widthMm, null));
  };

  const row = rows?.find((r) => r.id === cur?.id) ?? null;
  const testBarrel = barrelCode || barrels[0]?.code || "";

  return (
    <div className="bd-wrap dz-page">
      <div className="bd-row bd-gap">
        <a href="/barrels/fleet" className="bd-m small">← Our barrels</a>
      </div>
      <h1>🎨 Label &amp; receipt designer</h1>
      <p className="bd-m">Design how the barrel labels and weighing slips look: text, fonts (English, ಕನ್ನಡ, हिन्दी), barcode, QR code and your logo. Save a layout and every phone, tablet and PC can print with it.</p>

      <div className="dz-tabs" role="tablist">
        <button role="tab" aria-selected={kind === "label"} className={kind === "label" ? "on" : ""} onClick={() => switchKind("label")}>🏷️ Barrel labels<small>stickers: place things anywhere</small></button>
        <button role="tab" aria-selected={kind === "slip"} className={kind === "slip" ? "on" : ""} onClick={() => switchKind("slip")}>🧾 Slips &amp; receipts<small>rolls: blocks, top to bottom</small></button>
      </div>

      {fleet && !isOwner && <div className="bd-m dz-note">Only the owner can change layouts. You can look at them and choose which one this device prints with.</div>}
      {error && <div className="bd-err">{error}</div>}

      <div className="dz-layout">
        <aside className="dz-list" aria-label="Saved layouts">
          <h3>Saved layouts</h3>
          {rows === null && <div className="bd-m">Loading…</div>}
          {rows && !rows.length && !error && <div className="bd-m small">No saved layouts yet. Prints use the built-in standard layout until you save one.</div>}
          <ul>
            {rows?.map((r) => (
              <li key={r.id}>
                <button type="button" className={`dz-card${cur?.id === r.id ? " on" : ""}`} onClick={() => pick(r)}>
                  <b>{r.name}</b>
                  <span>
                    {r.kind === "label" ? `${r.widthMm} × ${r.heightMm} mm` : `${r.widthMm} mm roll`}
                    {r.isDefault && <em className="bd-chip g">★ shop default</em>}
                    {choiceId === r.id && <em className="bd-chip b">this device</em>}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {choiceId === STANDARD && rows && rows.length > 0 && <div className="bd-m small">This device prints with the built-in standard layout.</div>}
          <button type="button" className="bd-btn" onClick={() => choose(STANDARD)} disabled={choiceId === STANDARD}>Use the built-in standard on this device</button>

          {isOwner && (
            <>
              <button type="button" className="bd-btn primary" onClick={() => setGallery("new")}>＋ New layout</button>
              <p className="bd-m small">Start from a ready design, the auto design maker, or a blank {kind === "label" ? "label" : "receipt"} of any size.</p>
            </>
          )}
        </aside>

        <section className="dz-work">
          {!cur && rows && <div className="bd-card bd-empty">{rows.length ? "Choose a layout on the left." : isOwner ? "Press “New layout” to pick a ready design, make one with Auto design, or start blank." : "No layouts have been saved yet."}</div>}
          {cur && doc && hist && (
            <>
              <div className="dz-head bd-card">
                <label className="dz-name">Name
                  <input value={cur.name} maxLength={60} disabled={!isOwner} onChange={(e) => setCur({ ...cur, name: e.target.value })} />
                </label>
                <div className="bd-row">
                  {isOwner && <button type="button" className="bd-btn primary" onClick={save} disabled={busy || !dirty}>{busy ? "Saving…" : cur.id ? "💾 Save" : "💾 Save new layout"}</button>}
                  {isOwner && cur.id && <button type="button" className="bd-btn" onClick={saveCopy}>⧉ Save as a copy</button>}
                  {isOwner && cur.id && !row?.isDefault && <button type="button" className="bd-btn" onClick={makeDefault} disabled={busy || dirty}>★ Make shop default</button>}
                  {cur.id && choiceId !== cur.id && <button type="button" className="bd-btn" onClick={() => choose(cur.id as string)} disabled={dirty}>Use on this device</button>}
                  {cur.id && kind === "label" && testBarrel && <a className="bd-btn" href={`/barrels/fleet/labels?codes=${encodeURIComponent(testBarrel)}&layout=${encodeURIComponent(cur.id)}`} target="_blank" rel="noreferrer">🖨️ Print a test label</a>}
                  {isOwner && cur.id && (confirmDel ? (
                    <>
                      <button type="button" className="bd-btn" style={{ color: "var(--bd-r)" }} onClick={remove} disabled={busy}>Yes, delete it</button>
                      <button type="button" className="bd-btn" onClick={() => setConfirmDel(false)}>Keep it</button>
                    </>
                  ) : (
                    <button type="button" className="bd-btn" onClick={() => setConfirmDel(true)}>🗑 Delete</button>
                  ))}
                </div>
                {dirty && <div className="bd-m small">● Changes not saved yet.</div>}
                {msg && <div className={msg.ok ? "bd-ok" : "bd-err"}>{msg.t}</div>}
                {kind === "label" && (
                  <label className="dz-inl">Preview with
                    <select value={barrelCode} onChange={(e) => setBarrelCode(e.target.value)}>
                      <option value="">Sample data</option>
                      {barrels.map((b) => <option key={b.code} value={b.code}>{b.code}{b.mark ? ` · ${b.mark}` : ""}</option>)}
                    </select>
                  </label>
                )}
              </div>

              {doc.kind === "label" ? (
                <LabelEditor doc={doc} data={data} readOnly={!isOwner} onDesigns={isOwner ? () => setGallery("replace") : undefined} onChange={change} onUndo={() => setHist((h) => (h ? histUndo(h) : h))} onRedo={() => setHist((h) => (h ? histRedo(h) : h))} canUndo={canUndo(hist)} canRedo={canRedo(hist)} onResetStandard={resetStandard} />
              ) : (
                <SlipEditor doc={doc} data={data} readOnly={!isOwner} onDesigns={isOwner ? () => setGallery("replace") : undefined} onChange={change} onUndo={() => setHist((h) => (h ? histUndo(h) : h))} onRedo={() => setHist((h) => (h ? histRedo(h) : h))} canUndo={canUndo(hist)} canRedo={canRedo(hist)} onResetStandard={resetStandard} />
              )}
            </>
          )}
        </section>
      </div>
      {gallery && (
        <DesignGallery
          kind={kind}
          data={data}
          mode={gallery}
          start={gallery === "replace" && doc ? (doc.kind === "label" ? { w: doc.widthMm, h: doc.heightMm } : { w: doc.widthMm, h: null }) : kind === "label" ? { w: 50, h: 75 } : { w: 80, h: null }}
          onPick={(d, name) => (gallery === "new" ? createFrom(d, name) : replaceWith(d))}
          onClose={() => setGallery(null)}
        />
      )}
    </div>
  );
}
