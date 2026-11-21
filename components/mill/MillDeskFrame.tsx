"use client";

// Shows the Mill Desk screen (public/mill/desk.html, built from tools/mill-desk) full-screen and
// passes it the live scale reading from this phone's Bluetooth scale (or the Windows bridge).
// The screen saves its own data through /api/mill with this login.
import { useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { useScale } from "@/components/ScaleProvider";
import { scaleTapPlan } from "@/lib/mill/scaleTap";
import { scaleSetupHref } from "@/lib/scaleSetup";
import { isNative } from "@/lib/native";
import MillPrinterSheet from "@/components/mill/MillPrinterSheet";
import { printHtml } from "@/lib/mill/printWindow";
import { useKeepAwake } from "@/lib/keepAwake";
import { cleanDoc, docKey, dropUnprinted, explainPrintError, getMillPrinters, keepUnprinted, listUnprinted, onMillPrinterChange, onUnprintedChange, printerFor, printMillDoc, warmMillPrinter, type PrinterSlot } from "@/lib/mill/millPrint";

const FRESH_MS = 3000;

export default function MillDeskFrame() {
  const ref = useRef<HTMLIFrameElement>(null);
  useKeepAwake(); // a sleeping phone pauses the desk and can cut the scale / printer Bluetooth
  const { connected, selectedReading: reading, bt } = useScale();
  const { data: session } = useSession();
  const [sheet, setSheet] = useState<false | PrinterSlot>(false);
  const busyCodes = useRef(new Set<string>());
  const latest = useRef({ connected, reading, name: "" });
  latest.current = { connected, reading, name: bt.config?.name || reading?.scale_source || "" };

  const send = () => {
    const w = ref.current?.contentWindow;
    if (!w) return;
    const { connected: on, reading: r, name } = latest.current;
    const fresh = !!r && Date.now() - r.receivedAt < FRESH_MS;
    w.postMessage({ type: "scale", w: r && fresh ? r.weight : 0, connected: on, fresh, name }, window.location.origin);
  };
  const sendMe = () => {
    const w = ref.current?.contentWindow;
    const u = session?.user as { name?: string | null; role?: string } | undefined;
    if (w && u) w.postMessage({ type: "me", me: { name: u.name || "", isOwner: u.role === "OWNER" } }, window.location.origin);
  };

  const post = (m: Record<string, unknown>) => ref.current?.contentWindow?.postMessage(m, window.location.origin);
  const sendPrinter = () => {
    const p = getMillPrinters();
    const name = [p.receipt?.name, p.label?.name].filter(Boolean).join(" + ");
    post({ type: "printer", native: isNative(), name, ready: !!(p.receipt || p.label), pending: listUnprinted().length });
  };
  // one tap: the desk sends the slip, it prints at once; a slip that cannot print is kept and printed again with one tap
  const printOne = async (id: string, rawDoc: unknown, copies: number) => {
    const doc = cleanDoc(rawDoc);
    if (!doc) return post({ type: "print-result", id, ok: false, text: "Nothing to print." });
    const key = docKey(doc);
    if (busyCodes.current.has(key)) return; // a double tap while it is printing
    busyCodes.current.add(key);
    try {
      if (!isNative()) return post({ type: "print-result", id, ok: false, fallback: true, text: explainPrintError({ code: "NOT_APP" }).text });
      const cfg = printerFor(doc);
      if (!cfg) {
        keepUnprinted({ id, at: Date.now(), doc, copies, error: "No printer chosen" });
        post({ type: "print-result", id, ok: false, fix: "setup", text: explainPrintError({ code: "NO_PRINTER" }).text });
        setSheet(doc.kind === "slip" ? "receipt" : "label");
        return;
      }
      try {
        const r = await printMillDoc(doc, copies, cfg);
        dropUnprinted(key);
        post({ type: "print-result", id, ok: true, text: `Printed${r.pages > 1 ? ` (${r.pages} labels)` : ""} · ${(r.ms / 1000).toFixed(1)} s` });
      } catch (e) {
        const w = explainPrintError(e, cfg.name);
        keepUnprinted({ id, at: Date.now(), doc, copies, error: w.text });
        post({ type: "print-result", id, ok: false, fix: w.fix, text: w.text });
      }
    } finally {
      setTimeout(() => busyCodes.current.delete(key), 1500);
    }
  };
  const printPending = async () => {
    for (const j of listUnprinted()) await printOne(`${j.id}r`, j.doc, j.copies);
  };

  useEffect(() => {
    sendPrinter();
    warmMillPrinter();
    const t = setInterval(() => {
      if (document.visibilityState === "visible") warmMillPrinter();
    }, 120_000);
    const a = onMillPrinterChange(() => { sendPrinter(); warmMillPrinter(); });
    const b = onUnprintedChange(sendPrinter);
    return () => { clearInterval(t); a(); b(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(send, [connected, reading]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const t = setInterval(send, 400); // keeps "fresh" right when the scale goes quiet
    return () => clearInterval(t);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(sendMe, [session]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const on = (e: MessageEvent) => {
      if (e.origin !== window.location.origin || e.source !== ref.current?.contentWindow) return;
      const d = (e.data || {}) as { type?: string };
      if (d.type === "ready") {
        send();
        sendMe();
        sendPrinter();
      }
      if (d.type === "print") {
        const m = e.data as { id?: string; doc?: unknown; copies?: number };
        void printOne(String(m.id || `p${Date.now()}`), m.doc, Math.max(1, Math.min(10, Number(m.copies) || 1)));
      }
      if (d.type === "print-html") {
        const m = e.data as { html?: string; css?: string };
        if (typeof m.html === "string" && m.html.length < 2_000_000) printHtml(m.html, String(m.css || ""));
      }
      if (d.type === "printer-setup") setSheet("label");
      if (d.type === "print-pending") void printPending();
      if (d.type === "open" && (e.data as { to?: string }).to === "/mill/counter") window.location.href = "/mill/counter"; // barrel counter desk
      if (d.type === "scale-connect") {
        // tell the person what is going on, and do the one thing that can help
        const plan = scaleTapPlan({ support: bt.support, hasConfig: !!bt.config, status: bt.state.status, error: bt.state.error, name: bt.config?.name || "" });
        ref.current?.contentWindow?.postMessage({ type: "toast", text: plan.text, bad: plan.bad }, window.location.origin);
        if (plan.act === "setup") window.location.href = scaleSetupHref("/mill");
        else if (plan.act === "connect") bt.connect();
        else if (plan.act === "retry") bt.retryNow();
      }
    };
    window.addEventListener("message", on);
    return () => window.removeEventListener("message", on);
  }, [bt]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const html = document.documentElement;
    const prev = html.style.overflow;
    html.style.overflow = "hidden";
    return () => {
      html.style.overflow = prev;
    };
  }, []);

  return (
    <>
    {sheet && <MillPrinterSheet slot={sheet} onClose={() => { setSheet(false); sendPrinter(); }} />}
    <iframe
      ref={ref}
      src="/mill/desk.html"
      title="Mill Desk"
      allow="microphone; bluetooth; serial; clipboard-write"
      style={{ position: "fixed", inset: 0, width: "100%", height: "100dvh", border: 0, zIndex: 2147483000, background: "#05080C" }}
    />
    </>
  );
}
