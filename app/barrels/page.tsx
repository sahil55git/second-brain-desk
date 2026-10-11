// Barrel receiving desk — oil bought in barrels: label, weigh full, weigh empty, reconcile.
// Staff and Owner may both use it (login via middleware.ts); staff get blind receiving.
import BarrelDesk from "@/components/barrels/BarrelDesk";
import "./barrels.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Barrel receiving — Second Brain Desk" };

export default function BarrelsPage() {
  return <BarrelDesk />;
}
