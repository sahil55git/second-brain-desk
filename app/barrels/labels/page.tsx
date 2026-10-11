// Printable barrel labels for one lot: /barrels/labels?lot=R261010-1&size=a4|thermal
import LabelSheet from "@/components/barrels/LabelSheet";
import "../barrels.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Barrel labels — Second Brain Desk" };

export default function LabelsPage() {
  return <LabelSheet />;
}
