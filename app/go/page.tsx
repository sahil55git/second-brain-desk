// Quick links — a tile for every business function. Each tile is its own
// address, so it can be pinned to a phone home screen. Staff and Owner may
// both use it (login via middleware.ts); owner-only tiles are hidden for staff.
import QuickLinks from "@/components/go/QuickLinks";
import "@/components/hub/hub.css";
import "./go.css";

export const metadata = { title: "Quick links — Mahadev Traders" };

export default function GoPage() {
  return <QuickLinks />;
}
