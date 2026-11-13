// Saving without internet, for the Job-work desk, Manufacturing and barrel weighing (typed
// weights). An entry that cannot reach the server is kept on this phone / computer and sent
// when the internet is back, in the order it was made.
//
//   • Each entry carries a clientId. The server remembers it (lib/clientOp.ts), so an entry
//     that was sent but whose answer got lost is never saved a second time.
//   • The queue is only emptied by a clear answer: saved (2xx) or refused for good (the server
//     said the entry itself is wrong). A server problem or a lost login keeps it waiting.
//   • A refused entry is never thrown away silently: it moves to a "refused" list with the
//     server's reason, for a person to read and enter again.
//
// The Quick Register has its own, older queue (components/register/forms/shared.tsx).

export type OutDesk = "jobwork" | "mfg" | "barrels";
export interface OutItem {
  id: string;
  desk: OutDesk;
  /** what the person will recognise: "Intake: Ramesh, 120 kg" */
  label: string;
  url: string;
  method: "POST" | "PUT" | "PATCH";
  body: string;
  at: number;
}
export interface OutRefused {
  id: string;
  desk: OutDesk;
  label: string;
  error: string;
  at: number;
}
export const OUT_KEY = "outbox-v1";
export const REFUSED_KEY = "outbox-refused-v1";
export const OUT_MAX = 200;
export const OUT_EVENT = "outbox-change";

export type Verdict = "sent" | "refused" | "wait";
/**
 * What an answer means for a queued entry.
 *   2xx → sent.  400 / 403 / 404 / 409 / 410 / 422 → refused: the entry is wrong and will never go through.
 *   Everything else waits: no network, server down (5xx), busy (429), or signed out (401: sign in, then it goes).
 */
export function verdict(status: number | "network"): Verdict {
  if (status === "network") return "wait";
  if (status >= 200 && status < 300) return "sent";
  if ([400, 403, 404, 409, 410, 422].includes(status)) return "refused";
  return "wait";
}

export function newClientId(now = Date.now(), rand = Math.random()): string {
  return `c${now.toString(36)}${Math.floor(rand * 36 ** 8).toString(36).padStart(8, "0")}`;
}
/** Adds a clientId to a JSON body (keeps one that is already there). */
export function withClientId(json: Record<string, unknown>, id = newClientId()): { id: string; body: string } {
  const have = typeof json.clientId === "string" && /^c[a-z0-9]{6,30}$/.test(json.clientId) ? json.clientId : id;
  return { id: have, body: JSON.stringify({ ...json, clientId: have }) };
}
/** Queue after adding one entry; never grows past OUT_MAX (the caller is told when it is full). */
export function enqueue(q: OutItem[], item: OutItem): { queue: OutItem[]; full: boolean } {
  if (q.some((x) => x.id === item.id)) return { queue: q, full: false };
  if (q.length >= OUT_MAX) return { queue: q, full: true };
  return { queue: [...q, item], full: false };
}

// ---------------------------------------------------------------- browser side
const read = <T,>(key: string): T[] => {
  try {
    const v = JSON.parse(window.localStorage.getItem(key) || "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
};
const write = (key: string, v: unknown[]) => {
  try {
    window.localStorage.setItem(key, JSON.stringify(v));
  } catch {
    /* storage full: handled by the caller through `full` */
  }
  window.dispatchEvent(new CustomEvent(OUT_EVENT));
};
export const outbox = (): OutItem[] => (typeof window === "undefined" ? [] : read<OutItem>(OUT_KEY));
export const outboxRefused = (): OutRefused[] => (typeof window === "undefined" ? [] : read<OutRefused>(REFUSED_KEY));
export const dismissRefused = (id: string) => write(REFUSED_KEY, outboxRefused().filter((r) => r.id !== id));

export type SendResult<T> = { queued: false; data: T } | { queued: true };

/**
 * Save now, or keep for later when there is no internet. Throws (with the server's own words)
 * when the server refuses the entry, exactly like a normal save.
 */
export async function outboxSend<T = unknown>(o: { desk: OutDesk; label: string; url: string; method?: OutItem["method"]; json: Record<string, unknown> }): Promise<SendResult<T>> {
  const method = o.method || "POST";
  const { id, body } = withClientId(o.json);
  const keep = (): SendResult<T> => {
    const r = enqueue(outbox(), { id, desk: o.desk, label: o.label, url: o.url, method, body, at: Date.now() });
    if (r.full) throw new Error(`${OUT_MAX} entries are already waiting for the internet. Connect before entering more.`);
    write(OUT_KEY, r.queue);
    return { queued: true };
  };
  // earlier entries first, so things arrive in the order they were made
  if (outbox().length) {
    await flushOutbox();
    if (outbox().length) return keep();
  }
  if (typeof navigator !== "undefined" && !navigator.onLine) return keep();
  let res: Response;
  try {
    res = await fetch(o.url, { method, headers: { "Content-Type": "application/json" }, body, cache: "no-store" });
  } catch {
    return keep();
  }
  const j = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (verdict(res.status) === "wait" && res.status !== 401) return keep(); // server trouble: keep it safe on the device
    throw new Error(j.error || `Could not save (${res.status}).`);
  }
  return { queued: false, data: j as T };
}

let flushing = false;
/** Sends what is waiting, oldest first. Stops at the first entry that cannot go yet. Returns how many were saved. */
export async function flushOutbox(): Promise<number> {
  if (flushing || typeof window === "undefined" || (typeof navigator !== "undefined" && !navigator.onLine)) return 0;
  flushing = true;
  let sent = 0;
  try {
    for (;;) {
      const q = outbox();
      const it = q[0];
      if (!it) break;
      let status: number | "network";
      let error = "";
      try {
        const res = await fetch(it.url, { method: it.method, headers: { "Content-Type": "application/json" }, body: it.body, cache: "no-store" });
        status = res.status;
        if (!res.ok) error = (await res.json().catch(() => ({}))).error || `Refused (${res.status}).`;
      } catch {
        status = "network";
      }
      const v = verdict(status);
      if (v === "wait") break;
      write(OUT_KEY, outbox().filter((x) => x.id !== it.id));
      if (v === "sent") sent++;
      else write(REFUSED_KEY, [...outboxRefused(), { id: it.id, desk: it.desk, label: it.label, error, at: it.at }].slice(-50));
    }
  } finally {
    flushing = false;
  }
  if (sent) window.dispatchEvent(new CustomEvent("outbox-sent", { detail: sent }));
  return sent;
}
