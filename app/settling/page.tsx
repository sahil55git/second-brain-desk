// Shop floor: settling (components/floor/FloorDesk.tsx).
import FloorDesk from "@/components/floor/FloorDesk";
import "@/components/hub/hub.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Settling — Second Brain Desk" };

export default function SettlingPage() {
  return <FloorDesk tab="settling" />;
}
