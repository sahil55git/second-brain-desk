// Shop floor: godown (components/floor/FloorDesk.tsx).
import FloorDesk from "@/components/floor/FloorDesk";
import "@/components/hub/hub.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Godown — Second Brain Desk" };

export default function GodownPage() {
  return <FloorDesk tab="godown" />;
}
