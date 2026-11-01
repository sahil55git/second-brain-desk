"use client";

// Inside the Android app only: makes the web pages use the phone for what a WebView cannot do
// by itself. window.print() goes to Android's printing; a file the page "downloads" (CSV,
// pictures, PDFs) is saved to Downloads and offered to share; navigator.share works (WhatsApp,
// Bluetooth, Drive…); tapping a reminder notification opens its page. Renders nothing.
import { useEffect } from "react";
import { useSession } from "next-auth/react";
import { AppEvents, LocalNotifications, MahadevNative, blobToBase64, isNative } from "@/lib/native";

let installed = false;

async function saveHref(href: string, name: string) {
  const blob = await (await fetch(href)).blob();
  await MahadevNative.saveFile({ name: name || "file", base64: await blobToBase64(blob), mime: blob.type || "application/octet-stream", share: true });
}

export function installNativeShims() {
  if (installed || !isNative()) return;
  installed = true;
  document.documentElement.classList.add("is-native");

  // Printing: Android's print service (Wi-Fi / Bluetooth printers, Save as PDF)
  window.print = () => {
    void MahadevNative.print({ name: document.title || "Mahadev" }).catch(() => {});
  };

  // Downloads made by the page (a.download + blob: / data: link)
  const click = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) {
    const href = this.href || "";
    if (this.hasAttribute("download") && (href.startsWith("blob:") || href.startsWith("data:"))) {
      void saveHref(href, this.getAttribute("download") || "file").catch(() => {});
      return;
    }
    return click.call(this);
  };
  document.addEventListener(
    "click",
    (e) => {
      const a = (e.target as HTMLElement | null)?.closest?.("a[download]") as HTMLAnchorElement | null;
      if (!a) return;
      const href = a.href || "";
      if (href.startsWith("blob:") || href.startsWith("data:")) {
        e.preventDefault();
        void saveHref(href, a.getAttribute("download") || "file").catch(() => {});
      }
    },
    true,
  );

  // Web Share: text through Android's share menu, files saved and shared
  const nav = navigator as Navigator & { canShare?: (d?: ShareData) => boolean };
  nav.share = async (d?: ShareData) => {
    const files = d?.files ?? [];
    if (files.length) {
      for (const f of files) await MahadevNative.saveFile({ name: f.name, base64: await blobToBase64(f), mime: f.type || "application/octet-stream", share: true });
      return;
    }
    const text = [d?.title && !d?.text?.includes(d.title) ? d.title : "", d?.text ?? "", d?.url ?? ""].filter(Boolean).join("\n");
    await MahadevNative.shareText({ text, title: d?.title });
  };
  nav.canShare = () => true;

  // A reminder tapped in the notification shade: open its page
  void LocalNotifications.addListener("localNotificationActionPerformed", (e) => {
    const url = e.notification?.extra?.url;
    if (url && url.startsWith("/")) window.location.href = url;
  }).catch(() => {});
  void AppEvents.addListener("appUrlOpen", (e) => {
    try {
      const u = new URL(e.url || "");
      if (u.origin === window.location.origin) window.location.href = u.pathname + u.search;
    } catch {
      /* not a link of ours */
    }
  }).catch(() => {});
}

const AUTO_KEY = "sbd_widgets_auto_v1";

/**
 * First time the app is signed in on a phone: switch the widgets on by themselves, so a widget
 * put on the home screen shows figures straight away instead of "Open the app". Done once; the
 * owner can switch it off in ☰ → Android app.
 */
async function autoWidgets(isOwner: boolean, who: string) {
  try {
    if (localStorage.getItem(AUTO_KEY)) return;
    const st = await MahadevNative.deviceStatus();
    if (st.on) {
      localStorage.setItem(AUTO_KEY, "already");
      return;
    }
    const info = await MahadevNative.info().catch(() => null);
    const name = `${info?.model || "Android phone"}${who ? ` · ${who}` : ""}`;
    const r = await fetch("/api/device/tokens", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.data?.token) return;
    await MahadevNative.setDevice({ baseUrl: window.location.origin, token: j.data.token, role: isOwner ? "OWNER" : "STAFF", name });
    localStorage.setItem(AUTO_KEY, "on");
  } catch {
    /* try again next time the app opens */
  }
}

export default function NativeBridge() {
  const { data: session, status } = useSession();
  useEffect(() => {
    installNativeShims();
  }, []);
  useEffect(() => {
    if (status !== "authenticated" || !isNative()) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const u = session?.user as any;
    void autoWidgets(u?.role === "OWNER", u?.name || "");
  }, [status, session]);
  return null;
}
