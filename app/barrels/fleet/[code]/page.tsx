// One barrel's page — what its QR label opens: /barrels/fleet/BRL-07
// Shows what is in it, where it is, its history, and the buttons to weigh it or send it out.
import FleetBarrelPage from "@/components/barrels/fleet/FleetBarrelPage";
import "../../barrels.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Barrel — Second Brain Desk" };

export default function BarrelPage({ params }: { params: { code: string } }) {
  return <FleetBarrelPage code={decodeURIComponent(params.code)} />;
}
