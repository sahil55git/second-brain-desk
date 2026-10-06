"use client";

// Settings → Import / Export. One Excel workbook (Parties, Register items,
// Stock items) covers bulk import AND export, so an exported file can be
// edited and imported straight back. Every import shows a preview first.
import { useRef, useState } from "react";
import { CATALOG, DEFAULT_CONFIG, type RegisterConfigData, type RegisterKind } from "@/lib/register";
import { csvToTable } from "@/lib/stockTally";
import { csvBlob, download, excelBlob } from "@/lib/exporters";
import { SHEET_NAMES, detectKind, exportTables, templateTables, type ImportIssue, type ImportKind, type Table } from "@/lib/bulkImport";

interface Preview {
  type: ImportKind;
  table: Table;
  found: number;
  add: number;
  rated?: number;
  skipped: string[];
  skippedCount: number;
  issues: ImportIssue[];
  sample: string[];
  done?: boolean;
}

const LABEL: Record<ImportKind, string> = { parties: "👥 Names (customers & suppliers)", registerItems: "⭐ Register items & rates", stockItems: "📦 Stock items" };
const stamp = () => new Date().toISOString().slice(0, 10);

export default function ImportExportCard({ flash }: { flash: (m: string) => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [previews, setPreviews] = useState<Preview[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [pickKind, setPickKind] = useState<ImportKind>("parties");
  const fileRef = useRef<HTMLInputElement>(null);

  async function getJson(url: string) {
    const r = await fetch(url);
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
    return j.data;
  }

  async function template() {
    download("mahadev-import-template.xlsx", await excelBlob(templateTables()));
  }

  async function loadLists() {
    const [parties, items, cfg] = await Promise.all([getJson("/api/parties"), getJson("/api/items"), getJson("/api/register/config")]);
    const config: RegisterConfigData = cfg ?? DEFAULT_CONFIG;
    return exportTables({
      parties,
      items,
      config,
      builtinLabel: (kind: RegisterKind, key: string) => (CATALOG[kind] || []).find((c) => c.key === key)?.en || "",
    });
  }
  async function exportAll(fmt: "xlsx" | ImportKind) {
    setBusy("export");
    setErr(null);
    try {
      const tables = await loadLists();
      if (fmt === "xlsx") download(`mahadev-lists_${stamp()}.xlsx`, await excelBlob(tables));
      else download(`${SHEET_NAMES[fmt].toLowerCase().replace(/ /g, "-")}_${stamp()}.csv`, csvBlob(tables.find((t) => t.title === SHEET_NAMES[fmt])!));
      flash("Downloaded ✓");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Export failed");
    }
    setBusy(null);
  }

  async function call(type: ImportKind, table: Table, dryRun: boolean) {
    const r = await fetch("/api/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type, table, dryRun }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
    return j.data as Omit<Preview, "table">;
  }

  async function onFile(f: File) {
    setBusy("read");
    setErr(null);
    setPreviews([]);
    try {
      const found: { type: ImportKind; table: Table }[] = [];
      if (/\.(csv|txt)$/i.test(f.name)) {
        const table = csvToTable(await f.text());
        found.push({ type: detectKind("", table[0] || []) ?? pickKind, table });
      } else {
        const { default: readXlsxFile } = await import("read-excel-file/universal");
        const sheets = await readXlsxFile(f);
        for (const s of sheets) {
          const kind = detectKind(s.sheet, (s.data[0] as unknown[]) || []);
          if (kind && s.data.length > 1) found.push({ type: kind, table: s.data as Table });
        }
      }
      if (!found.length) throw new Error("No list with data found. Use the template: sheets named Parties, Register items, Stock items.");
      const out: Preview[] = [];
      for (const x of found) out.push({ ...(await call(x.type, x.table, true)), type: x.type, table: x.table });
      setPreviews(out);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not read the file");
    }
    setBusy(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function commit(p: Preview) {
    setBusy(p.type);
    setErr(null);
    try {
      const r = await call(p.type, p.table, false);
      setPreviews((cur) => cur.map((x) => (x.type === p.type ? { ...x, ...r, done: true } : x)));
      flash(`Imported ${r.add} ✓`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Import failed");
    }
    setBusy(null);
  }

  return (
    <section className="hub-card">
      <h3>Import &amp; export lists</h3>
      <div className="set-row">
        <span className="lab">
          1 · Get the Excel format
          <small>One workbook with 3 sheets — Parties, Register items, Stock items — plus instructions and example rows.</small>
        </span>
        <button className="hub-btn" onClick={template}>
          ⬇ Template (.xlsx)
        </button>
      </div>
      <div className="set-row" style={{ alignItems: "flex-start" }}>
        <span className="lab">
          2 · Upload your filled file
          <small>.xlsx (all sheets at once) or .csv (one list). You see a preview first — nothing is saved until you press Import. Names that already exist are skipped.</small>
        </span>
        <div style={{ display: "grid", gap: 6, justifyItems: "end" }}>
          <input ref={fileRef} type="file" accept=".xlsx,.csv,.txt" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} disabled={!!busy} />
          <label className="hub-m">
            CSV is for:{" "}
            <select value={pickKind} onChange={(e) => setPickKind(e.target.value as ImportKind)}>
              {(Object.keys(LABEL) as ImportKind[]).map((k) => (
                <option key={k} value={k}>
                  {LABEL[k]}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {err && <div className="hub-banner">{err}</div>}
      {busy === "read" && <div className="hub-m">Reading…</div>}

      {previews.map((p) => {
        const errors = p.issues.filter((i) => i.level === "error");
        const warns = p.issues.filter((i) => i.level === "warn");
        return (
          <div key={p.type} className="hub-card" style={{ margin: "8px 0", padding: 10 }}>
            <b>{LABEL[p.type]}</b>
            <div className="hub-m">
              {p.found} valid row{p.found === 1 ? "" : "s"} · <b>{p.add} new</b>
              {p.type === "registerItems" ? ` · ${p.rated ?? 0} rate${p.rated === 1 ? "" : "s"} saved` : ""} · {p.skippedCount} already there
              {errors.length ? ` · ${errors.length} row${errors.length === 1 ? "" : "s"} skipped` : ""}
            </div>
            {p.sample.length > 0 && <div className="hub-m">e.g. {p.sample.join(", ")}</div>}
            {[...errors, ...warns].slice(0, 8).map((i, n) => (
              <div key={n} className={`hub-m ${i.level === "error" ? "r" : ""}`}>
                {i.level === "error" ? "✖" : "⚠"} row {i.row}: {i.message}
              </div>
            ))}
            {p.issues.length > 8 && <div className="hub-m">…and {p.issues.length - 8} more</div>}
            <div style={{ marginTop: 6 }}>
              {p.done ? (
                <b className="g">✓ Imported {p.add}</b>
              ) : (
                <button className="hub-btn primary" disabled={!!busy || (p.add === 0 && !p.rated)} onClick={() => commit(p)}>
                  {busy === p.type ? "Importing…" : p.add || p.rated ? `Import ${p.add || p.rated}` : "Nothing new to import"}
                </button>
              )}
            </div>
          </div>
        );
      })}

      <div className="set-row">
        <span className="lab">
          Export current lists
          <small>Same format as the template, so you can edit and import it back. Also useful as a copy for Vyapar / Google Drive.</small>
        </span>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
          <button className="hub-btn primary" disabled={!!busy} onClick={() => exportAll("xlsx")}>
            ⬇ All lists (.xlsx)
          </button>
          {(Object.keys(LABEL) as ImportKind[]).map((k) => (
            <button key={k} className="hub-btn sm" disabled={!!busy} onClick={() => exportAll(k)}>
              ⬇ {SHEET_NAMES[k]} .csv
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
