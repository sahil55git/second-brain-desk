// Shared IDs/labels for the customizable widget strips and ledger
// columns on each desk — the single source of truth both the Customize
// modal (labels + reorder/hide controls) and each desk component (which
// column/widget to actually render, and in what order) read from.
//
// Ported from the original Second Brain Desk artifact's Version 15/16
// customization system (widgets + columns, reorder + show/hide,
// per-browser via localStorage) — this rebuild's version of it.

export type DeskKey = "jobwork" | "closing" | "mfg";

export interface FieldDef {
  id: string;
  label: string;
}

export const DESK_LABELS: Record<DeskKey, string> = {
  jobwork: "Job-Work Desk",
  closing: "Daily Closing",
  mfg: "Manufacturing",
};

// Widget strips (the small stat cards at the top of a desk's ledger
// panel). Daily Closing has none today, hence the empty array — the
// Customize modal simply has nothing to show for it under Widgets.
export const WIDGET_DEFS: Record<DeskKey, FieldDef[]> = {
  jobwork: [
    { id: "khali", label: "Khali (cake) stock" },
    { id: "unsettled", label: "Unsettled entries" },
  ],
  closing: [],
  mfg: [
    { id: "settling", label: "Batches settling" },
    { id: "oilWeek", label: "Oil produced (7d)" },
    { id: "khaliWaste", label: "Self-crush khali/waste" },
    { id: "totalOil", label: "Total oil produced" },
  ],
};

// Ledger table columns, per desk.
export const COLUMN_DEFS: Record<DeskKey, FieldDef[]> = {
  jobwork: [
    { id: "time", label: "Time" },
    { id: "customer", label: "Customer" },
    { id: "vehicle", label: "Auto/Vehicle" },
    { id: "seed", label: "Seed kg" },
    { id: "cake", label: "Cake" },
    { id: "notes", label: "Notes" },
    { id: "status", label: "Status" },
    { id: "actions", label: "Actions" },
  ],
  closing: [
    { id: "time", label: "Time" },
    { id: "session", label: "Session" },
    { id: "systemCash", label: "System cash" },
    { id: "counterCash", label: "Counter cash" },
    { id: "diff", label: "Diff" },
    { id: "stock", label: "Stock" },
    { id: "actions", label: "Actions" },
  ],
  mfg: [
    { id: "date", label: "Date" },
    { id: "barrel", label: "Barrel" },
    { id: "item", label: "Item" },
    { id: "suppliers", label: "Suppliers" },
    { id: "steps", label: "Steps (1/2/3/4)" },
    { id: "status", label: "Status" },
    { id: "oil", label: "Oil" },
    { id: "cake", label: "Oil cake" },
    { id: "flags", label: "Flags" },
  ],
};
