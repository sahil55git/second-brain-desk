"use client";

// "My icons": upload a picture file (PNG, JPG, WebP, SVG), give it a name, save. The browser shrinks it to a
// 128 px PNG first. Uploaded icons get an id like my_press and work everywhere a library icon does.
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import MillIcon from "@/components/icons/MillIcon";
import { cleanCustomIcon, customIconsSnapshot, loadCustomIcons, subscribeCustomIcons, type CustomIcon } from "@/lib/customIcons";

async function toPng128(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => no(new Error("That file is not a picture.")); i.src = url; });
    const w = img.naturalWidth || 128, h = img.naturalHeight || 128, s = 128 / Math.max(w, h);
    const c = document.createElement("canvas"); c.width = Math.max(1, Math.round(w * s)); c.height = Math.max(1, Math.round(h * s));
    const g = c.getContext("2d"); if (!g) throw new Error("Cannot read this picture.");
    g.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL("image/png");
  } finally { URL.revokeObjectURL(url); }
}

export default function IconUploader({ onChange }: { onChange?: () => void }) {
  const list = useSyncExternalStore(subscribeCustomIcons, customIconsSnapshot, customIconsSnapshot);
  const [name, setName] = useState("");
  const [kn, setKn] = useState("");
  const [data, setData] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  useEffect(() => { void loadCustomIcons(true); }, []);

  async function pick(f?: File | null) {
    setMsg("");
    if (!f) return;
    try { setData(await toPng128(f)); if (!name) setName(f.name.replace(/\.[a-z0-9]+$/i, "").replace(/[_-]+/g, " ").slice(0, 40)); }
    catch (e) { setData(""); setMsg((e as Error).message); }
  }
  async function save() {
    const c = cleanCustomIcon({ name, kn, dataUrl: data }, list.map((x) => x.id));
    if (!c.ok) return setMsg(c.error);
    setBusy(true);
    const r = await fetch("/api/custom-icons", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name, kn, dataUrl: data }) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return setMsg(j.error || "Could not save.");
    setName(""); setKn(""); setData(""); if (file.current) file.current.value = "";
    setMsg(`Saved as ${j.data.id}`); await loadCustomIcons(true); onChange?.();
  }
  async function del(i: CustomIcon) {
    if (!confirm(`Delete the icon “${i.name}”? Tiles using it will go blank.`)) return;
    const r = await fetch(`/api/custom-icons?id=${encodeURIComponent(i.id)}`, { method: "DELETE" });
    if (!r.ok) setMsg((await r.json().catch(() => ({}))).error || "Could not delete.");
    await loadCustomIcons(true); onChange?.();
  }

  return (
    <section className="hub-card" style={{ marginBottom: 14 }}>
      <h2 style={{ margin: "0 0 2px", fontSize: 18 }}>My icons · <span lang="kn">ನನ್ನ ಐಕಾನ್‌ಗಳು</span></h2>
      <div className="hub-m small" style={{ marginBottom: 10 }}>Add your own picture (PNG, JPG, WebP or SVG). Pick a file, give it a name, press Save. Then use it on a Quick-links tile (🎨 Tile look → Library icon) or by its id.</div>
      <div className="go-chips" style={{ alignItems: "center", marginBottom: 8 }}>
        <input ref={file} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" onChange={(e) => pick(e.target.files?.[0])} aria-label="Choose icon picture" />
        {data && <img src={data} alt="preview" width={52} height={52} style={{ objectFit: "contain", background: "#fff", borderRadius: 8, padding: 4 }} />}
      </div>
      <div className="go-chips" style={{ marginBottom: 8 }}>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name (English)" maxLength={40} style={{ flex: 1, minWidth: 140, padding: "8px 10px", fontSize: 15 }} aria-label="Icon name" />
        <input value={kn} onChange={(e) => setKn(e.target.value)} placeholder="ಹೆಸರು (optional)" maxLength={40} lang="kn" style={{ flex: 1, minWidth: 140, padding: "8px 10px", fontSize: 15 }} aria-label="Kannada name" />
        <button className="hub-btn" disabled={busy || !data || !name.trim()} onClick={save}>{busy ? "Saving…" : "💾 Save icon"}</button>
      </div>
      {msg && <div className="hub-m small" role="status" style={{ marginBottom: 8 }}>{msg}</div>}
      {list.length ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(130px,1fr))", gap: 10 }}>
          {list.map((i) => (
            <div key={i.id} className="hub-btn" style={{ flexDirection: "column", alignItems: "center", padding: 10, gap: 6, textAlign: "center" }}>
              <MillIcon id={i.id} size={52} />
              <b style={{ fontSize: 13 }}>{i.name}</b>
              {i.kn && <span lang="kn" style={{ fontSize: 12, opacity: 0.8 }}>{i.kn}</span>}
              <code style={{ fontSize: 11, opacity: 0.7 }}>{i.id}</code>
              <button type="button" className="hub-btn" onClick={() => del(i)} aria-label={`Delete ${i.name}`}>🗑️ Delete</button>
            </div>
          ))}
        </div>
      ) : <div className="hub-m small">No uploaded icons yet.</div>}
    </section>
  );
}
