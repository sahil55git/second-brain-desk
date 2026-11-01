"use client";

// Inside the Android app only: makes the web pages use the phone for what a WebView cannot do
// by itself. window.print() goes to Android's printing; a file the page "downloads" (CSV,
// pictures, PDFs) is saved to Downloads and offered to share; navigator.share works (WhatsApp,
// Bluetooth, Drive…); tapping a reminder notification opens its page. Renders nothing.
import { useEffect } from "react";
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

export default function NativeBridge() {
  useEffect(() => {
    installNativeShims();
  }, []);
  return null;
}
