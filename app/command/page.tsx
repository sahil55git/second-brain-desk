// 🛰️ Owner command centre (/command): one live screen.
import CommandCentre from "@/components/command/CommandCentre";
import "@/components/hub/hub.css";
import "@/components/insights/insights.css";
import { FeatureGate } from "@/lib/useFeatures";

export const dynamic = "force-dynamic";
export const metadata = { title: "Command centre — Second Brain Desk" };

export default function CommandPage() {
  return <FeatureGate k="commandCentre"><CommandCentre /></FeatureGate>;
}
