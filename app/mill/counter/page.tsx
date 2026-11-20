// Mill Counter Desk: the barrel receiving counter at the mill (lot received → gross, tare, net per barrel).
// Same data as /barrels (lots and barrels are the app's own records); this is the big-button counter screen,
// like Weigh & Bill is for selling. Pin it as its own home-screen app: Chrome ⋮ → Install app.
import type { Metadata, Viewport } from "next";
import MillCounterDesk from "@/components/mill/MillCounterDesk";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Mill Counter Desk — Mahadev Traders",
  manifest: "/mill-counter.webmanifest",
  appleWebApp: { capable: true, title: "Mill Counter" },
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#05080C" };

export default function MillCounterPage() {
  return <MillCounterDesk />;
}
