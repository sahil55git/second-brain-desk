"use client";

// A thin bar, on every page, for entries saved while there was no internet (lib/outbox.ts):
// how many are waiting, a Send now button, and any entry the server refused with its reason.
// Shows nothing when there is nothing waiting and nothing refused.
import { useCallback, useEffect, useState } from "react";
import { dismissRefused, flushOutbox, outbox, outboxRefused, OUT_EVENT, type OutItem, type OutRefused } from "@/lib/outbox";

const DESK: Record<string, string> = { jobwork: "Job-work", mfg: "Manufacturing", barrels: "Barrels" };
const hm = (t: number) => new Date(t).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });

export default function OutboxBar() {
  const [waiting, setWaiting] = useState<OutItem[]>([]);
  const [refused, setRefused] = useState<OutRefused[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [online, setOnline] = useState(true);

  const refresh = useCallback(() => {
    setWaiting(outbox());
    setRefused(outboxRefused());
    setOnline(typeof navigator === "undefined" ? true : navigator.onLine);
  }, []);
  const send = useCallback(async () => {
    setBusy(true);
    try {
      await flushOutbox();
    } finally {
      setBusy(false);
      refresh();
    }
  }, [refresh]);

  useEffect(() => {
    refresh();
    const onOnline = () => void send();
    window.addEventListener(OUT_EVENT, refresh);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", refresh);
    // try on load and every 30 s while something is waiting (the "online" event is not reliable on every phone)
    void send();
    const t = window.setInterval(() => {
      if (outbox().length) void send();
    }, 30000);
    return () => {
      window.removeEventListener(OUT_EVENT, refresh);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", refresh);
      window.clearInterval(t);
    };
  }, [refresh, send]);

  if (!waiting.length && !refused.length) return null;

  return (
    <div className="sticky top-0 z-40 border-b border-amber-400 bg-amber-50 text-amber-950 dark:bg-amber-950 dark:text-amber-100 dark:border-amber-700 px-3 py-1.5 text-sm print:hidden">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-2">
        {!!waiting.length && (
          <>
            <strong>{waiting.length} entr{waiting.length === 1 ? "y" : "ies"} saved on this device, not yet sent.</strong>
            <span className="opacity-80">{online ? "Sending when the server answers." : "No internet."}</span>
            <button onClick={() => void send()} disabled={busy} className="rounded border border-current px-2 py-0.5 disabled:opacity-50">{busy ? "Sending…" : "Send now"}</button>
          </>
        )}
        {!!refused.length && <strong className="text-red-700 dark:text-red-300">{refused.length} entr{refused.length === 1 ? "y was" : "ies were"} refused. Enter again.</strong>}
        <button className="underline" onClick={() => setOpen((v) => !v)}>{open ? "Hide" : "Show"}</button>
      </div>
      {open && (
        <div className="mx-auto max-w-5xl pt-1 text-xs space-y-0.5">
          {waiting.map((w) => <div key={w.id}>⏳ {hm(w.at)} · {DESK[w.desk] || w.desk} · {w.label}</div>)}
          {refused.map((r) => (
            <div key={r.id} className="text-red-700 dark:text-red-300">
              ✗ {hm(r.at)} · {DESK[r.desk] || r.desk} · {r.label}: {r.error}{" "}
              <button className="underline" onClick={() => { dismissRefused(r.id); refresh(); }}>I entered it again, remove</button>
            </div>
          ))}
          <div className="opacity-70">Do not clear this browser&apos;s data or uninstall the app while entries are waiting.</div>
        </div>
      )}
    </div>
  );
}
