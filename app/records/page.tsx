// Proofs & scans — Owner only (middleware OWNER_ONLY_PATHS + server checks in /api/attachments).
import RecordsDesk from "@/components/proofs/RecordsDesk";
import "@/components/hub/hub.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Proofs & scans — Second Brain Desk" };

export default function RecordsPage() {
  return <RecordsDesk />;
}
