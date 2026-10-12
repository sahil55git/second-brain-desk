// POS counter mode — the Quick Register's single entry window with today's
// list beside it. Same data and permissions as /register (login required).
// Pin this page on the counter phone or laptop as its own app icon.
import type { Metadata } from "next";
import QuickRegister from "@/components/register/QuickRegister";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "POS — Mahadev Traders" };

export default function PosPage() {
  return <QuickRegister pos />;
}
