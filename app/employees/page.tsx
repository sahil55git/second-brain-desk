// Employee ledger — one account per person: salary earned, advances, payments, running balance.
// Owner-only (the API refuses anyone else; the screen says so).
import EmployeeDesk from "@/components/employees/EmployeeDesk";
import "../barrels/barrels.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Employee ledger — Second Brain Desk" };

export default function EmployeesPage() {
  return <EmployeeDesk />;
}
