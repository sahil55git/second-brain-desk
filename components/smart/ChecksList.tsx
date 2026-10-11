"use client";

// Live checks under a form (duplicates, totals, rates, GSTIN). Exact rules, no AI.
import type { Check } from "@/lib/smartEntry";

const STYLE: Record<Check["level"], string> = {
  alert: "border-red-400 text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950/30",
  warn: "border-amber-400 text-amber-800 dark:text-amber-200 bg-amber-50 dark:bg-amber-950/30",
  info: "border-sky-300 text-sky-800 dark:text-sky-200 bg-sky-50 dark:bg-sky-950/30",
};
const ICON: Record<Check["level"], string> = { alert: "🚨", warn: "⚠️", info: "ℹ️" };

export default function ChecksList({ checks, okText }: { checks: Check[]; okText?: string }) {
  if (!checks.length) return okText ? <div className="text-xs text-emerald-700 dark:text-emerald-400">✓ {okText}</div> : null;
  const order = { alert: 0, warn: 1, info: 2 };
  return (
    <ul className="space-y-1" aria-label="Checks">
      {[...checks].sort((a, b) => order[a.level] - order[b.level]).map((c, i) => (
        <li key={i} className={`rounded border px-2 py-1 text-xs ${STYLE[c.level]}`}>
          {ICON[c.level]} {c.msg}
        </li>
      ))}
    </ul>
  );
}
