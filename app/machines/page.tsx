// ⚙️ Machines (/machines): log hours run, power meter units, stoppages and services for each
// expeller / filter press. The owner's report is in Insights → Machines.
import MachineLogDesk from "@/components/machines/MachineLogDesk";
import "@/components/hub/hub.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Machines — Second Brain Desk" };

export default function MachinesPage() {
  return <MachineLogDesk />;
}
