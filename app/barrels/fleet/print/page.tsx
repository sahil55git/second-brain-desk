// Printouts: /barrels/fleet/print?slip=EVENTID (one weighing or trip) · ?register=1 (fleet report)
import { Suspense } from "react";
import FleetPrint from "@/components/barrels/fleet/FleetPrint";
import "../../barrels.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Barrel print — Second Brain Desk" };

export default function FleetPrintPage() {
  return (
    <Suspense fallback={null}>
      <FleetPrint />
    </Suspense>
  );
}
