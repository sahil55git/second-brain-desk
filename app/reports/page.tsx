// Reports & Dashboard hub — Owner only (middleware + /api/reports/hub check).
import ReportsHub from "@/components/hub/ReportsHub";
import "@/components/hub/hub.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Reports & Dashboard — Second Brain Desk" };

export default function ReportsPage() {
  return <ReportsHub />;
}
