// How a bot reply is written for each chat app. Replies use **bold** and plain lines; Telegram
// wants HTML, Discord reads the markdown as it is, the in-app chat draws it itself.
// Pure, tested in lib/__tests__/botParse.test.ts.

export interface BotButton {
  label: string;
  /** "ok:<id>", "no:<id>", "undo:<id>", or "cmd:<text>" (runs that command) */
  data: string;
}
export interface BotFile {
  name: string;
  mime: string;
  base64: string;
}
export interface BotReply {
  text: string;
  buttons?: BotButton[];
  file?: BotFile;
}

export const rs = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;
export const kg = (n: number) => `${Math.round(n * 10) / 10} kg`;
export const pct = (p: number | null | undefined) => (p == null ? "" : `${p >= 0 ? "▲" : "▼"} ${Math.abs(Math.round(p))}%`);
/** "2026-11-01" → "01-11-2026" */
export const dmy = (d: string) => (/^\d{4}-\d{2}-\d{2}$/.test(d) ? `${d.slice(8, 10)}-${d.slice(5, 7)}-${d.slice(0, 4)}` : d);

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** **bold** → <b>bold</b>, everything else escaped (Telegram parse_mode HTML). */
export function toTelegramHtml(text: string): string {
  return esc(text).replace(/\*\*([^*\n]+)\*\*/g, "<b>$1</b>").slice(0, 4000);
}

/** Discord: markdown already; keep under its 2000-character limit. */
export function toDiscord(text: string): string {
  return text.length > 1950 ? `${text.slice(0, 1940).replace(/\n[^\n]*$/, "")}\n…` : text;
}

/** In-app chat: lines split into plain / bold pieces for React to draw. */
export function pieces(line: string): { b: boolean; t: string }[] {
  const out: { b: boolean; t: string }[] = [];
  const re = /\*\*([^*]+)\*\*/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line))) {
    if (m.index > last) out.push({ b: false, t: line.slice(last, m.index) });
    out.push({ b: true, t: m[1] });
    last = m.index + m[0].length;
  }
  if (last < line.length) out.push({ b: false, t: line.slice(last) });
  return out;
}

/** Telegram's inline keyboard: one row, or two per row when there are many. */
export function telegramKeyboard(buttons: BotButton[] | undefined) {
  // Telegram refuses the whole message if a button's data is over 64 bytes (long Kannada names)
  buttons = buttons?.filter((b) => new TextEncoder().encode(b.data).length <= 64);
  if (!buttons?.length) return undefined;
  const rows: { text: string; callback_data: string }[][] = [];
  const per = buttons.length > 3 ? 2 : buttons.length;
  for (let i = 0; i < buttons.length; i += per) rows.push(buttons.slice(i, i + per).map((b) => ({ text: b.label, callback_data: b.data })));
  return { inline_keyboard: rows };
}

/** Discord message components: up to 5 buttons in an action row. */
export function discordComponents(buttons: BotButton[] | undefined) {
  if (!buttons?.length) return [];
  return [
    {
      type: 1,
      components: buttons.slice(0, 5).map((b) => ({
        type: 2,
        style: b.data.startsWith("ok:") ? 3 : b.data.startsWith("no:") || b.data.startsWith("undo:") ? 4 : 2,
        label: b.label.slice(0, 80),
        custom_id: b.data.slice(0, 100),
      })),
    },
  ];
}
