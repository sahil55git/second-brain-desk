// Which step of a counter bill is next, so the screen can pulse that one control for new staff (pure, tested).
export type GuideStep = "weigh" | "pick" | "save";

/**
 * weigh: nothing on the bill and nothing on the scale → put the item on the scale.
 * pick:  a weight is waiting (or no scale is in use) → tap the item it is.
 * save:  items are on the bill and nothing is waiting on the scale → pay and Save & Print.
 */
export function counterStep(a: { lines: number; kg: number; scaleOn: boolean }): GuideStep {
  if (a.kg > 0.0005) return "pick";
  if (a.lines > 0) return "save";
  return a.scaleOn ? "weigh" : "pick";
}
