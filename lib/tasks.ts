// Tasks and reminders said in the chat: "remind me friday to pay digwal", "remind me tomorrow
// 5 pm call ramesh", "task order tins", "todo 10/11 GST return". Pure. Tested in tasks.test.ts.
const DAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const SHORT: Record<string, number> = { sun: 0, mon: 1, tue: 2, tues: 2, wed: 3, thu: 4, thur: 4, thurs: 4, fri: 5, sat: 6 };
const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };
const pad = (n: number) => String(n).padStart(2, "0");
const add = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
const dow = (d: string) => new Date(`${d}T00:00:00Z`).getUTCDay();

export interface TaskIn { text: string; due: string | null; dueTime: string | null }

/** Pull the day and time out of the words; what is left is the task. */
export function parseTask(raw: string, today: string): TaskIn {
  let s = ` ${raw.trim().replace(/\s+/g, " ")} `;
  let due: string | null = null;
  let dueTime: string | null = null;
  const take = (re: RegExp, f: (m: RegExpExecArray) => void) => {
    const m = re.exec(s);
    if (m) { f(m); s = s.replace(m[0], " "); }
  };
  take(/\s(?:at\s)?(\d{1,2})(?::(\d{2}))?\s?(am|pm)\b/i, (m) => {
    let h = Number(m[1]) % 12;
    if (m[3].toLowerCase() === "pm") h += 12;
    dueTime = `${pad(h)}:${m[2] || "00"}`;
  });
  take(/\s(?:on\s)?(today|tonight|tomorrow|tmrw|day after tomorrow)\b/i, (m) => {
    const w = m[1].toLowerCase();
    due = w.startsWith("day after") ? add(today, 2) : w === "tomorrow" || w === "tmrw" ? add(today, 1) : today;
    if (w === "tonight" && !dueTime) dueTime = "20:00";
  });
  if (!due) take(/\s(?:on\s|this\s|next\s)?(sun|mon|tue|tues|wed|thu|thur|thurs|fri|sat)(?:day|nesday|sday|urday|rsday)?\b/i, (m) => {
    const want = SHORT[m[1].toLowerCase()];
    const next = /next\s/i.test(m[0]);
    let n = (want - dow(today) + 7) % 7 || 7;
    if (next && n < 7) n += 7;
    due = add(today, n);
  });
  if (!due) take(/\s(?:in\s)(\d+)\s(day|days|week|weeks)\b/i, (m) => { due = add(today, Number(m[1]) * (/week/i.test(m[2]) ? 7 : 1)); });
  if (!due) take(/\s(?:on\s)?(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?\b/, (m) => {
    const y = m[3] ? (m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])) : Number(today.slice(0, 4));
    let d = `${y}-${pad(Number(m[2]))}-${pad(Number(m[1]))}`;
    if (!m[3] && d < today) d = `${y + 1}${d.slice(4)}`;
    due = d;
  });
  if (!due) take(/\s(?:on\s)?(\d{1,2})(?:st|nd|rd|th)?\s(jan|feb|mar|apr|may|jun|jul|aug|sept?|oct|nov|dec)[a-z]*\b/i, (m) => {
    const y = Number(today.slice(0, 4));
    let d = `${y}-${pad(MONTHS[m[2].toLowerCase()])}-${pad(Number(m[1]))}`;
    if (d < today) d = `${y + 1}${d.slice(4)}`;
    due = d;
  });
  if (dueTime && !due) due = today;
  const text = s.replace(/^\s*(to|that|about|for)\s/i, " ").replace(/\s+/g, " ").trim().replace(/^(to|that)\s/i, "");
  return { text: text.charAt(0).toUpperCase() + text.slice(1), due, dueTime };
}

export function dueText(due: string | null, dueTime: string | null, today: string): string {
  if (!due) return "no date";
  const n = Math.round((Date.parse(`${due}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000);
  const day = n === 0 ? "today" : n === 1 ? "tomorrow" : n === -1 ? "yesterday" : n > 1 && n < 7 ? DAYS[dow(due)][0].toUpperCase() + DAYS[dow(due)].slice(1) : due.split("-").reverse().join("-");
  const t = dueTime ? ` ${Number(dueTime.slice(0, 2)) % 12 || 12}${dueTime.slice(2) === ":00" ? "" : dueTime.slice(2)} ${Number(dueTime.slice(0, 2)) >= 12 ? "pm" : "am"}` : "";
  return `${n < 0 ? "⚠️ overdue · " : ""}${day}${t}`;
}

/** "remind me …", "task …", "todo …" → the task words; null when it is not a task. */
export function taskWords(text: string): string | null {
  const m = /^(?:remind\s+me|reminder|task|todo|to\s?do|note\s+to\s+self)\b[:\s,]*(.*)$/i.exec(text.trim());
  return m ? m[1].trim() || null : null;
}
