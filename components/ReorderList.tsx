"use client";

// Shared reorder-and-hide list used by the Customize modal's Widgets and
// Columns sections (ported from the original artifact's Version 15/16
// pattern: every drag action there had an equivalent ↑/↓ button pair —
// this rebuild ships just the buttons, which is the same mechanism
// minus native HTML5 drag). "At least one item stays visible" is
// enforced here so the UI can never hide every widget/column on a desk.

import type { FieldDef } from "@/lib/desksConfig";
import { resolveOrder, type ListPrefs } from "@/lib/customize";

export default function ReorderList({
  allDefs,
  listPrefs,
  onChange,
}: {
  allDefs: FieldDef[];
  listPrefs: ListPrefs | undefined;
  onChange: (patch: Partial<ListPrefs>) => void;
}) {
  if (allDefs.length === 0) {
    return <p className="text-xs opacity-60">Nothing to customize here yet.</p>;
  }

  const allIds = allDefs.map((d) => d.id);
  const labelOf = (id: string) => allDefs.find((d) => d.id === id)?.label ?? id;
  const order = resolveOrder(allIds, listPrefs);
  const hidden = new Set(listPrefs?.hidden ?? []);
  const visibleCount = allIds.length - hidden.size;

  function move(id: string, dir: -1 | 1) {
    const idx = order.indexOf(id);
    const next = idx + dir;
    if (next < 0 || next >= order.length) return;
    const reordered = [...order];
    [reordered[idx], reordered[next]] = [reordered[next], reordered[idx]];
    onChange({ order: reordered });
  }

  function toggleHidden(id: string) {
    const isHidden = hidden.has(id);
    if (!isHidden && visibleCount <= 1) return; // refuse to hide the last visible one
    const nextHidden = isHidden
      ? Array.from(hidden).filter((h) => h !== id)
      : Array.from(hidden).concat(id);
    onChange({ hidden: nextHidden });
  }

  return (
    <ul className="space-y-1">
      {order.map((id, i) => {
        const isHidden = hidden.has(id);
        return (
          <li
            key={id}
            className={`flex items-center gap-2 rounded border border-black/10 dark:border-white/10 px-2 py-1 text-sm ${
              isHidden ? "opacity-50" : ""
            }`}
          >
            <div className="flex flex-col leading-none">
              <button
                type="button"
                onClick={() => move(id, -1)}
                disabled={i === 0}
                className="disabled:opacity-30"
                title="Move up"
              >
                ▲
              </button>
              <button
                type="button"
                onClick={() => move(id, 1)}
                disabled={i === order.length - 1}
                className="disabled:opacity-30"
                title="Move down"
              >
                ▼
              </button>
            </div>
            <span className="flex-1">{labelOf(id)}</span>
            <label className="flex items-center gap-1 text-xs opacity-70 whitespace-nowrap">
              <input type="checkbox" checked={!isHidden} onChange={() => toggleHidden(id)} />
              Visible
            </label>
          </li>
        );
      })}
    </ul>
  );
}
