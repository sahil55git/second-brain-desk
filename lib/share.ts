// Sharing a report, a list or a card: as text (WhatsApp, Telegram, SMS, email, Gmail, copy), as a
// picture or an Excel (CSV) file through the phone's own share sheet (which also offers Bluetooth,
// Nearby Share, Drive...). Pure helpers here, tested in lib/__tests__/share.test.ts; the button is
// components/share/ShareButton.tsx.

export type ShareTarget = "whatsapp" | "telegram" | "sms" | "email" | "gmail";

/** Links that open each app with the text filled in. */
export function shareLink(target: ShareTarget, text: string, subject = ""): string {
  const t = encodeURIComponent(text);
  switch (target) {
    case "whatsapp":
      return `https://wa.me/?text=${t}`;
    case "telegram": {
      // Telegram wants a url; the first link in the text (or the text itself) goes there
      const m = /https?:\/\/\S+/.exec(text);
      const rest = m ? text.replace(m[0], "").trim() : text;
      return `https://t.me/share/url?url=${encodeURIComponent(m ? m[0] : "")}&text=${encodeURIComponent(rest)}`;
    }
    case "sms":
      return `sms:?&body=${t}`;
    case "email":
      return `mailto:?subject=${encodeURIComponent(subject)}&body=${t}`;
    case "gmail":
      return `https://mail.google.com/mail/?view=cm&fs=1&su=${encodeURIComponent(subject)}&body=${t}`;
  }
}

const clean = (s: string) => s.replace(/[ \t ]+/g, " ").replace(/ *\n */g, "\n").trim();

/** A table as text lines: "Head1 | Head2" then one line per row. Empty rows are dropped. */
export function tableText(rows: string[][]): string {
  return rows
    .map((r) => r.map((c) => clean(c).replace(/\n+/g, " ")).filter((c) => c !== ""))
    .filter((r) => r.length)
    .map((r) => r.join(" | "))
    .join("\n");
}

/** A table as CSV that Excel opens (UTF-8 with BOM so ₹ and Kannada show right). */
export function tableCsv(rows: string[][]): string {
  const q = (v: string) => {
    const s = clean(v).replace(/\n+/g, " ");
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return "﻿" + rows.map((r) => r.map(q).join(",")).join("\r\n");
}

/** WhatsApp and SMS have length limits: keep the message short and say it was cut. */
export function fitMessage(text: string, max = 3500): string {
  const t = clean(text).replace(/\n{3,}/g, "\n\n");
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const nl = cut.lastIndexOf("\n");
  return `${(nl > max * 0.6 ? cut.slice(0, nl) : cut).trimEnd()}\n… (more in the app)`;
}

/** The message: a title line, the content, and the link back to the app. */
export function shareMessage(title: string, body: string, url?: string, max = 3500): string {
  const head = title ? `*${title.trim()}*\n` : "";
  const tail = url ? `\n\n${url}` : "";
  return fitMessage(head + body, Math.max(200, max - tail.length)) + tail;
}

/** File name for a shared file: "Sales list 31-10-2026.csv" → "Sales-list-31-10-2026.csv". */
export function shareFileName(title: string, ext: "csv" | "png"): string {
  const base = title.replace(/[^A-Za-z0-9ಀ-೿ _-]+/g, " ").trim().replace(/\s+/g, "-").slice(0, 60) || "report";
  return `${base}.${ext}`;
}
