// Settings — Owner only (middleware OWNER_ONLY_PATHS + each API's own check).
import SettingsHub from "@/components/hub/SettingsHub";
import "@/components/hub/hub.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Settings — Second Brain Desk" };

export default function SettingsPage() {
  return <SettingsHub />;
}
