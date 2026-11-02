// Shop floor: packing (components/floor/FloorDesk.tsx).
import FloorDesk from "@/components/floor/FloorDesk";
import "@/components/hub/hub.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Packing — Second Brain Desk" };

export default function PackingPage() {
  return <FloorDesk tab="packing" />;
}
