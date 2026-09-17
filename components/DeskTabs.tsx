"use client";

import { useState } from "react";
import type { DailyClosingDTO, JobWorkIntakeDTO } from "@/lib/types";
import JobWorkDesk from "./JobWorkDesk";
import DailyClosingDesk from "./DailyClosingDesk";

type Desk = "jobwork" | "closing";

export default function DeskTabs({
  initialJobWork,
  initialClosing,
  dbConnected,
}: {
  initialJobWork: JobWorkIntakeDTO[];
  initialClosing: DailyClosingDTO[];
  dbConnected: boolean;
}) {
  const [active, setActive] = useState<Desk>("jobwork");

  return (
    <div>
      <nav className="flex gap-2 mb-6 border-b border-black/10 dark:border-white/10">
        {[
          { key: "jobwork" as const, label: "Job-Work Desk" },
          { key: "closing" as const, label: "Daily Closing" },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActive(tab.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              active === tab.key
                ? "border-amber-600 text-amber-700 dark:text-amber-400"
                : "border-transparent opacity-60 hover:opacity-100"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {active === "jobwork" ? (
        <JobWorkDesk initialEntries={initialJobWork} dbConnected={dbConnected} />
      ) : (
        <DailyClosingDesk initialEntries={initialClosing} dbConnected={dbConnected} />
      )}
    </div>
  );
}
