// Tally hub — one window for every "count it and compare it" desk: job-work
// customer stock, seed, cake & by-products, packaging, udhar & supplier
// balances, tank dips. Staff and Owner may both use it (login via middleware).
import TalliesDesk from "@/components/tallies/TalliesDesk";
import "@/components/hub/hub.css";
import "../stock/stock.css";
import "../cash/cash.css";
import "./tallies.css";
import { DESK_IDS, type DeskId } from "@/lib/tallyDesks";

export const dynamic = "force-dynamic";
export const metadata = { title: "Tally hub — Second Brain Desk" };

export default function TalliesPage({ searchParams }: { searchParams?: { desk?: string; date?: string } }) {
  const d = searchParams?.date && /^\d{4}-\d{2}-\d{2}$/.test(searchParams.date) ? searchParams.date : undefined;
  const desk = DESK_IDS.includes(searchParams?.desk as DeskId) ? (searchParams?.desk as DeskId) : undefined;
  return <TalliesDesk initialDate={d} initialDesk={desk} />;
}
