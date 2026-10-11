// Printouts: /barrels/print?slip=CODE (one barrel) · ?slips=LOT (every barrel of a lot) · ?report=LOT (lot weighment report)
import { Suspense } from "react";
import PrintSheet from "@/components/barrels/PrintSheet";
import "../barrels.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Barrel weighment print — Second Brain Desk" };

export default function PrintPage() {
  return (
    <Suspense fallback={null}>
      <PrintSheet />
    </Suspense>
  );
}
