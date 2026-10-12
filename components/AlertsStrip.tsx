"use client";

// Alerts for the main desk: one chip per alert, with a hover/tap pop-up that
// explains it and a quick action that opens the desk where it can be fixed.
// Dismissing hides an alert for this page visit only (not saved).
import { useMemo, useState } from "react";
import HoverCard from "./HoverCard";
import { deskAlerts, type AlertDesk } from "@/lib/alerts";
import type { BizData } from "@/lib/bizReports";

const SEVERITY_STYLE: Record<string, string> = {
  critical: "border-red-500/60 bg-red-500/10",
  caution: "border-amber-500/60 bg-amber-500/10",
  info: "border-black/15 dark:border-white/20",
};

export default function AlertsStrip({
  data,
  today,
  onOpen,
}: {
  data: Omit<BizData, "register">;
  today: string;
  onOpen: (desk: AlertDesk) => void;
}) {
  const [dismissed, setDismissed] = useState<string[]>([]);
  const alerts = useMemo(() => deskAlerts(data, today), [data, today]);
  const visible = alerts.filter((a) => !dismissed.includes(a.id));
  if (visible.length === 0) return null;

  return (
    <section aria-label="Alerts" className="mb-4 flex flex-wrap items-center gap-2">
      <span className="text-xs font-semibold uppercase tracking-wide opacity-60 mr-1">Alerts · {visible.length}</span>
      {visible.slice(0, 8).map((a) => (
        <HoverCard
          key={a.id}
          trigger={
            <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs ${SEVERITY_STYLE[a.severity]}`}>
              <span className="font-semibold">{a.area}</span>
              <span className="max-w-[16rem] truncate opacity-80">{a.message}</span>
            </span>
          }
        >
          <p className="text-xs uppercase tracking-wide opacity-60">{a.area} · {a.severity}</p>
          <p className="mt-1">{a.message}</p>
          <div className="mt-3 flex gap-2">
            <button type="button" onClick={() => onOpen(a.desk)} className="rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-[var(--accent-contrast)]">
              {a.action}
            </button>
            <button type="button" onClick={() => setDismissed((d) => [...d, a.id])} className="rounded-lg border border-black/15 dark:border-white/20 px-3 py-1.5 text-xs">
              Dismiss
            </button>
          </div>
        </HoverCard>
      ))}
      {visible.length > 8 && <span className="text-xs opacity-60">+{visible.length - 8} more in Reports</span>}
    </section>
  );
}
