// Which step of a counter bill is next, so the screen can pulse that one control for new staff (pure, tested).
export type GuideStep = "weigh" | "pick" | "pay" | "save";

/**
 * weigh: nothing on the bill and nothing on the scale → put the item on the scale.
 * pick:  a weight is waiting (or no scale is in use) → tap the item it is.
 * pay:   items are on the bill and no payment was tapped yet → choose Cash / UPI.
 * save:  items are on the bill and the payment is chosen → Save & Print.
 */
export function counterStep(a: { lines: number; kg: number; scaleOn: boolean; payChosen?: boolean }): GuideStep {
  if (a.kg > 0.0005) return "pick";
  if (a.lines > 0) return a.payChosen === false ? "pay" : "save";
  return a.scaleOn ? "weigh" : "pick";
}

/** After saving: what a held bill needs next, so the screen can flash that tick box. money → tick "received"; goods → give the goods. */
export function billGuide(a: { moneyDue: boolean; held: boolean }): "money" | "goods" | null {
  if (a.moneyDue) return "money";
  return a.held ? "goods" : null;
}
