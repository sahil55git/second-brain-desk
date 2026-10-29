// Printer setup: /barrels/fleet/printers?kind=label|slip. Connect, save and test the printers used by the
// label and slip pages, on a page of their own.
import { Suspense } from "react";
import FleetPrinters from "@/components/barrels/fleet/FleetPrinters";
import "../../barrels.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Printer setup — Second Brain Desk" };

export default function FleetPrintersPage() {
  return (
    <Suspense fallback={null}>
      <FleetPrinters />
    </Suspense>
  );
}
