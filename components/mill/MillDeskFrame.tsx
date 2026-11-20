"use client";

// Shows the Mill Desk screen (public/mill/desk.html, built from tools/mill-desk) full-screen and
// passes it the live scale reading from this phone's Bluetooth scale (or the Windows bridge).
// The screen saves its own data through /api/mill with this login.
import { useEffect, useRef } from "react";
import { useSession } from "next-auth/react";
import { useScale } from "@/components/ScaleProvider";

const FRESH_MS = 3000;

export default function MillDeskFrame() {
  const ref = useRef<HTMLIFrameElement>(null);
  const { connected, selectedReading: reading, bt } = useScale();
  const { data: session } = useSession();
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
      }
      if (d.type === "open" && (e.data as { to?: string }).to === "/mill/counter") window.location.href = "/mill/counter"; // barrel counter desk
      if (d.type === "scale-connect") {
        // a scale set up on this phone before: connect again; otherwise open scale set-up
        if (bt.config) bt.connect();
        else window.location.href = "/?desk=scales";
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
    <iframe
      ref={ref}
      src="/mill/desk.html"
      title="Mill Desk"
      allow="microphone; bluetooth; serial; clipboard-write"
      style={{ position: "fixed", inset: 0, width: "100%", height: "100dvh", border: 0, zIndex: 2147483000, background: "#05080C" }}
    />
  );
}
