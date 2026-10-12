// Live alerts for the main desk header. Reuses the same deterministic
// attention list the Reports page shows, so the numbers always agree. Each
// alert is mapped to the desk where it can be acted on.
//
// Not included: udhaar balances (they need the Quick Register rows, which the
// main desk page does not load), and batch expiry (the data model has no
// expiry date yet).

import { attentionList, type Attention, type BizData } from "@/lib/bizReports";
import type { SearchDesk } from "@/lib/globalSearch";

export type AlertDesk = SearchDesk | "manufacturing" | "closing";

const AREA_DESK: Record<string, { desk: AlertDesk; action: string }> = {
  "Job-work": { desk: "jobwork", action: "Open job-work" },
  Manufacturing: { desk: "manufacturing", action: "Open batch" },
  "Fresh crush": { desk: "manufacturing", action: "Open batch" },
  Cash: { desk: "closing", action: "Open closing" },
  Stock: { desk: "inventory", action: "Open stock" },
  "Stock tally": { desk: "inventory", action: "Open stock" },
};

export interface DeskAlert extends Attention {
  desk: AlertDesk;
  action: string;
}

export function deskAlerts(data: Omit<BizData, "register">, today: string, nowMs = Date.now()): DeskAlert[] {
  return attentionList({ ...data, register: [] }, today, nowMs).map((a) => {
    const target = AREA_DESK[a.area] ?? { desk: "inventory" as AlertDesk, action: "Open" };
    return { ...a, desk: target.desk, action: target.action };
  });
}
