// Item / pack labels with barcode + QR: /labels (all items with a code) or /labels?items=id1,id2
import { Suspense } from "react";
import ItemLabels from "@/components/smart/ItemLabels";
import "../barrels/barrels.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Item labels — Second Brain Desk" };

export default function LabelsPage() {
  return (
    <Suspense fallback={null}>
      <ItemLabels />
    </Suspense>
  );
}
