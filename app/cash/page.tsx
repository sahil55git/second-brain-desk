// Cash tally desk — full-screen window for the daily counter-cash count.
// Staff and Owner may both use it (login required, via middleware.ts).
import CashDesk from "@/components/cash/CashDesk";
import "@/components/hub/hub.css";
import "../stock/stock.css";
import "./cash.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Cash tally — Second Brain Desk" };

export default function CashPage({ searchParams }: { searchParams?: { date?: string; session?: string } }) {
  const d = searchParams?.date && /^\d{4}-\d{2}-\d{2}$/.test(searchParams.date) ? searchParams.date : undefined;
  const s = searchParams?.session === "NIGHT" || searchParams?.session === "AFTERNOON" ? searchParams.session : undefined;
  return <CashDesk initialDate={d} initialSession={s} />;
}
