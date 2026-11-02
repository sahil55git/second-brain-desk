// 🛒 Customer orders (/orders): WhatsApp and phone orders — new → packed → delivered.
import OrdersDesk from "@/components/orders/OrdersDesk";
import "@/components/hub/hub.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Orders — Second Brain Desk" };

export default function OrdersPage() {
  return <OrdersDesk />;
}
