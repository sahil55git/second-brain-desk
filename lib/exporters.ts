// Download & share helpers for reports (browser only).
//  • Excel (.xlsx, real workbook, one sheet per table) — write-excel-file
//  • PDF (tables, totals, page numbers) — jsPDF + autotable. Standard PDF
//    fonts have no ₹ or Kannada letters, so PDFs use "Rs" and English names.
//  • CSV — plain text, opens anywhere
//  • Share — WhatsApp / Telegram / Email links, the phone's own share sheet
//    (can attach the PDF), and server-side Discord / Telegram bot / webhook.
import { toCsvRows } from "./bizReports";

export interface ExportCol {
  key: string;
  label: string;
  num?: boolean;
  money?: boolean;
  sum?: boolean; // add to the totals row
}
export interface ExportTable {
  title: string;
  cols: ExportCol[];
  rows: Record<string, unknown>[];
}

const plain = (v: unknown) => (v === null || v === undefined ? "" : typeof v === "boolean" ? (v ? "Yes" : "") : v);

export function totalsRow(t: ExportTable): Record<string, number> | null {
  const sums = t.cols.filter((c) => c.sum);
  if (!sums.length || !t.rows.length) return null;
  const out: Record<string, number> = {};
  for (const c of sums) out[c.key] = Math.round(t.rows.reduce((a, r) => a + (Number(r[c.key]) || 0), 0) * 100) / 100;
  return out;
}

export function download(name: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export function csvBlob(t: ExportTable): Blob {
  const rows = t.rows.map((r) => Object.fromEntries(t.cols.map((c) => [c.label, plain(r[c.key])])));
  const tot = totalsRow(t);
  if (tot) rows.push(Object.fromEntries(t.cols.map((c, i) => [c.label, i === 0 ? "TOTAL" : c.key in tot ? tot[c.key] : ""])));
  return new Blob(["\ufeff" + toCsvRows(rows)], { type: "text/csv;charset=utf-8" });
}

export async function excelBlob(tables: ExportTable[]): Promise<Blob> {
  const { default: writeExcelFile } = await import("write-excel-file/universal");
  const used = new Set<string>();
  const sheets = tables.map((t) => {
    let name = t.title.replace(/[\\/?*[\]:]/g, " ").slice(0, 28) || "Sheet";
    while (used.has(name)) name = name.slice(0, 26) + "_" + used.size;
    used.add(name);
    const head = t.cols.map((c) => ({ value: c.label, fontWeight: "bold" as const, backgroundColor: "#EEEEEE" }));
    const body = t.rows.map((r) =>
      t.cols.map((c) => {
        const v = r[c.key];
        if (c.num && v !== null && v !== undefined && v !== "" && Number.isFinite(Number(v)))
          return { value: Number(v), type: Number, format: c.money ? "#,##0.00" : "#,##0.##" };
        return { value: String(plain(v)) };
      })
    );
    const tot = totalsRow(t);
    const foot = tot
      ? [
          t.cols.map((c, i) =>
            i === 0
              ? { value: "TOTAL", fontWeight: "bold" as const }
              : c.key in tot
                ? { value: tot[c.key], type: Number, format: c.money ? "#,##0.00" : "#,##0.##", fontWeight: "bold" as const }
                : { value: "" }
          ),
        ]
      : [];
    return {
      data: [head, ...body, ...foot],
      sheet: name,
      columns: t.cols.map((c) => ({ width: c.num ? 14 : Math.min(40, Math.max(12, c.label.length + 4)) })),
      stickyRowsCount: 1,
    };
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return writeExcelFile(sheets as any).toBlob();
}

const pdfText = (v: unknown) =>
  String(plain(v))
    .replace(/₹/g, "Rs ")
    .replace(/[^\x20-\x7E]/g, "")
    .replace(/\s+/g, " ")
    .trim();

export async function pdfBlob(title: string, subtitle: string, tables: ExportTable[]): Promise<Blob> {
  const { jsPDF } = await import("jspdf");
  const { autoTable } = await import("jspdf-autotable");
  const doc = new jsPDF({ orientation: tables.some((t) => t.cols.length > 6) ? "landscape" : "portrait", unit: "pt", format: "a4" });
  doc.setFontSize(16);
  doc.text(pdfText(title), 40, 44);
  doc.setFontSize(10);
  doc.setTextColor(110);
  doc.text(pdfText(subtitle), 40, 60);
  doc.setTextColor(0);
  let y = 76;
  for (const t of tables) {
    const tot = totalsRow(t);
    const fmt = (c: ExportCol, v: unknown) =>
      c.num && v !== "" && v !== null && v !== undefined && Number.isFinite(Number(v))
        ? (c.money ? "Rs " : "") + Number(v).toLocaleString("en-IN", { maximumFractionDigits: 2 })
        : pdfText(v);
    // section title above the table
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text(pdfText(t.title) + (t.rows.length ? "" : " (none)"), 40, y + 8);
    doc.setFont("helvetica", "normal");
    autoTable(doc, {
      startY: y + 14,
      head: [t.cols.map((c) => pdfText(c.label))],
      body: t.rows.map((r) => t.cols.map((c) => fmt(c, r[c.key]))),
      foot: tot ? [t.cols.map((c, i) => (i === 0 ? "TOTAL" : c.key in tot ? fmt(c, tot[c.key]) : ""))] : undefined,
      showFoot: "lastPage",
      styles: { fontSize: 8, cellPadding: 3 },
      headStyles: { fillColor: [60, 60, 60] },
      footStyles: { fillColor: [235, 235, 235], textColor: 20, fontStyle: "bold" },
      columnStyles: Object.fromEntries(t.cols.map((c, i) => [i, c.num ? { halign: "right" as const } : {}])),
      didDrawPage: () => {
        doc.setFontSize(8);
        doc.setTextColor(120);
        const pageH = doc.internal.pageSize.getHeight();
        doc.text(`Second Brain Desk - ${pdfText(title)} - page ${doc.getNumberOfPages()}`, 40, pageH - 20);
        doc.setTextColor(0);
      },
    } as never);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    y = ((doc as any).lastAutoTable?.finalY || y + 40) + 24;
    if (y > doc.internal.pageSize.getHeight() - 80) {
      doc.addPage();
      y = 40;
    }
  }
  return doc.output("blob");
}

// ------------------------------- sharing ---------------------------------
export function shareLink(channel: "whatsapp" | "telegram" | "email", text: string, subject = "Mahadev Traders report"): string {
  const t = encodeURIComponent(text);
  if (channel === "whatsapp") return `https://wa.me/?text=${t}`;
  if (channel === "telegram") return `https://t.me/share/url?url=${encodeURIComponent(location.origin + "/reports")}&text=${t}`;
  return `mailto:?subject=${encodeURIComponent(subject)}&body=${t}`;
}

/** The phone's own share sheet (WhatsApp, Gmail, Drive…), with the PDF attached when supported. */
export async function nativeShare(text: string, file?: { blob: Blob; name: string }): Promise<"shared" | "unsupported" | "cancelled"> {
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (!nav.share) return "unsupported";
  try {
    const f = file ? new File([file.blob], file.name, { type: file.blob.type }) : null;
    if (f && nav.canShare?.({ files: [f] })) await nav.share({ text, files: [f] });
    else await nav.share({ text });
    return "shared";
  } catch {
    return "cancelled";
  }
}

export async function blobToBase64(b: Blob): Promise<string> {
  const buf = new Uint8Array(await b.arrayBuffer());
  let s = "";
  for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode.apply(null, Array.from(buf.subarray(i, i + 0x8000)));
  return btoa(s);
}
