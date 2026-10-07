// Manufacturing quick desk — barrels as cards, a month dashboard, one-tap step
// entry. Staff and Owner may both use it (login via middleware.ts).
import MfgQuick from "@/components/mfg/MfgQuick";
import "@/components/hub/hub.css";
import "../stock/stock.css";
import "../tallies/tallies.css";
import "./mfg.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Manufacturing — Second Brain Desk" };

export default function MfgPage() {
  return <MfgQuick />;
}
