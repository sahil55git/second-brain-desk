// Cashier desk: the manager's screen for taking the cash, seeing held bills and releasing goods.
import type { Metadata } from "next";
import CashierDesk from "@/components/counter/CashierDesk";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Cashier desk — Mahadev Traders" };

export default function CashierPage() {
  return <CashierDesk />;
}
