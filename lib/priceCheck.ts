// Price check: compare the rate being entered with the last rate charged to
// the same party. Pure, so the hint and its wording are tested.

export interface PriceCheck {
  direction: "up" | "down" | "same";
  diffInr: number; // always positive; direction says which way
  text: string;
}

/** Null when there is nothing to compare (no rate entered, or no last rate). */
export function priceCheck(enteredRaw: string | number | null | undefined, lastRate: number | null | undefined): PriceCheck | null {
  const entered = Number(enteredRaw);
  if (enteredRaw === "" || enteredRaw === null || enteredRaw === undefined || !Number.isFinite(entered)) return null;
  if (lastRate === null || lastRate === undefined || !Number.isFinite(lastRate)) return null;
  const diff = Math.round((entered - lastRate) * 100) / 100;
  if (diff === 0) return { direction: "same", diffInr: 0, text: "same as last" };
  const direction = diff > 0 ? "up" : "down";
  const diffInr = Math.abs(diff);
  return { direction, diffInr, text: `${direction === "up" ? "↑" : "↓"} ₹${diffInr}` };
}
