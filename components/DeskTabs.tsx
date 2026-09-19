"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import type {
  DailyClosingDTO,
  JobWorkIntakeDTO,
  MfgBatchDTO,
  PartyDTO,
  ItemDTO,
  BusinessSettingsDTO,
} from "@/lib/types";
import JobWorkDesk from "./JobWorkDesk";
import DailyClosingDesk from "./DailyClosingDesk";
import ManufacturingDesk from "./ManufacturingDesk";
import ReportsDesk from "./ReportsDesk";
import PartiesDesk from "./PartiesDesk";
import InventoryDesk from "./InventoryDesk";
import SettingsDesk from "./SettingsDesk";

type Desk =
  | "jobwork"
  | "manufacturing"
  | "closing"
  | "reports"
  | "parties"
  | "inventory"
  | "settings";

export default function DeskTabs({
  initialJobWork,
  initialClosing,
  initialMfg,
  initialParties,
  initialItems,
  initialSettings,
  dbConnected,
}: {
  initialJobWork: JobWorkIntakeDTO[];
  initialClosing: DailyClosingDTO[];
  initialMfg: MfgBatchDTO[];
  initialParties: PartyDTO[];
  initialItems: ItemDTO[];
  initialSettings: BusinessSettingsDTO | null;
  dbConnected: boolean;
}) {
  const [active, setActive] = useState<Desk>("jobwork");
  const { data: session } = useSession();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const isOwner = (session?.user as any)?.role === "OWNER";

  const tabs: { key: Desk; label: string }[] = [
    { key: "jobwork", label: "Job-Work Desk" },
    { key: "manufacturing", label: "Manufacturing" },
    { key: "closing", label: "Daily Closing" },
    { key: "parties", label: "Parties" },
    { key: "inventory", label: "Inventory" },
    { key: "reports", label: "Reports & AI" },
    // Settings is Owner-only — Staff sessions never see the tab (and the
    // API route refuses them server-side even if they guess the URL).
    ...(isOwner ? [{ key: "settings" as const, label: "Settings" }] : []),
  ];

  return (
    <div>
      <nav className="flex flex-wrap gap-2 mb-6 border-b border-black/10 dark:border-white/10">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActive(tab.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              active === tab.key
                ? "border-[var(--accent)] text-[var(--accent-ink)]"
                : "border-transparent opacity-60 hover:opacity-100"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {active === "jobwork" && (
        <JobWorkDesk initialEntries={initialJobWork} dbConnected={dbConnected} />
      )}
      {active === "manufacturing" && (
        <ManufacturingDesk initialBatches={initialMfg} dbConnected={dbConnected} />
      )}
      {active === "closing" && (
        <DailyClosingDesk initialEntries={initialClosing} dbConnected={dbConnected} />
      )}
      {active === "parties" && (
        <PartiesDesk initialParties={initialParties} dbConnected={dbConnected} />
      )}
      {active === "inventory" && (
        <InventoryDesk initialItems={initialItems} dbConnected={dbConnected} />
      )}
      {active === "reports" && (
        <ReportsDesk
          jobWork={initialJobWork}
          closing={initialClosing}
          mfg={initialMfg}
          onNavigate={(desk) => setActive(desk === "mfg" ? "manufacturing" : desk)}
        />
      )}
      {active === "settings" && isOwner && (
        <SettingsDesk initialSettings={initialSettings} dbConnected={dbConnected} />
      )}
    </div>
  );
}
