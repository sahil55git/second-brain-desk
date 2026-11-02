// Shop floor: maintenance (components/floor/FloorDesk.tsx).
import FloorDesk from "@/components/floor/FloorDesk";
import "@/components/hub/hub.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Maintenance — Second Brain Desk" };

export default function MaintenancePage() {
  return <FloorDesk tab="maintenance" />;
}
