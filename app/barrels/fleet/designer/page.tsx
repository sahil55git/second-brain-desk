// Label & receipt designer: /barrels/fleet/designer?kind=label|slip
import { Suspense } from "react";
import DesignerApp from "@/components/barrels/designer/DesignerApp";
import "../../barrels.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Label designer — Second Brain Desk" };

export default function DesignerPage() {
  return (
    <Suspense fallback={null}>
      <DesignerApp />
    </Suspense>
  );
}
