// Cashier desk helpers (pure, tested): change to give back, quick note buttons, cash received from bills.
import { payStatus, type BillTrack } from "./counterTrack";

const r2 = (n: number) => Math.round(n * 100) / 100;

/** The customer gave `given` for `due`: change to return, or how much is still short. */
export function changeFor(due: number, given: number): { change: number; short: number } {
  const d = r2(due);
  const g = r2(given);
  return g >= d ? { change: r2(g - d), short: 0 } : { change: 0, short: r2(d - g) };
}

/**
 * Quick amounts for "Customer gave": the exact amount first, then what a customer would really hand over.
 * Indian notes in use are 10, 20, 50, 100, 200 and 500 (no 2000), so the suggestions are the amount
 * topped up with one bigger note: 30 -> 50, 100, 500; 150 -> 200, 500; 1050 -> 1100, 1500.
 */
export function noteChips(due: number): number[] {
  const d = Math.ceil(r2(due));
  if (d <= 0) return [];
  const r = d % 500;
  const base = d - r;
  let picks: number[];
  if (r === 0) {
    picks = [base + 500, base + 1000]; // paid in 500s already: the next 500 or 1000
  } else {
    const notes = [10, 20, 50, 100, 200, 500].filter((n) => n > r && (r >= 100 || n !== 200));
    const big = notes[notes.length - 1];
    picks = notes.length > 3 ? [notes[0], notes[1], big] : notes;
    picks = picks.map((n) => base + n);
    if (picks.length < 2) {
      const round100 = Math.ceil(d / 100) * 100;
      if (round100 > d) picks.push(round100);
    }
  }
  const out = Array.from(new Set(picks.filter((v) => v > d))).sort((x, y) => x - y).slice(0, 3);
  return [d, ...out];
}

/** Cash that has really come in from these bills: bills taken at once, plus held bills whose cash was confirmed. */
export function cashReceived(bills: { modes: Record<string, number>; track: BillTrack }[]): number {
  let sum = 0;
  for (const b of bills) {
    const cash = b.modes.CASH || 0;
    if (cash > 0 && payStatus(b.modes, b.track).cashDue === 0) sum += cash;
  }
  return r2(sum);
}
