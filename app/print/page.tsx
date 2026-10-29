// Print centre: /print. Open to every signed-in user; each tile shows only when that person may open its page.
import PrintCentre from "@/components/hub/PrintCentre";
import "@/components/hub/hub.css";
import "../barrels/barrels.css";
import "./print.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Print centre — Second Brain Desk" };

export default function PrintPage() {
  return <PrintCentre />;
}
