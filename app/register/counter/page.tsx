// Weigh & Bill counter: full-screen till for selling by weight (Bluetooth / wireless scale in,
// receipt out). Same data and permissions as the Quick Register. Pin it as its own home-screen icon.
import type { Metadata } from "next";
import CounterApp from "@/components/counter/CounterApp";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Weigh & Bill — Mahadev Traders",
  // its own installable app on another device: Chrome ⋮ → Install app opens only the counter
  manifest: "/counter.webmanifest",
  appleWebApp: { capable: true, title: "Weigh & Bill" },
};

export default function CounterPage() {
  return <CounterApp />;
}
