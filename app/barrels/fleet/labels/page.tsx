// Permanent barrel labels: /barrels/fleet/labels?codes=all|BRL-01,BRL-02&size=50x30&type=tare|id
import { Suspense } from "react";
import FleetLabels from "@/components/barrels/fleet/FleetLabels";
import "../../barrels.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Barrel labels (fleet) — Second Brain Desk" };

export default function FleetLabelsPage() {
  return (
    <Suspense fallback={null}>
      <FleetLabels />
    </Suspense>
  );
}
