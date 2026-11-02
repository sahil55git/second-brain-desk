// Shop floor: count (components/floor/FloorDesk.tsx).
import FloorDesk from "@/components/floor/FloorDesk";
import "@/components/hub/hub.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Count — Second Brain Desk" };

export default function CountPage() {
  return <FloorDesk tab="count" />;
}
