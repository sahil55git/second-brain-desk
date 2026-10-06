// Stock tally desk — a full-screen window for the daily physical stock count.
// Staff and Owner may both use it (login required, via middleware.ts).
import StockDesk from "@/components/stock/StockDesk";
import "@/components/hub/hub.css";
import "./stock.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Stock tally — Second Brain Desk" };

export default function StockPage({ searchParams }: { searchParams?: { date?: string; session?: string } }) {
  const d = searchParams?.date && /^\d{4}-\d{2}-\d{2}$/.test(searchParams.date) ? searchParams.date : undefined;
  const s = searchParams?.session === "NIGHT" || searchParams?.session === "AFTERNOON" ? searchParams.session : undefined;
  return <StockDesk initialDate={d} initialSession={s} />;
}
