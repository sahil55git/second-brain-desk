// Shop floor: dip (components/floor/FloorDesk.tsx).
import FloorDesk from "@/components/floor/FloorDesk";
import "@/components/hub/hub.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Dip — Second Brain Desk" };

export default function DipPage() {
  return <FloorDesk tab="dip" />;
}
