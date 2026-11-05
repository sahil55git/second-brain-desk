// 🧾 Purchase orders (/purchase-orders, owner): write, share, print and follow orders to suppliers.
import PoPage from "@/components/po/PoPage";
import "@/components/hub/hub.css";
import { FeatureGate } from "@/lib/useFeatures";

export const dynamic = "force-dynamic";
export const metadata = { title: "Purchase orders — Mahadev Traders" };

export default function PurchaseOrdersPage() {
  return <FeatureGate k="purchaseOrders"><PoPage /></FeatureGate>;
}
