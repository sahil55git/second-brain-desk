// Rules for the shop print queue: what a queued job may contain, and how its state moves.
// A phone / tablet queues a job; tools/print_helper.py on the shop PC claims and prints it.

export const QUEUE_MAX_ITEMS = 40;
export const QUEUE_MAX_COPIES = 50;
export const QUEUE_MAX_BYTES = 3_500_000; // all pictures of one job, base64 text; a serverless request body stops at about 4.5 MB
export const AGENT_ONLINE_MS = 20_000; // the helper asks for work every 2 s
export const PRINTING_STALE_MS = 3 * 60_000; // a job that has been "printing" this long was lost with the helper
export const QUEUED_STALE_MS = 6 * 3_600_000; // nobody printed it for hours: it is old news
export const PNG_B64_PREFIX = "iVBORw0KGgo"; // base64 of the PNG signature

export type JobKind = "label" | "slip";
export type JobStatus = "QUEUED" | "PRINTING" | "DONE" | "FAILED" | "CANCELLED";

export interface QueueItem {
  png: string;
  widthMm: number;
  heightMm: number | null;
}
export interface QueueJobInput {
  kind: JobKind;
  title: string;
  copies: number;
  items: QueueItem[];
}

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : Number.NaN);

/** Check a job sent by a browser. Returns the cleaned job or a message for the person. */
export function checkQueueJob(body: unknown): { ok: true; job: QueueJobInput } | { ok: false; error: string } {
  if (!body || typeof body !== "object") return { ok: false, error: "The print job is empty." };
  const b = body as Record<string, unknown>;
  const kind = b.kind === "slip" ? "slip" : b.kind === "label" ? "label" : null;
  if (!kind) return { ok: false, error: "Say whether this is a label or a slip." };
  const copies = Math.round(num(b.copies ?? 1));
  if (!(copies >= 1 && copies <= QUEUE_MAX_COPIES)) return { ok: false, error: `Copies must be 1 to ${QUEUE_MAX_COPIES}.` };
  const raw = b.items;
  if (!Array.isArray(raw) || raw.length === 0) return { ok: false, error: "There is nothing to print." };
  if (raw.length > QUEUE_MAX_ITEMS) return { ok: false, error: `At most ${QUEUE_MAX_ITEMS} labels in one job. Send the rest as a second job.` };
  let bytes = 0;
  const items: QueueItem[] = [];
  for (let i = 0; i < raw.length; i++) {
    const it = raw[i] as Record<string, unknown> | null;
    const png = it && typeof it.png === "string" ? it.png.replace(/^data:image\/png;base64,/, "") : "";
    if (!png.startsWith(PNG_B64_PREFIX) || !/^[A-Za-z0-9+/=]+$/.test(png)) return { ok: false, error: `Picture ${i + 1} is not a PNG image.` };
    bytes += png.length;
    if (bytes > QUEUE_MAX_BYTES) return { ok: false, error: "The pictures are too big for one job. Print fewer labels at a time." };
    const w = num(it?.widthMm);
    const h = it?.heightMm == null ? null : num(it.heightMm);
    if (!(w >= 10 && w <= 300) || (h !== null && !(h >= 10 && h <= 600))) return { ok: false, error: `Picture ${i + 1}: paper size must be 10 to 300 mm wide.` };
    items.push({ png, widthMm: Math.round(w * 10) / 10, heightMm: h === null ? null : Math.round(h * 10) / 10 });
  }
  const title = typeof b.title === "string" ? b.title.trim().slice(0, 80) : "";
  return { ok: true, job: { kind, title, copies, items } };
}

/** The helper shows up as online when it has asked for work in the last few seconds. */
export const agentOnline = (lastSeen: Date | string | null | undefined, now = Date.now()) => !!lastSeen && now - +new Date(lastSeen) < AGENT_ONLINE_MS;

/** What a person sees for a job. */
export function statusText(status: string, error?: string | null): string {
  switch (status) {
    case "QUEUED": return "Waiting for the shop printer";
    case "PRINTING": return "Printing…";
    case "DONE": return "Printed";
    case "FAILED": return error ? `Failed: ${error}` : "Failed";
    case "CANCELLED": return "Cancelled";
    default: return status;
  }
}

/** Can the person still cancel it / print it again? */
export const canCancel = (status: string) => status === "QUEUED";
export const canReprint = (status: string) => status === "DONE" || status === "FAILED" || status === "CANCELLED";
