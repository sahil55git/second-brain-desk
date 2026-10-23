// Our barrels — the shop's own reusable barrels: tare, full/empty weighing, where each one is.
// Staff and Owner may both use it (login via middleware.ts); registering and re-taring are owner-only.
import FleetDesk from "@/components/barrels/fleet/FleetDesk";
import "../barrels.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Our barrels — Second Brain Desk" };

export default function FleetPage() {
  return <FleetDesk />;
}
