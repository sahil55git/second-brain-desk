"use client";

import { useState } from "react";
import type { DailyClosingDTO, JobWorkIntakeDTO, MfgBatchDTO } from "@/lib/types";
import JobWorkDesk from "./JobWorkDesk";
import DailyClosingDesk from "./DailyClosingDesk";
import ManufacturingDesk from "./ManufacturingDesk";
import ReportsDesk from "./ReportsDesk";

type Desk = "jobwork" | "manufacturing" | "closing" | "reports";

export default function DeskTabs({
  initialJobWork,
  initialClosing,
  initialMfg,
  dbConnected,
}: {
  initialJobWork: JobWorkIntakeDTO[];
  initialClosing: DailyClosingDTO[];
  initialMfg: MfgBatchDTO[];
  dbConnected: boolean;
}) {
  const [active, setActive] = useState<Desk>("jobwork");

  const tabs = [
    { key: "jobwork" as const, label: "Job-Work Desk" },
    { key: "manufacturing" as const, label: "Manufacturing" },
    { key: "closing" as const, label: "Daily Closing" },
    { key: "reports" as const, label: "Reports & AI" },
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
      {active === "reports" && (
        <ReportsDesk jobWork={initialJobWork} closing={initialClosing} mfg={initialMfg} />
      )}
    </div>
  );
}
