// Cashier desk helpers (pure, tested): change to give back, quick note buttons, cash received from bills.
import { payStatus, type BillTrack } from "./counterTrack";

const r2 = (n: number) => Math.round(n * 100) / 100;

/** The customer gave `given` for `due`: change to return, or how much is still short. */
export function changeFor(due: number, given: number): { change: number; short: number } {
  const d = r2(due);
  const g = r2(given);
  return g >= d ? { change: r2(g - d), short: 0 } : { change: 0, short: r2(d - g) };
}

/** Up to four quick amounts for "Customer gave": the exact amount, then round figures at or above it. */
export function noteChips(due: number): number[] {
  const d = Math.ceil(r2(due));
  if (d <= 0) return [];
  const up = (step: number) => Math.ceil(d / step) * step;
  const set = new Set<number>([d, up(10), up(50), up(100), up(500), up(2000)]);
  return Array.from(set).sort((a, b) => a - b).slice(0, 4);
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
