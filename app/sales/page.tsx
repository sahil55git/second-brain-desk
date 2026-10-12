// Sales split view — bills of the day (list) + selected bill (detail).
import SalesSplit from "@/components/sales/SalesSplit";
import "@/components/hub/hub.css";
import "./sales.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sales — Second Brain Desk" };

export default function SalesPage() {
  return <SalesSplit />;
}
