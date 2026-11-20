// Mill Desk: the Mill 1 floor screen (300 kg iScale S-18 over Bluetooth). Worker mode (icons only,
// weigh and Save & Print) and Counter mode (job-work tokens, Waiting, Jobs, Held, Our mill runs,
// voice assistant). Pin it as its own home-screen app: Chrome ⋮ → Install app.
import type { Metadata, Viewport } from "next";
import MillDeskFrame from "@/components/mill/MillDeskFrame";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Mill Desk — Mahadev Traders",
  manifest: "/mill.webmanifest",
  appleWebApp: { capable: true, title: "Mill Desk" },
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#05080C" };

export default function MillPage() {
  return <MillDeskFrame />;
}
